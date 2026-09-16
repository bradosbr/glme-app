import { defineConfig } from "drizzle-kit";

// Migrações não devem passar pelo transaction pooler (porta 6543): o Supabase recomenda
// a conexão direta (IPv6) ou o session pooler (porta 5432, IPv4) para comandos de schema.
// DIRECT_URL é usada se existir; senão, cai para DATABASE_URL.
const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DIRECT_URL (ou DATABASE_URL) is required to run drizzle commands");
}

export default defineConfig({
  schema: "./drizzle/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: connectionString,
  },
});
