# App GLME

Formulário web para geração de **GLME (Guia de Liberação de Mercadoria Estrangeira)** a partir de dados de:
- **DI (Declaração de Importação)** via XML exportado do SISCOMEX
- **DUIMP** via upload de PDF ou API do Portal Único (autenticação clientId/clientSecret)

Produção: https://glme.brados.app.br — VPS Hostinger (`ssh vps`, IP `187.127.44.148`), DNS no Registro.br com registro A

## Stack

- **Frontend**: React 19 + TypeScript + Vite + Tailwind CSS 4 + shadcn/ui
- **Backend**: Express + tRPC v11, em container Docker no VPS
- **Banco de dados**: Postgres 17 no VPS (Docker), via Drizzle ORM e driver `postgres` (postgres.js)
- **Hospedagem**: VPS Hostinger com Docker; Caddy faz o HTTPS automático. Vercel e Supabase só como plano de volta da migração de 10/11/2026
- **Package manager**: pnpm 10.4.1

## Estrutura

```
deploy/vps/
  Dockerfile, docker-compose.yml  # Imagem e serviço do app no VPS
  publicar.sh               # Publica uma tag no VPS (roda no PC; --ativar coloca no ar, --voltar desfaz)
  copiar-supabase.sh        # Copia o Supabase para o VPS, recriando o banco e conferindo por md5
  backup-glme               # Backup de hora em hora, cifrado com age e copiado para o Google Drive
api/trpc/                   # Só para o Vercel (legado): sai junto com o projeto no Vercel
  [trpc].js                 # Função serverless: toda a API tRPC (/api/trpc/*)
  duimp.consultarAPI.js     # Mesma API, função separada com maxDuration 60s (Portal Único)
  sefaz.consultarCadastro.js # Mesma API, função separada com maxDuration 30s (SEFAZ-PE)
client/src/
  pages/Home.tsx            # Página única com o formulário GLME
  components/glme/          # Seção, blocos de ação, diálogos DI/DUIMP e cadastro de empresas, situação fiscal da adição
  lib/aliquotasICMS.ts      # Anexo I (PE) e consulta hierárquica de alíquota por NCM
  lib/calculoICMS.ts        # Motor do ICMS: divisor por alíquota, rateios, grupos e memória de cálculo
  lib/calculoFormulario.ts  # Liga o formulário ao motor (modo por adição ou pelos totais)
  lib/extrairTextoPDF.ts    # Extração de texto do PDF da DUIMP no navegador (pdfjs-dist)
  components/               # Componentes UI (shadcn + customizados)
server/
  _core/app.ts              # App Express + tRPC, sem listen()
  _core/index.ts            # Servidor (pnpm dev com Vite; no VPS, dist/index.js com estáticos)
  routers.ts                # Endpoints tRPC (CNPJ, importadores, recintos, DI, DUIMP, usuários)
  db.ts                     # Acesso ao banco de dados
  duimpParser.ts            # Parser do texto do extrato DUIMP
  recintosSiscomex.ts       # Leitor do CSV da tabela oficial Recinto Aduaneiro (Portal Único)
  data/RecintoAduaneiro.csv # Cópia da tabela oficial usada na última importação
  sefazCadastro.ts          # Webservice CadConsultaCadastro4 (IE e situação cadastral) com certificado A1
  certs/icpBrasil.ts        # Raiz ICP-Brasil v10 (a SEFAZ usa cadeia ICP-Brasil, fora do repositório do Node)
  cripto.ts                 # AES-256-GCM para segredos no banco (CHAVE_CRIPTOGRAFIA)
  chavePortal.ts            # Decifra a chave de acesso do Portal Único da empresa, só no servidor
  scripts/seedAdmin.ts      # pnpm db:seed — cria o admin inicial
  scripts/configurarCertificado.ts  # pnpm certificado:configurar — grava o e-CNPJ A1 no .env (senha sem eco)
  scripts/importarRecintos.ts  # pnpm recintos:importar — atualiza os recintos pela tabela do Siscomex
  scripts/migrarMysqlParaPostgres.ts  # pnpm db:migrar-dados — migração única MySQL -> Postgres
shared/                     # Tipos e constantes compartilhados
  sefazUF.ts                # Por UF: webservice de consulta cadastral (15 UFs) e link de consulta (27)
drizzle/
  schema.ts                 # Schema do banco (users, importadores, recintos, usuario_empresas, importador_chaves_portal)
  0000_*.sql, 0001_*.sql    # Migrações Postgres (baseline + unaccent/RLS)
  0002_*.sql                # Vínculo usuário ↔ empresas (e chave por usuário, trocada na 0003/0004)
  0003_*.sql, 0004_*.sql    # Chave de acesso do Portal Único passa a ser por empresa (com RLS)
  0005_*.sql                # Tipo de recinto "outro" (tabela oficial do Siscomex)
vercel.json                 # Só para o Vercel (legado)
```

## Configuração local

1. Instalar Node.js 20+ (a imagem do VPS usa 22) e pnpm 10.4.1
2. Copiar `.env.example` para `.env` e preencher as variáveis
3. `pnpm install`
4. Abrir o túnel até o Postgres do VPS, em um terminal à parte: `ssh -N -L 55432:127.0.0.1:5432 vps`
5. `pnpm db:push` — aplica migrações pendentes (usa `DIRECT_URL`)
6. `pnpm db:seed` — só em banco novo, para criar o primeiro admin
7. `pnpm dev` — servidor em http://localhost:3000

> **Atenção:** o `.env` local deve apontar para o `glme_dev`. Apontado para o banco `glme`, o `pnpm dev` lê e grava nos dados reais.

## Variáveis de ambiente

| Variável | Obrigatória | Descrição |
|---|---|---|
| `DATABASE_URL` | Sim | Postgres do VPS. Local: `postgresql://glme_dev:<senha>@127.0.0.1:55432/glme_dev` (túnel). No VPS: host `postgres`, porta 5432 |
| `DIRECT_URL` | Para migrações | Igual à `DATABASE_URL`, pelo túnel. Usada por `db:push` e `db:migrar-dados` |
| `JWT_SECRET` | Sim | Chave para cookies de sessão |
| `VITE_APP_ID` | Sim | `glme`. Entra no payload da sessão; sem ela nenhum login se sustenta |
| `PORT` | Não | Porta do servidor (padrão 3000) |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | Só no seed | `db:seed` exige `ADMIN_PASSWORD` (mín. 6 caracteres, diferente de `admin123`) |
| `MYSQL_URL` | Só na migração | Origem MySQL para `db:migrar-dados` (uso único) |
| `CERTIFICADO_A1_BASE64` | Não | Arquivo .pfx do e-CNPJ A1 em base64 — consulta de IE nas SEFAZ |
| `CERTIFICADO_A1_SENHA` | Com o certificado | Senha do .pfx |
| `PORTAL_UNICO_AMBIENTE` | Não | `producao` (padrão) ou `validacao` — ambiente da API da DUIMP |
| `CHAVE_CRIPTOGRAFIA` | Para salvar chaves | 32 bytes em base64, diferente por ambiente — cifra o Client-Secret do Portal Único. A de produção fica no `.env` do VPS e precisa ter cópia fora dele |

## Versões e ambientes

| Ambiente | Branch | Onde roda | Banco (Postgres do VPS) |
|---|---|---|---|
| **Produção** | `master` | https://glme.brados.app.br | `glme` |
| **Desenvolvimento** | `develop` e `feature/*` | `pnpm dev` local, com túnel SSH | `glme_dev` |

- **Nunca commite direto na `master`**: ela guarda o que está publicado.
- O `glme_dev` tem a mesma estrutura da produção, os recintos e só um admin de teste — nenhum dado real.
- Versões seguem SemVer e são marcadas com tag `vX.Y.Z` na `master`.

### Fluxo de trabalho

1. Trabalhe na `develop`. Mudanças grandes: `feature/<nome>` saindo da `develop`, com merge de volta nela.
2. Teste localmente, contra o `glme_dev`.
3. Mudou o schema? `pnpm drizzle-kit generate` e aplique **primeiro no `glme_dev`** (`pnpm db:push` pelo túnel).

### Migrações compatíveis (produção continua no ar)

A migração vai para a produção **antes** do código novo, então a versão antiga precisa continuar funcionando com o banco já migrado:

- **Pode** numa versão: criar tabela, adicionar coluna **nula ou com default**, criar índice.
- **Não pode** na mesma versão: remover/renomear coluna ou tabela, tornar coluna `NOT NULL` sem default, mudar tipo.
- Para remover ou renomear: adicione o novo em uma versão, migre o código, e remova o antigo **na versão seguinte**.

### Publicar uma versão

1. Na `develop`: atualize `version` no `package.json` (estrutural/incompatível = MAJOR, funcionalidade = MINOR, correção = PATCH), rode `pnpm check` e `pnpm test`.
2. Aplique as migrações pendentes **na produção** (`pnpm db:push` pelo túnel, com `DIRECT_URL` do banco `glme`).
3. Merge `develop` → `master`, tag `vX.Y.Z` e push da `master` e da tag.
4. Publique: `deploy/vps/publicar.sh vX.Y.Z --ativar`.
5. Confira https://glme.brados.app.br (login, recintos, busca de importadores).

### Voltar atrás

- **Código**: `deploy/vps/publicar.sh --voltar` volta para a imagem ativa anterior. Depois, `git revert` na `master`.
- **Banco**: migrações não são desfeitas automaticamente — por isso a regra de compatibilidade acima.

## Deploy (VPS)

- O app roda no serviço `glme-app` de `/opt/apps/glme`, na rede Docker `web`. O `.env` fica nessa pasta, fora do repositório.
  Depois de alterar o `.env`, recrie o container (`docker compose up -d --force-recreate glme-app`).
- O Caddy (`/opt/apps/infra/Caddyfile`) publica o domínio e renova o certificado. É compartilhado com o app `estimativa`:
  use `caddy reload`, nunca reinicie o container sem necessidade. Só adicione um domínio depois que o DNS apontar para o VPS.
- `deploy.sh` e `pnpm start` são do deploy **antigo** na VM do Google Cloud com MySQL — obsoletos.

## Banco (VPS)

- Postgres 17 em Docker (`/opt/apps/infra`), publicado só em `127.0.0.1:5432`. Bancos `glme` (papel `glme`) e `glme_dev`
  (papel `glme_dev`), com senhas em `/opt/apps/glme/.db-pass` e `.db-pass-dev`. Acesso externo só por túnel SSH.
- **RLS habilitado sem políticas**: herança do Supabase, sem efeito sobre o dono das tabelas. O app precisa conectar como
  dono; com outro papel as consultas voltam vazias e o login mostra "Usuário ou senha inválidos".
- Extensão `unaccent` no schema `extensions`, usada na busca de importadores.
- Migrações novas: altere `drizzle/schema.ts` e rode `pnpm db:push` pelo túnel.
- Algumas migrações foram aplicadas fora do drizzle-kit e registradas à mão em `drizzle.__drizzle_migrations`, com o mesmo
  hash do arquivo (0000–0005 estão registradas); o `db:push` não as reaplica.
- **Backup**: `/usr/local/bin/backup-glme`, de hora em hora (minuto 30), cifrado com age, em `/opt/backups/glme` e na pasta
  `GLME-backups` do Google Drive. Retenção de 7 dias, 4 semanas e 6 meses. A chave privada **não** fica no VPS; sem ela
  nenhum backup pode ser restaurado.
- **Supabase e Vercel** (migração de 10/11/2026): o projeto Supabase `GLME` ficou em somente leitura e o Vercel, intacto, como
  plano de volta. Para voltar: repor o CNAME `glme` para o Vercel e rodar `ALTER DATABASE postgres RESET
  default_transaction_read_only` no Supabase; o que foi gravado no VPS precisa ser copiado de volta.

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
- **Cadastro de empresas** (botão "Cadastro" na barra de ações, `CadastroEmpresasDialog`): lista com busca, "Usar na
  guia" e edição com consulta à Receita e à SEFAZ da UF, edital DBF e chave de acesso do Portal Único **da empresa**
  (Client-Id / Client-Secret). A seção Importador só mostra um resumo (cadastrada, edital, chave disponível) e o botão
  "Abrir cadastro"; o edital da empresa cadastrada preenche a guia. O Client-Secret é cifrado (AES-256-GCM, tabela
  separada de importadores) e nunca volta ao navegador; a tela mostra só o fim do Client-Id. Trocar/remover a chave:
  admin, usuário vinculado à empresa ou, se ainda não há chave, quem está cadastrando. Quem **cria** o cadastro fica
  vinculado ("Minhas empresas", no cabeçalho).
- **DUIMP pela API** (`server/portalUnico.ts`): a janela de importação pede só número e versão (em branco = vigente);
  a chave é a da empresa (seção Importador, ou escolhida entre as que têm chave), usada só por admin ou usuário
  vinculado. Autentica em `/portal/api/autenticar/chave-acesso` (headers Client-Id, Client-Secret, Role-Type IMPEXP;
  token em Set-Token, X-CSRF-Token renovado a cada resposta), reaproveita a sessão por 50 min (reautenticar em
  menos de 60 s dá PLAT-ER2033) e busca versão vigente, dados gerais e itens (100 por página). As adições seguem o
  bloco oficial `adicoes` da DUIMP; tributos pelo valor a recolher (como na DI). `PORTAL_UNICO_AMBIENTE=validacao`
  aponta para o ambiente de testes da Receita.
- **Recinto alfandegado**: o cadastro é a tabela oficial "Recinto Aduaneiro" do Portal Único (900 recintos),
  importada por `pnpm recintos:importar [arquivo.csv]` (`server/recintosSiscomex.ts` lê o CSV; `--simular` só mostra).
  O código fica no formato D.DD.DD.DD, sem dígito verificador — a tabela oficial não o traz e ele não é dedutível.
  Ficam de fora os códigos fictícios, repetidos em centenas de linhas (8888888 estabelecimento exportador,
  2222222 entrada/saída ficta, 5555555 ponto virtual de fronteira) e os de vigência encerrada. O tipo vem dos
  dígitos 4-5 do código (11/12 aeroporto, 13/21 porto, 31/32 porto seco) ou da descrição; o que não se encaixa
  fica como `outro` (migração 0005). Cidade e UF saem do fim da descrição ("IPOJUCA/PE"), quando houver.
  O campo busca no cadastro enquanto se digita (nome, cidade, UF, tipo ou código, sem acento); ao escolher,
  preenche o código completo e a UF de desembaraço. A API da DUIMP não traz o recinto de armazenamento
  (só `carga.recintoEntrega` em situação especial de despacho); DI e DUIMP casam o código de 7 dígitos com o
  cadastro (`recintoPorCodigo`).
- **Lista negativa com exoneração confirmada**: a separação é por NCM, mas a lista impede produtos específicos.
  Cada adição de tributação normal tem o botão "Incluir na guia (exonerar)" (`exonerarAdicao`), que a move para
  `produtos` com `exoneradaManual: true`; o ICMS passa a ser diferido, o valor entra na base e no campo 5.5, e a
  linha "NÃO CONSTA NA GLME" some da memória impressa. "Desfazer exoneração" (`tributarAdicao`) faz o caminho de
  volta. Reimportar a declaração refaz a separação pela NCM e desfaz as escolhas.
- **UF de recolhimento** acompanha a UF do importador sempre que ela é preenchida (`useGLMEForm`).
- **Adquirente**: cada importação e o "Limpar" marcam "Mesmo do importador"; só desmarca quando a declaração indica
  conta e ordem ou encomenda (na DUIMP, `caracterizacaoImportacao.ni` do item).
- **Funções dedicadas (só no Vercel, legado)**: `api/trpc/duimp.consultarAPI.js` (60s) e `api/trpc/sefaz.consultarCadastro.js` (30s)
  só existem para ter `maxDuration` maior; `server/_core/app.ts` reconstrói o caminho quando o Vercel
  entrega a rota dinâmica reescrita.
- **Cálculo do ICMS**: `(valor aduaneiro + tributos + despesas aduaneiras) ÷ (1 − alíquota) × alíquota`, com o
  divisor da alíquota **da mercadoria** (informativo SEFAZ-PE "Comércio Exterior", item 2.5). Adições com
  alíquotas diferentes formam grupos separados. Taxa Siscomex, taxas de anuentes e IOF-câmbio são rateados pelo
  **peso líquido**, como o e-Fisco faz na DMI (valor aduaneiro se faltar o peso de alguma adição); o AFRMM
  (opcional, fora da base na DMI oficial) também pelo peso. Cada adição aceita alíquota informada à mão, que
  prevalece sobre a da NCM. NCM fora do Anexo I (ex.: 3923.30.90) fica em 20,5%, mesmo que o
  e-Fisco aplique outra na DMI. O rateio inclui as adições de
  tributação normal. Sem os valores de cada adição (ex.: extrato da DUIMP em PDF), o cálculo cai para os totais
  da declaração, com aviso.
- **PDF da guia**: o campo 5.4 da frente traz uma linha por alíquota; o verso, a memória completa (VT, VTI, VF).
- **Inscrição estadual**: após a consulta do CNPJ na Receita, o app consulta a SEFAZ da UF do importador.
  Webservice CadConsultaCadastro4 em 15 UFs (AM, BA, GO, MG, MS, MT, PE, PR, RS, SP e, pela SVRS, AC, ES, PB,
  RN, SC — Portal da NF-e). As demais (AL, AP, CE, DF, MA, PA, PI, RJ, RO, RR, SE, TO) não têm o serviço: a tela
  mostra o link oficial de consulta da UF e o CCC nacional. Endereços em `shared/sefazUF.ts`.
  Teste real (18/09/2026) com o e-CNPJ da Brados (RJ): **PE, AM, GO, MG e PR respondem**; AC, BA, ES, MS, PB, RN,
  RS, SC e SP recusam com cStat 257 (só atendem certificado de empresa habilitada a emitir NF-e na UF); MT devolve
  cStat 215 (formato) mesmo com cabeçalho nfeCabecMsg. Nesses casos a tela explica e mostra o link de consulta.
  O .pfx da Brados vem com RC2-40 (formato antigo): `pnpm certificado:configurar` o converte para AES-256.
- **TLS das SEFAZ**: raiz ICP-Brasil v10 embarcada (conferida contra o repositório do ITI); MG usa Sectigo R46,
  já presente no Node. Nunca desligar a verificação TLS. Rotas `sefaz.*` exigem login (usam o certificado da empresa).

## Funcionalidades principais

- Formulário GLME em página única com navegação por âncoras: UF de recolhimento, Importador, Adquirente, Declaração, Adições / itens, ICMS
- Importação unificada **DI / DUIMP**: `.xml` vai para o parser da DI, `.pdf` para o da DUIMP (API do Portal Único como opção secundária)
- Cada adição mostra a alíquota de recolhimento (`consultarAliquotaNCM`: a regra mais específica do Anexo I vence — NCM, subitem, subposição, posição ou capítulo — senão 20,5%) e os itens da DUIMP que a compõem
- Importação XML de DI: extrai importador, adições (NCM, impostos), dados da declaração, calcula ICMS
- Importação DUIMP: via PDF (extraído no navegador) ou API do Portal Único com a chave de acesso da empresa
  (todos os itens, com valor aduaneiro, tributos e peso)
- Filtragem pela lista negativa do Edital 060/2025 (NCMs com tributação normal vs diferimento)
- Cálculo automático de ICMS por alíquota, com rateio das despesas aduaneiras e memória de cálculo na guia
- Geração de PDF com layout oficial da GLME (jsPDF, no navegador)
- Cadastro de empresas na seção Importador: CNPJ (BrasilAPI / ReceitaWS), inscrição estadual pela SEFAZ da UF,
  edital DBF e chave de acesso do Portal Único
- Login local (usuário/senha, scrypt) e administração de usuários
- 158 testes automatizados (vitest)

## Comandos

```bash
pnpm dev              # Desenvolvimento local (server + vite HMR)
pnpm build            # Build usado na imagem do VPS (cliente + dist/index.js)
pnpm check            # Typecheck (tsc --noEmit)
pnpm test             # Testes (vitest)
pnpm db:push          # Gerar e aplicar migrações (usa DIRECT_URL)
pnpm db:seed          # Criar admin inicial (exige ADMIN_PASSWORD)
pnpm db:migrar-dados  # Migração única MySQL -> Postgres (MYSQL_URL + DIRECT_URL)
pnpm certificado:configurar "C:\caminho\cert.pfx"  # Confere o A1 (titular/validade) e grava no .env
```
- 09/11/2026: cadastro de recintos trocado na produção pela tabela oficial do Siscomex (52 → 900), com
  `recintos_backup_20261109` guardando a lista antiga e a migração 0005 (tipo "outro") aplicada por SQL.
