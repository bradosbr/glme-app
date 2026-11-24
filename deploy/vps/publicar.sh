#!/bin/bash
# Publica no VPS uma versão já marcada com tag. Rode na raiz do repositório, no PC.
#
#   deploy/vps/publicar.sh v1.3.0            # só gera a imagem glme-app:1.3.0
#   deploy/vps/publicar.sh v1.3.0 --ativar   # gera a imagem e coloca no ar
#   deploy/vps/publicar.sh --voltar          # volta para a imagem ativa anterior
#
# O host SSH vem de GLME_VPS (padrão: o alias "vps" do ~/.ssh/config).
set -euo pipefail

VPS="${GLME_VPS:-vps}"
APP=/opt/apps/glme

ativar_remoto='cd '"$APP"' && docker compose up -d --no-build --force-recreate glme-app && sleep 5 && docker logs --tail 3 glme-glme-app-1'

if [ "${1:-}" = "--voltar" ]; then
  ssh "$VPS" "docker image inspect glme-app:anterior >/dev/null && docker tag glme-app:anterior glme-app:latest && $ativar_remoto"
  exit 0
fi

TAG="${1:?Informe a tag, por exemplo v1.3.0}"
git rev-parse -q --verify "refs/tags/$TAG^{commit}" >/dev/null || { echo "Tag $TAG não existe." >&2; exit 1; }
VERSAO="${TAG#v}"

echo "== Enviando $TAG"
ssh "$VPS" "cat > $APP/Dockerfile" < deploy/vps/Dockerfile
ssh "$VPS" "cat > $APP/docker-compose.yml" < deploy/vps/docker-compose.yml
git archive "$TAG" | ssh "$VPS" "set -e; rm -rf $APP/releases/$TAG; mkdir -p $APP/releases/$TAG; tar -x -C $APP/releases/$TAG"

echo "== Gerando glme-app:$VERSAO"
ssh "$VPS" "docker build -q -t glme-app:$VERSAO -f $APP/Dockerfile $APP/releases/$TAG"

if [ "${2:-}" = "--ativar" ]; then
  echo "== Colocando $TAG no ar"
  ssh "$VPS" "docker tag glme-app:latest glme-app:anterior; docker tag glme-app:$VERSAO glme-app:latest; $ativar_remoto"
fi
echo "== Fim"
