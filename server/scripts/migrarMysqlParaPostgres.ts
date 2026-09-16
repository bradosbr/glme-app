/**
 * Migra os dados do MySQL atual para o Postgres (Supabase) — execução manual, uma vez.
 *
 *   pnpm db:migrar-dados -- --simular   # valida tudo, não grava nada
 *   pnpm db:migrar-dados                # migra de fato
 *
 * Variáveis:
 *   MYSQL_URL     origem, ex.: mysql://usuario:senha@host:3306/glme
 *   DIRECT_URL    destino (recomendado: conexão direta ou session pooler 5432);
 *                 se ausente, usa DATABASE_URL
 *
 * Pré-requisitos no destino: migrações aplicadas (`pnpm db:push`) e tabelas vazias.
 *
 * Garantias:
 *  - Tudo numa transação: ou migra as três tabelas, ou nada.
 *  - IDs preservados; sequências ajustadas para o próximo cadastro não colidir.
 *  - Datas lidas do MySQL em UTC (o MySQL converte TIMESTAMP pelo fuso da sessão).
 *  - Ao final, relê o Postgres e compara linha a linha com a origem.
 *  - Nunca imprime conteúdo das linhas nem credenciais.
 */
import "dotenv/config";
import mysql from "mysql2/promise";
import postgres from "postgres";

type Linha = Record<string, unknown>;

type Coluna = {
  nome: string;
  tipo: "int" | "texto" | "bool" | "data" | "enum";
  nulo: boolean;
  tamanho?: number;
  valores?: readonly string[];
};

// Espelha drizzle/schema.ts — a ordem de inserção respeita a ordem aqui
const TABELAS: { nome: string; colunas: Coluna[] }[] = [
  {
    nome: "users",
    colunas: [
      { nome: "id", tipo: "int", nulo: false },
      { nome: "openId", tipo: "texto", nulo: false, tamanho: 64 },
      { nome: "username", tipo: "texto", nulo: true, tamanho: 64 },
      { nome: "passwordHash", tipo: "texto", nulo: true, tamanho: 255 },
      { nome: "name", tipo: "texto", nulo: true },
      { nome: "email", tipo: "texto", nulo: true, tamanho: 320 },
      { nome: "loginMethod", tipo: "texto", nulo: true, tamanho: 64 },
      { nome: "role", tipo: "enum", nulo: false, valores: ["user", "admin"] },
      { nome: "active", tipo: "bool", nulo: false },
      { nome: "resetRequested", tipo: "bool", nulo: false },
      { nome: "createdAt", tipo: "data", nulo: false },
      { nome: "updatedAt", tipo: "data", nulo: false },
      { nome: "lastSignedIn", tipo: "data", nulo: false },
    ],
  },
  {
    nome: "importadores",
    colunas: [
      { nome: "id", tipo: "int", nulo: false },
      { nome: "cnpj", tipo: "texto", nulo: false, tamanho: 18 },
      { nome: "razaoSocial", tipo: "texto", nulo: false, tamanho: 255 },
      { nome: "nomeFantasia", tipo: "texto", nulo: true, tamanho: 255 },
      { nome: "inscricaoEstadual", tipo: "texto", nulo: true, tamanho: 30 },
      { nome: "cnae", tipo: "texto", nulo: true, tamanho: 20 },
      { nome: "endereco", tipo: "texto", nulo: true, tamanho: 255 },
      { nome: "bairro", tipo: "texto", nulo: true, tamanho: 100 },
      { nome: "cep", tipo: "texto", nulo: true, tamanho: 10 },
      { nome: "municipio", tipo: "texto", nulo: true, tamanho: 100 },
      { nome: "uf", tipo: "texto", nulo: true, tamanho: 2 },
      { nome: "telefone", tipo: "texto", nulo: true, tamanho: 20 },
      { nome: "email", tipo: "texto", nulo: true, tamanho: 255 },
      { nome: "editalDBF", tipo: "texto", nulo: true, tamanho: 20 },
      { nome: "createdAt", tipo: "data", nulo: false },
      { nome: "updatedAt", tipo: "data", nulo: false },
    ],
  },
  {
    nome: "recintos",
    colunas: [
      { nome: "id", tipo: "int", nulo: false },
      { nome: "codigo", tipo: "texto", nulo: false, tamanho: 20 },
      { nome: "nome", tipo: "texto", nulo: false, tamanho: 255 },
      { nome: "tipo", tipo: "enum", nulo: false, valores: ["porto", "porto_seco", "aeroporto", "fronteira"] },
      { nome: "cidade", tipo: "texto", nulo: true, tamanho: 100 },
      { nome: "uf", tipo: "texto", nulo: true, tamanho: 2 },
      { nome: "administrador", tipo: "texto", nulo: true, tamanho: 255 },
      { nome: "createdAt", tipo: "data", nulo: false },
    ],
  },
];

const mascarar = (url: string) => {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.username ? `${u.username}:***@` : ""}${u.host}${u.pathname}`;
  } catch {
    return "(URL inválida)";
  }
};

/** Converte o valor lido do MySQL para o tipo do Postgres, validando contra o schema. */
function converter(tabela: string, id: unknown, col: Coluna, valor: unknown): unknown {
  const onde = `${tabela}.${col.nome} (id=${String(id)})`;
  if (valor === null || valor === undefined) {
    if (!col.nulo) throw new Error(`${onde}: nulo em coluna NOT NULL`);
    return null;
  }
  switch (col.tipo) {
    case "int": {
      const n = Number(valor);
      if (!Number.isInteger(n)) throw new Error(`${onde}: inteiro inválido`);
      return n;
    }
    case "bool":
      // MySQL devolve tinyint(1) como 0/1
      if (valor === 0 || valor === 1 || typeof valor === "boolean") return Boolean(valor);
      throw new Error(`${onde}: booleano inválido`);
    case "data":
      if (!(valor instanceof Date) || Number.isNaN(valor.getTime())) throw new Error(`${onde}: data inválida`);
      return valor;
    case "enum":
      if (!col.valores!.includes(String(valor))) throw new Error(`${onde}: valor fora do enum`);
      return String(valor);
    case "texto": {
      const s = String(valor);
      // varchar(n) no Postgres conta caracteres, como o MySQL utf8mb4
      if (col.tamanho !== undefined && Array.from(s).length > col.tamanho) {
        throw new Error(`${onde}: excede varchar(${col.tamanho})`);
      }
      return s;
    }
  }
}

/** Forma canônica para comparar origem e destino. */
function canonico(col: Coluna, valor: unknown): unknown {
  if (valor === null || valor === undefined) return null;
  if (col.tipo === "data") return (valor as Date).toISOString();
  if (col.tipo === "bool") return Boolean(valor);
  if (col.tipo === "int") return Number(valor);
  return String(valor);
}

async function main() {
  const simular = process.argv.includes("--simular");
  const origemUrl = process.env.MYSQL_URL;
  const destinoUrl = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!origemUrl) throw new Error("Defina MYSQL_URL (banco MySQL de origem).");
  if (!destinoUrl) throw new Error("Defina DIRECT_URL (ou DATABASE_URL) com o Postgres de destino.");
  if (!/^postgres(ql)?:\/\//.test(destinoUrl)) throw new Error("O destino não é uma URL postgres://");

  console.log(`[Migração] ${simular ? "SIMULAÇÃO (nada será gravado)" : "MIGRAÇÃO"}`);
  console.log(`[Migração] origem : ${mascarar(origemUrl)}`);
  console.log(`[Migração] destino: ${mascarar(destinoUrl)}`);

  const origem = await mysql.createConnection({ uri: origemUrl, timezone: "Z", dateStrings: false });
  await origem.query("SET time_zone = '+00:00'");
  // prepare: false — compatível com o transaction pooler do Supabase
  const destino = postgres(destinoUrl, { prepare: false, max: 1, onnotice: () => {} });

  try {
    // 1) Lê e converte a origem inteira antes de tocar no destino
    const dados = new Map<string, Linha[]>();
    for (const t of TABELAS) {
      const cols = t.colunas.map((c) => `\`${c.nome}\``).join(", ");
      const [linhas] = await origem.query(`SELECT ${cols} FROM \`${t.nome}\` ORDER BY id`);
      const convertidas = (linhas as Linha[]).map((l) => {
        const nova: Linha = {};
        for (const c of t.colunas) nova[c.nome] = converter(t.nome, l.id, c, l[c.nome]);
        return nova;
      });
      dados.set(t.nome, convertidas);
      console.log(`[Migração] origem  ${t.nome.padEnd(12)} ${convertidas.length} linhas lidas e validadas`);
    }

    // 2) Destino: migrações aplicadas e tabelas vazias
    for (const t of TABELAS) {
      const [existe] = await destino`SELECT to_regclass(${`public.${t.nome}`}) AS tabela`;
      if (!existe.tabela) throw new Error(`Tabela "${t.nome}" não existe no destino. Rode \`pnpm db:push\` antes.`);
      const [{ n }] = await destino`SELECT COUNT(*)::int AS n FROM ${destino(t.nome)}`;
      if (n > 0) throw new Error(`Tabela "${t.nome}" no destino já tem ${n} linhas. Abortado para não duplicar.`);
    }
    console.log("[Migração] destino com as 3 tabelas criadas e vazias");

    if (simular) {
      console.log("[Migração] Simulação concluída sem erros. Rode sem --simular para migrar.");
      return;
    }

    // 3) Grava tudo numa transação e ajusta as sequências de identidade
    await destino.begin(async (tx) => {
      for (const t of TABELAS) {
        const linhas = dados.get(t.nome)!;
        const nomes = t.colunas.map((c) => c.nome);
        for (let i = 0; i < linhas.length; i += 500) {
          // valores já validados e convertidos por converter()
          const lote = linhas.slice(i, i + 500) as Record<string, any>[];
          await tx`INSERT INTO ${tx(t.nome)} ${tx(lote, nomes)}`;
        }
        await tx`
          SELECT setval(
            pg_get_serial_sequence(${`public."${t.nome}"`}, 'id'),
            (SELECT COALESCE(MAX(id), 0) + 1 FROM ${tx(t.nome)}),
            false
          )`;
      }
    });
    console.log("[Migração] dados gravados e sequências ajustadas (transação confirmada)");

    // 4) Verificação: relê o destino e compara campo a campo com a origem
    let divergencias = 0;
    for (const t of TABELAS) {
      const esperadas = dados.get(t.nome)!;
      const obtidas = await destino`SELECT * FROM ${destino(t.nome)} ORDER BY id`;
      if (obtidas.length !== esperadas.length) {
        console.error(`[Migração] ${t.nome}: ${esperadas.length} na origem, ${obtidas.length} no destino`);
        divergencias++;
        continue;
      }
      let difsTabela = 0;
      esperadas.forEach((e, i) => {
        for (const c of t.colunas) {
          if (JSON.stringify(canonico(c, e[c.nome])) !== JSON.stringify(canonico(c, obtidas[i][c.nome]))) {
            difsTabela++;
            if (difsTabela <= 5) console.error(`[Migração] ${t.nome}.${c.nome} diverge (id=${String(e.id)})`);
          }
        }
      });
      // Lê o estado da sequência sem consumi-la
      const [{ seq }] = await destino`SELECT pg_get_serial_sequence(${`public."${t.nome}"`}, 'id') AS seq`;
      const [estado] = await destino.unsafe(`SELECT last_value, is_called FROM ${seq}`);
      const proximo = estado.is_called ? Number(estado.last_value) + 1 : Number(estado.last_value);
      const maxId = esperadas.reduce((m, l) => Math.max(m, Number(l.id)), 0);
      const seqOk = Number(proximo) === maxId + 1;
      console.log(
        `[Migração] verificação ${t.nome.padEnd(12)} ${obtidas.length} linhas | campos divergentes: ${difsTabela} | próximo id ${proximo} ${seqOk ? "(ok)" : `(ESPERADO ${maxId + 1})`}`
      );
      if (difsTabela > 0 || !seqOk) divergencias++;
    }

    if (divergencias > 0) {
      throw new Error("Verificação encontrou divergências — revise antes de apontar o app para o Postgres.");
    }
    console.log("[Migração] Concluída: destino idêntico à origem.");
  } finally {
    await origem.end();
    await destino.end();
  }
}

main().catch((err) => {
  console.error(`[Migração] FALHOU: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
