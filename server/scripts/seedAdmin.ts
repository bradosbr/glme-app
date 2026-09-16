/**
 * Cria o administrador inicial — execução manual: `pnpm db:seed`.
 *
 * Antes rodava automaticamente no boot do servidor; no Vercel isso rodaria a cada
 * cold start, então virou um passo explícito. Aponte DATABASE_URL para o banco
 * desejado (local ou produção) e defina ADMIN_PASSWORD.
 *
 * Não faz nada se já existir algum admin.
 */
import "dotenv/config";
import { seedAdmin } from "../db";

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("[Seed] Defina DATABASE_URL.");
    process.exit(1);
  }

  // Sem isso, seedAdmin() cairia no padrão admin/admin123 — inaceitável num deploy público
  const senha = process.env.ADMIN_PASSWORD?.trim() ?? "";
  if (senha.length < 6 || senha === "admin123") {
    console.error("[Seed] Defina ADMIN_PASSWORD com ao menos 6 caracteres (e diferente de 'admin123').");
    process.exit(1);
  }

  const resultado = await seedAdmin();
  const usuario = process.env.ADMIN_USERNAME?.trim() || "admin";
  const mensagens = {
    "sem-banco": "[Seed] Não foi possível conectar ao banco (DATABASE_URL).",
    "ja-existe": "[Seed] Já existe um administrador — nada foi alterado.",
    promovido: `[Seed] Usuário '${usuario}' promovido a administrador.`,
    criado: `[Seed] Administrador '${usuario}' criado.`,
  } as const;

  console.log(mensagens[resultado]);
  process.exit(resultado === "sem-banco" ? 1 : 0);
}

main().catch((err) => {
  console.error("[Seed] Falha:", err);
  process.exit(1);
});
