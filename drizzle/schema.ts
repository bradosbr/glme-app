import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, decimal } from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// Tabela de Importadores cadastrados
export const importadores = mysqlTable("importadores", {
  id: int("id").autoincrement().primaryKey(),
  cnpj: varchar("cnpj", { length: 18 }).notNull().unique(),
  razaoSocial: varchar("razaoSocial", { length: 255 }).notNull(),
  nomeFantasia: varchar("nomeFantasia", { length: 255 }),
  inscricaoEstadual: varchar("inscricaoEstadual", { length: 30 }),
  cnae: varchar("cnae", { length: 20 }),
  endereco: varchar("endereco", { length: 255 }),
  bairro: varchar("bairro", { length: 100 }),
  cep: varchar("cep", { length: 10 }),
  municipio: varchar("municipio", { length: 100 }),
  uf: varchar("uf", { length: 2 }),
  telefone: varchar("telefone", { length: 20 }),
  email: varchar("email", { length: 255 }),
  // Campo para o número do edital DBF associado ao importador
  editalDBF: varchar("editalDBF", { length: 20 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Importador = typeof importadores.$inferSelect;
export type InsertImportador = typeof importadores.$inferInsert;

// Tabela de Recintos Alfandegados
export const recintos = mysqlTable("recintos", {
  id: int("id").autoincrement().primaryKey(),
  codigo: varchar("codigo", { length: 20 }).notNull().unique(),
  nome: varchar("nome", { length: 255 }).notNull(),
  tipo: mysqlEnum("tipo", ["porto", "porto_seco", "aeroporto", "fronteira"]).notNull(),
  cidade: varchar("cidade", { length: 100 }),
  uf: varchar("uf", { length: 2 }),
  administrador: varchar("administrador", { length: 255 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Recinto = typeof recintos.$inferSelect;
export type InsertRecinto = typeof recintos.$inferInsert;
