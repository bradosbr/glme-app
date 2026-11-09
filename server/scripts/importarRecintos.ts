/**
 * Atualiza o cadastro de recintos alfandegados pela tabela oficial do Siscomex —
 * execução manual: `pnpm recintos:importar [arquivo.csv]`.
 *
 * A tabela "Recinto Aduaneiro" é baixada em CSV no Portal Único Siscomex
 * (Classif. e Tabelas › Tabelas Aduaneiras › Recinto Aduaneiro › Exportar).
 * Sem o arquivo no argumento, usa a cópia guardada em server/data.
 *
 * O cadastro passa a ser exatamente a tabela oficial: os recintos que saírem dela
 * são removidos. Cidade, UF e administrador preenchidos à mão são preservados
 * quando a tabela oficial não traz o dado.
 *
 * Com --simular, só mostra o que mudaria, sem gravar.
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { getDb } from "../db";
import { recintos, type InsertRecinto } from "../../drizzle/schema";
import { parsearRecintosSiscomex } from "../recintosSiscomex";

const ARQUIVO_PADRAO = resolve(import.meta.dirname, "../data/RecintoAduaneiro.csv");

/** O arquivo do Siscomex vem em ISO-8859-1; a cópia do repositório, em UTF-8. */
function lerTexto(caminho: string): string {
  const bytes = readFileSync(caminho);
  const utf8 = bytes.toString("utf8");
  return utf8.includes("�") ? bytes.toString("latin1") : utf8;
}

const digitos = (codigo: string) => codigo.replace(/\D/g, "").padStart(7, "0").slice(0, 7);

async function main() {
  const args = process.argv.slice(2);
  const simular = args.includes("--simular");
  const arquivo = args.find((a) => !a.startsWith("--")) ?? ARQUIVO_PADRAO;

  if (!process.env.DATABASE_URL) {
    console.error("[Recintos] Defina DATABASE_URL (o banco que vai receber a lista).");
    process.exit(1);
  }

  const oficiais = parsearRecintosSiscomex(lerTexto(arquivo));
  if (oficiais.length === 0) {
    console.error(`[Recintos] Nenhum recinto lido em ${arquivo}. Confira se é o CSV da tabela Recinto Aduaneiro.`);
    process.exit(1);
  }

  const db = await getDb();
  if (!db) {
    console.error("[Recintos] Sem conexão com o banco.");
    process.exit(1);
  }

  const atuais = await db.select().from(recintos);
  // O cadastro antigo guardava o código com dígito verificador: compara só os 7 dígitos
  const porDigitos = new Map(atuais.map((r) => [digitos(r.codigo), r]));
  const digitosOficiais = new Set(oficiais.map((r) => digitos(r.codigo)));

  const novos = oficiais.filter((r) => !porDigitos.has(digitos(r.codigo))).length;
  const removidos = atuais.filter((r) => !digitosOficiais.has(digitos(r.codigo)));

  const valores: InsertRecinto[] = oficiais.map((r) => {
    const antigo = porDigitos.get(digitos(r.codigo));
    return {
      codigo: r.codigo,
      nome: r.nome,
      tipo: r.tipo,
      cidade: r.cidade ?? antigo?.cidade ?? null,
      uf: r.uf ?? antigo?.uf ?? null,
      administrador: antigo?.administrador ?? null,
    };
  });

  const porTipo = valores.reduce<Record<string, number>>((t, r) => ({ ...t, [r.tipo]: (t[r.tipo] ?? 0) + 1 }), {});
  console.log(`[Recintos] ${arquivo}`);
  console.log(`[Recintos] Tabela oficial: ${oficiais.length} recintos (${Object.entries(porTipo).map(([t, n]) => `${t} ${n}`).join(", ")})`);
  console.log(`[Recintos] No cadastro hoje: ${atuais.length} · novos: ${novos} · saem do cadastro: ${removidos.length}`);
  for (const r of removidos) console.log(`[Recintos]   sai: ${r.codigo} ${r.nome}`);

  if (simular) {
    console.log("[Recintos] --simular: nada foi gravado.");
    process.exit(0);
  }

  await db.transaction(async (tx) => {
    await tx.delete(recintos);
    for (let i = 0; i < valores.length; i += 200) {
      await tx.insert(recintos).values(valores.slice(i, i + 200));
    }
  });

  const total = await db.select().from(recintos);
  console.log(`[Recintos] Cadastro atualizado: ${total.length} recintos.`);
  process.exit(0);
}

main().catch((e) => {
  console.error("[Recintos] Falhou:", e instanceof Error ? e.message : e);
  process.exit(1);
});
