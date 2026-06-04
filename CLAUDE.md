# App GLME

Formulário web para geração de **GLME (Guia de Liberação de Mercadoria Estrangeira)** a partir de dados de:
- **DI (Declaração de Importação)** via XML exportado do SISCOMEX
- **DUIMP** via upload de PDF ou API do Portal Único (autenticação clientId/clientSecret)

## Stack

- **Frontend**: React 19 + TypeScript + Vite + Tailwind CSS 4 + shadcn/ui
- **Backend**: Express + tRPC v11
- **Banco de dados**: MySQL via Drizzle ORM (importadores e recintos)
- **Package manager**: pnpm

## Estrutura

```
client/src/         # Frontend React
  pages/Home.tsx    # Página principal com o formulário GLME
  components/       # Componentes UI (shadcn + customizados)
server/             # Backend Express
  routers.ts        # Endpoints tRPC (CNPJ, importadores, recintos, DI, DUIMP)
  db.ts             # Acesso ao banco de dados
  duimpParser.ts    # Parser de PDF de extrato DUIMP
shared/             # Tipos compartilhados
drizzle/schema.ts   # Schema do banco (users, importadores, recintos)
```

## Configuração

1. Instalar Node.js 20+ e pnpm
2. Copiar `.env.example` para `.env` e preencher as variáveis
3. `pnpm install`
4. `pnpm db:push` (cria as tabelas no MySQL)
5. `pnpm dev` (servidor em http://localhost:3000)

## Variáveis de ambiente

| Variável | Obrigatória | Descrição |
|---|---|---|
| `DATABASE_URL` | Sim | Conexão MySQL |
| `JWT_SECRET` | Sim | Chave para cookies de sessão |
| `PORT` | Não | Porta do servidor (padrão 3000) |

## Funcionalidades principais

- Formulário GLME com 5 abas: Estado de Recolhimento, Importador/Adquirente, Dados da Declaração, Adições, ICMS
- Importação XML de DI: extrai importador, adições (NCM, impostos), dados da declaração, calcula ICMS
- Importação DUIMP: via PDF ou API Portal Único
- Filtragem pela lista negativa do Edital 060/2025 (NCMs com tributação normal vs diferimento)
- Cálculo automático de ICMS: `(BaseCalculo + II + IPI + PIS + COFINS + TaxaSISCOMEX) ÷ 0,795 × alíquota`
- Geração de PDF com layout oficial da GLME
- Cadastro de importadores com busca por CNPJ (BrasilAPI / ReceitaWS)
- 52 testes automatizados (vitest)

## Comandos

```bash
pnpm dev       # Desenvolvimento (server + vite HMR)
pnpm build     # Build de produção
pnpm test      # Rodar testes (vitest)
pnpm db:push   # Gerar e aplicar migração no banco
```
