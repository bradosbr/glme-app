#!/bin/bash
# Copia um banco do Supabase para o Postgres do VPS, RECRIANDO o banco de destino.
# Rode no VPS. Não exibe nenhum segredo.
#
#   copiar-supabase.sh --origem /opt/apps/glme/.env.prod --destino glme --recriar
#   copiar-supabase.sh --dump arquivo.dump --destino glme_ensaio --recriar   # sem conferência
#
# A origem é a linha DATABASE_URL do arquivo indicado. Termina com erro se qualquer
# tabela divergir (contagem e md5 das linhas).
set -euo pipefail
# Os "docker ... -i" não podem consumir a entrada de quem chamou o script.
exec </dev/null

ORIGEM=""; DUMP=""; DESTINO=""; RECRIAR=""
while [ $# -gt 0 ]; do
  case "$1" in
    --origem) ORIGEM="$2"; shift 2;;
    --dump) DUMP="$2"; shift 2;;
    --destino) DESTINO="$2"; shift 2;;
    --recriar) RECRIAR=1; shift;;
    *) echo "Opção desconhecida: $1" >&2; exit 1;;
  esac
done

[ -n "$RECRIAR" ] || { echo "Este script apaga o banco de destino: passe --recriar." >&2; exit 1; }
[ -n "$ORIGEM$DUMP" ] || { echo "Informe --origem ou --dump." >&2; exit 1; }

cd /opt/apps/glme
case "$DESTINO" in
  glme|glme_ensaio) PAPEL=glme; ARQ_SENHA=.db-pass;;
  glme_dev) PAPEL=glme_dev; ARQ_SENHA=.db-pass-dev;;
  *) echo "Destino não permitido: $DESTINO" >&2; exit 1;;
esac

# Migração 0005 (tipo de recinto "outro"): aplicada por SQL na produção, fora do histórico.
HASH_0005=63fcbf6573b7e3c76743cb3e153db62a93271a84f66cfb38bcfc0ff3e2656b0d
QUANDO_0005=1794234552254

SUPER() { docker exec -i infra-postgres-1 psql -U postgres -v ON_ERROR_STOP=1 -AtX "$@"; }
PG() { docker run --rm -i --network web -e PGTZ=UTC -e SRC -e DST -e Q postgres:17 "$@"; }

if ! [ "$(SUPER -c "select 1 from pg_roles where rolname='$PAPEL'")" = 1 ]; then
  [ -s "$ARQ_SENHA" ] || { (umask 077; openssl rand -hex 24 > "$ARQ_SENHA"); }
  SUPER -c "create role $PAPEL login password '$(cat "$ARQ_SENHA")'" >/dev/null
  echo "== papel $PAPEL criado"
fi
DST="postgresql://$PAPEL:$(cat "$ARQ_SENHA")@postgres:5432/$DESTINO"
export DST
SRC=""

if [ -n "$ORIGEM" ]; then
  SRC=$(grep '^DATABASE_URL=' "$ORIGEM" | cut -d= -f2- | tr -d '"\r')
  # pg_dump não funciona pelo transaction pooler (6543): usa o session pooler (5432)
  SRC=${SRC/:6543\//:5432\/}
  export SRC
  mkdir -p /opt/backups/supabase
  DUMP="/opt/backups/supabase/${DESTINO}_supabase_$(date +%Y-%m-%d_%H%M).dump"
  echo "== gerando dump"
  (umask 077; PG sh -c 'pg_dump "$SRC" -Fc -n public -n drizzle -T public.recintos_backup_20261109 --no-owner --no-privileges' > "$DUMP")
  ls -lh "$DUMP" | awk '{print $5, $9}'
fi
[ -s "$DUMP" ] || { echo "Dump vazio ou inexistente: $DUMP" >&2; exit 1; }

echo "== recriando o banco $DESTINO"
SUPER -c "drop database if exists \"$DESTINO\" with (force)" >/dev/null
SUPER -c "create database \"$DESTINO\" owner $PAPEL template template0 encoding 'UTF8' locale_provider icu icu_locale 'en-US' locale 'en_US.utf8'" >/dev/null
SUPER -d "$DESTINO" >/dev/null <<SQL
create schema extensions;
create extension unaccent with schema extensions;
grant usage on schema extensions to $PAPEL;
-- O dump de "-n public" recria o schema; assim ele nasce com o dono certo.
drop schema public;
SQL

echo "== restaurando"
PG sh -c 'pg_restore -d "$DST" --no-owner --no-privileges --exit-on-error --single-transaction' < "$DUMP"

if [ -n "$SRC" ]; then
  echo "== conferindo (contagem e md5 das linhas)"
  LISTA="select schemaname||'.'||tablename from pg_tables where schemaname in ('public','drizzle') and tablename <> 'recintos_backup_20261109' order by 1"
  DIFERENCAS=0
  for T in $(Q="$LISTA" PG sh -c 'psql "$SRC" -AtX -c "$Q"'); do
    C="select count(*)||' '||md5(coalesce(string_agg(t::text,'|' order by id),'')) from $T t"
    A=$(Q="$C" PG sh -c 'psql "$SRC" -AtX -c "$Q"')
    B=$(Q="$C" PG sh -c 'psql "$DST" -AtX -c "$Q"' 2>/dev/null || echo ausente)
    if [ "$A" = "$B" ]; then S=OK; else S=DIFERENTE; DIFERENCAS=$((DIFERENCAS+1)); fi
    printf '%-40s %-8s %s\n' "$T" "${A%% *}" "$S"
  done
  [ "$DIFERENCAS" = 0 ] || { echo "PAROU: $DIFERENCAS tabela(s) divergente(s)." >&2; exit 1; }
fi

echo "== ajustes"
Q="
insert into drizzle.__drizzle_migrations (hash, created_at)
select '$HASH_0005', $QUANDO_0005
where exists (select 1 from pg_enum e join pg_type t on t.oid=e.enumtypid where t.typname='recinto_tipo' and e.enumlabel='outro')
  and not exists (select 1 from drizzle.__drizzle_migrations where hash='$HASH_0005');
select setval('public.users_id_seq', (select max(id) from public.users), true)
where (select max(id) from public.users) >= (select case when is_called then last_value + 1 else last_value end from public.users_id_seq);
" PG sh -c 'psql "$DST" -v ON_ERROR_STOP=1 -AtXq -c "$Q"' >/dev/null

echo "== estado final"
Q="
select 'migracoes: '||count(*) from drizzle.__drizzle_migrations
union all select 'donos: '||string_agg(distinct pg_get_userbyid(relowner), ',') from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and relkind='r'
union all select 'rls ligado: '||count(*) filter (where relrowsecurity)||' de '||count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and relkind='r'
union all select 'unaccent: '||extensions.unaccent('São João')
union all select 'users: maior id '||coalesce((select max(id) from public.users),0)||', proximo da sequencia '||(select case when is_called then last_value + 1 else last_value end from public.users_id_seq)
" PG sh -c 'psql "$DST" -AtX -c "$Q"'
echo "== FIM: $DESTINO"
