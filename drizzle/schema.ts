import { boolean, index, integer, pgEnum, pgTable, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/pg-core";

// Enums do Postgres são tipos globais: nomes específicos para não colidir
export const userRoleEnum = pgEnum("user_role", ["user", "admin"]);
export const recintoTipoEnum = pgEnum("recinto_tipo", ["porto", "porto_seco", "aeroporto", "fronteira"]);

// timestamptz: guarda o instante absoluto (o MySQL convertia pelo fuso da sessão)
const carimbo = (nome: string) => timestamp(nome, { withTimezone: true, mode: "date" });

export const users = pgTable("users", {
  // "by default" (e não "always") permite preservar os IDs na migração dos dados
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  // Autenticação local (usuário + senha)
  username: varchar("username", { length: 64 }).unique(),
  passwordHash: varchar("passwordHash", { length: 255 }),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: userRoleEnum("role").default("user").notNull(),
  // Conta ativa (admin pode desativar sem excluir)
  active: boolean("active").default(true).notNull(),
  // Sinaliza que o usuário pediu redefinição de senha (admin resolve)
  resetRequested: boolean("resetRequested").default(false).notNull(),
  createdAt: carimbo("createdAt").defaultNow().notNull(),
  // Postgres não tem ON UPDATE: o Drizzle preenche em todo update()
  updatedAt: carimbo("updatedAt").defaultNow().$onUpdate(() => new Date()).notNull(),
  lastSignedIn: carimbo("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// Tabela de Importadores cadastrados
export const importadores = pgTable("importadores", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
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
  createdAt: carimbo("createdAt").defaultNow().notNull(),
  updatedAt: carimbo("updatedAt").defaultNow().$onUpdate(() => new Date()).notNull(),
});

export type Importador = typeof importadores.$inferSelect;
export type InsertImportador = typeof importadores.$inferInsert;

// Tabela de Recintos Alfandegados
export const recintos = pgTable("recintos", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  codigo: varchar("codigo", { length: 20 }).notNull().unique(),
  nome: varchar("nome", { length: 255 }).notNull(),
  tipo: recintoTipoEnum("tipo").notNull(),
  cidade: varchar("cidade", { length: 100 }),
  uf: varchar("uf", { length: 2 }),
  administrador: varchar("administrador", { length: 255 }),
  createdAt: carimbo("createdAt").defaultNow().notNull(),
});

export type Recinto = typeof recintos.$inferSelect;
export type InsertRecinto = typeof recintos.$inferInsert;

// Vínculo usuário ↔ empresa ("minhas empresas"): as empresas do cadastro de importadores
// pelas quais o usuário responde. Some junto com o usuário ou com a empresa.
export const usuarioEmpresas = pgTable(
  "usuario_empresas",
  {
    id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
    userId: integer("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
    importadorId: integer("importadorId").notNull().references(() => importadores.id, { onDelete: "cascade" }),
    createdAt: carimbo("createdAt").defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("usuario_empresas_usuario_importador").on(t.userId, t.importadorId),
    index("usuario_empresas_importador").on(t.importadorId),
  ],
);

export type UsuarioEmpresa = typeof usuarioEmpresas.$inferSelect;

// Chave de acesso do Portal Único da empresa (par Client-Id / Client-Secret), uma por importador.
// Tabela separada de importadores para o segredo nunca sair junto na listagem do cadastro.
// O Client-Secret fica cifrado (server/cripto.ts) e nunca é devolvido ao navegador.
export const importadorChavesPortal = pgTable("importador_chaves_portal", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  importadorId: integer("importadorId").notNull().unique().references(() => importadores.id, { onDelete: "cascade" }),
  clientId: varchar("clientId", { length: 255 }).notNull(),
  clientSecretCifrado: text("clientSecretCifrado").notNull(),
  // Quem cadastrou ou trocou a chave por último
  atualizadoPor: integer("atualizadoPor").references(() => users.id, { onDelete: "set null" }),
  createdAt: carimbo("createdAt").defaultNow().notNull(),
  updatedAt: carimbo("updatedAt").defaultNow().$onUpdate(() => new Date()).notNull(),
});

export type ImportadorChavePortal = typeof importadorChavesPortal.$inferSelect;
