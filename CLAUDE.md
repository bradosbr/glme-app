# App GLME

Formulário web para geração de **GLME (Guia de Liberação de Mercadoria Estrangeira)** a partir de dados de:
- **DI (Declaração de Importação)** via XML exportado do SISCOMEX
- **DUIMP** via upload de PDF ou API do Portal Único (autenticação clientId/clientSecret)

Produção: https://glme-app.vercel.app — domínio próprio `glme.brados.com.br` (DNS no Registro.br, apontando para o Vercel via CNAME)

## Stack

- **Frontend**: React 19 + TypeScript + Vite + Tailwind CSS 4 + shadcn/ui
- **Backend**: Express + tRPC v11, rodando como função serverless no Vercel
- **Banco de dados**: Postgres no Supabase, via Drizzle ORM e driver `postgres` (postgres.js)
- **Hospedagem**: Vercel (frontend no CDN, funções em `gru1` / São Paulo); Supabase em `sa-east-1`
- **Package manager**: pnpm 10.4.1

## Estrutura

```
api/trpc/
  [trpc].js                 # Função serverless: toda a API tRPC (/api/trpc/*)
  duimp.consultarAPI.js     # Mesma API, função separada com maxDuration 60s (Portal Único)
client/src/
  pages/Home.tsx            # Página principal com o formulário GLME
  lib/extrairTextoPDF.ts    # Extração de texto do PDF da DUIMP no navegador (pdfjs-dist)
  components/               # Componentes UI (shadcn + customizados)
server/
  _core/app.ts              # App Express + tRPC, sem listen() — base da função do Vercel
  _core/index.ts            # Servidor local (pnpm dev / pnpm start), com Vite ou estáticos
  routers.ts                # Endpoints tRPC (CNPJ, importadores, recintos, DI, DUIMP, usuários)
  db.ts                     # Acesso ao banco de dados
  duimpParser.ts            # Parser do texto do extrato DUIMP
  scripts/seedAdmin.ts      # pnpm db:seed — cria o admin inicial
  scripts/migrarMysqlParaPostgres.ts  # pnpm db:migrar-dados — migração única MySQL -> Postgres
shared/                     # Tipos e constantes compartilhados
drizzle/
  schema.ts                 # Schema do banco (users, importadores, recintos)
  0000_*.sql, 0001_*.sql    # Migrações Postgres (baseline + unaccent/RLS)
vercel.json                 # Build, estáticos, região, maxDuration e fallback do SPA
```

## Configuração local

1. Instalar Node.js 20+ (o Vercel usa 22.x) e pnpm 10.4.1
2. Copiar `.env.example` para `.env` e preencher as variáveis
3. `pnpm install`
4. `pnpm db:push` — aplica migrações pendentes (usa `DIRECT_URL`)
5. `pnpm db:seed` — só em banco novo, para criar o primeiro admin
6. `pnpm dev` — servidor em http://localhost:3000

> **Atenção:** se o `.env` apontar para o Supabase de produção, o `pnpm dev` lê e grava nos dados reais.
> Para desenvolver sem risco, use um projeto Supabase separado.

## Variáveis de ambiente

| Variável | Obrigatória | Descrição |
|---|---|---|
| `DATABASE_URL` | Sim | Supabase **transaction pooler** (porta 6543), usuário `postgres.<project-ref>` |
| `DIRECT_URL` | Para migrações | Conexão direta (IPv6) ou **session pooler** (porta 5432). Usada por `db:push` e `db:migrar-dados` |
| `JWT_SECRET` | Sim | Chave para cookies de sessão |
| `VITE_APP_ID` | Sim | `glme`. Entra no payload da sessão; sem ela nenhum login se sustenta |
| `PORT` | Não | Porta do servidor local (padrão 3000; ignorada no Vercel) |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | Só no seed | `db:seed` exige `ADMIN_PASSWORD` (mín. 6 caracteres, diferente de `admin123`) |
| `MYSQL_URL` | Só na migração | Origem MySQL para `db:migrar-dados` (uso único) |

Na connection string, substitua `[YOUR-PASSWORD]` **inclusive os colchetes** pela senha.
Senha entre colchetes gera `password authentication failed` no pooler.

## Versões e ambientes

| Ambiente | Branch | Onde roda | Banco (Supabase) |
|---|---|---|---|
| **Produção** | `master` | https://glme-app.vercel.app | `GLME` (ref `eokfulfwpywxapexwsbt`) |
| **Desenvolvimento** | `develop` e `feature/*` | Preview do Vercel (exige login no Vercel) e `pnpm dev` local | `GLME-dev` (ref `uolfnxelzznrwohbxieg`) |

- **Nunca commite direto na `master`**: todo push nela publica em produção.
- O `GLME-dev` tem a mesma estrutura da produção, os 52 recintos e só um admin de teste — nenhum dado real.
- O `.env` local e as variáveis de **Preview** do Vercel devem apontar para o `GLME-dev`.
- Versões seguem SemVer e são marcadas com tag `vX.Y.Z` na `master` (`v1.0.0` = primeira versão no Vercel).

### Fluxo de trabalho

1. Trabalhe na `develop`. Mudanças grandes: `feature/<nome>` saindo da `develop`, com merge de volta nela.
2. Acompanhe pelo preview da `develop` ou localmente.
3. Mudou o schema? `pnpm drizzle-kit generate` e aplique **primeiro no `GLME-dev`** (`pnpm db:push` com `DIRECT_URL` do dev).

### Migrações compatíveis (produção continua no ar)

A migração vai para a produção **antes** do código novo, então a versão antiga precisa continuar funcionando com o banco já migrado:

- **Pode** numa versão: criar tabela, adicionar coluna **nula ou com default**, criar índice.
- **Não pode** na mesma versão: remover/renomear coluna ou tabela, tornar coluna `NOT NULL` sem default, mudar tipo.
- Para remover ou renomear: adicione o novo em uma versão, migre o código, e remova o antigo **na versão seguinte**.

### Publicar uma versão

1. Na `develop`: atualize `version` no `package.json` (estrutural/incompatível = MAJOR, funcionalidade = MINOR, correção = PATCH), rode `pnpm check` e `pnpm test`.
2. Aplique as migrações pendentes **na produção** (`pnpm db:push` com `DIRECT_URL` da produção).
3. Merge `develop` → `master`, tag `vX.Y.Z` e push da `master` e da tag. O Vercel publica sozinho.
4. Confira https://glme-app.vercel.app (login, recintos, busca de importadores).

### Voltar atrás

- **Código**: Vercel → Deployments → deploy anterior → **Instant Rollback** (segundos). Depois, `git revert` na `master`.
- **Banco**: migrações não são desfeitas automaticamente — por isso a regra de compatibilidade acima.

## Deploy (Vercel)

- Push na `master` publica em produção automaticamente (build: `pnpm run build:vercel`).
- Variáveis de ambiente são **sensíveis** e ficam em **Production**. Alterar uma variável só vale após **Redeploy**.
- Previews de outras branches ficam atrás do login do Vercel e não têm as variáveis de produção.
- `deploy.sh` e `pnpm start` são do deploy **antigo** na VM do Google Cloud com MySQL — obsoletos.

## Banco (Supabase)

- Projeto `GLME` (ref `eokfulfwpywxapexwsbt`, região `sa-east-1`).
- **RLS habilitado sem políticas, de propósito**: bloqueia a Data API pública (chave anônima).
  O app conecta como `postgres` (dono das tabelas, `bypassrls`), então não é afetado.
  O advisor do Supabase mostra "RLS Enabled No Policy" (INFO) — é esperado.
- Extensão `unaccent` no schema `extensions`, usada na busca de importadores.
- Migrações novas: altere `drizzle/schema.ts` e rode `pnpm db:push` com `DIRECT_URL` apontando para o
  session pooler (5432). Não use o transaction pooler (6543) para migrações.
- As duas primeiras migrações foram aplicadas fora do drizzle-kit e registradas manualmente em
  `drizzle.__drizzle_migrations`; o `db:push` não as reaplica.

## Comportamentos que não são óbvios

- **Busca de importadores** usa `extensions.unaccent(...) ILIKE`, ignorando maiúsculas e acentos
  (reproduz o comportamento do MySQL `utf8mb4_unicode_ci`).
- **Datas** são `timestamptz`; `updatedAt` é preenchido pelo Drizzle (`$onUpdate`) em todo `update()`.
- **PDF da DUIMP**: o texto é extraído no navegador reproduzindo o `getText()` do pdf-parse 2.4.5
  (mesmas quebras de linha); o servidor recebe só o texto. `pdfjs-dist` fica fixado em 5.4.296.
- **Rotas protegidas**: importadores, recintos, `di.parsearXML`, `duimp.parsearPDF` e `duimp.consultarAPI`
  exigem login (`protectedProcedure`); usuários exigem admin.
- **"Usuário ou senha inválidos"** também aparece quando o app está sem banco (`DATABASE_URL` vazia ou
  malformada). Se aparecer com credenciais corretas, confira a variável antes da senha.
- **Função dedicada**: `api/trpc/duimp.consultarAPI.js` só existe para ter `maxDuration` de 60s;
  `server/_core/app.ts` reconstrói o caminho quando o Vercel entrega a rota dinâmica reescrita.

## Funcionalidades principais

- Formulário GLME com 5 abas: Estado de Recolhimento, Importador/Adquirente, Dados da Declaração, Adições, ICMS
- Importação XML de DI: extrai importador, adições (NCM, impostos), dados da declaração, calcula ICMS
- Importação DUIMP: via PDF (extraído no navegador) ou API Portal Único
- Filtragem pela lista negativa do Edital 060/2025 (NCMs com tributação normal vs diferimento)
- Cálculo automático de ICMS: `(BaseCalculo + II + IPI + PIS + COFINS + TaxaSISCOMEX) ÷ 0,795 × alíquota`
- Geração de PDF com layout oficial da GLME (jsPDF, no navegador)
- Cadastro de importadores com busca por CNPJ (BrasilAPI / ReceitaWS)
- Login local (usuário/senha, scrypt) e administração de usuários
- 52 testes automatizados (vitest)

## Comandos

```bash
pnpm dev              # Desenvolvimento local (server + vite HMR)
pnpm build:vercel     # Build usado pelo Vercel (cliente + dist/server/app.js)
pnpm check            # Typecheck (tsc --noEmit)
pnpm test             # Testes (vitest)
pnpm db:push          # Gerar e aplicar migrações (usa DIRECT_URL)
pnpm db:seed          # Criar admin inicial (exige ADMIN_PASSWORD)
pnpm db:migrar-dados  # Migração única MySQL -> Postgres (MYSQL_URL + DIRECT_URL)
```
