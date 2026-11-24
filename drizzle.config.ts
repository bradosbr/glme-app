import { defineConfig } from "drizzle-kit";

// Migrações usam a conexão direta com o Postgres do VPS, por túnel SSH (ver .env.example).
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
