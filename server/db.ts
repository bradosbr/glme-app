import { eq, like, or } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, users, importadores, recintos, InsertImportador, InsertRecinto } from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) { console.warn("[Database] Cannot upsert user: database not available"); return; }
  try {
    const values: InsertUser = { openId: user.openId };
    const updateSet: Record<string, unknown> = {};
    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];
    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };
    textFields.forEach(assignNullable);
    if (user.lastSignedIn !== undefined) { values.lastSignedIn = user.lastSignedIn; updateSet.lastSignedIn = user.lastSignedIn; }
    if (user.role !== undefined) { values.role = user.role; updateSet.role = user.role; }
    else if (user.openId === ENV.ownerOpenId) { values.role = 'admin'; updateSet.role = 'admin'; }
    if (!values.lastSignedIn) values.lastSignedIn = new Date();
    if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();
    await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
  } catch (error) { console.error("[Database] Failed to upsert user:", error); throw error; }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) { console.warn("[Database] Cannot get user: database not available"); return undefined; }
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

// ===== IMPORTADORES =====

export async function getImportadores() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(importadores).orderBy(importadores.razaoSocial);
}

export async function getImportadorByCnpj(cnpj: string) {
  const db = await getDb();
  if (!db) return undefined;
  const cnpjClean = cnpj.replace(/\D/g, '');
  // Formatar para XX.XXX.XXX/XXXX-XX (padrão armazenado no banco)
  const cnpjFormatado = cnpjClean.length === 14
    ? cnpjClean.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')
    : '';
  const result = await db.select().from(importadores)
    .where(or(
      eq(importadores.cnpj, cnpj),
      eq(importadores.cnpj, cnpjClean),
      ...(cnpjFormatado ? [eq(importadores.cnpj, cnpjFormatado)] : [])
    ))
    .limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function upsertImportador(data: InsertImportador) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const existing = await getImportadorByCnpj(data.cnpj);
  if (existing) {
    await db.update(importadores).set({ ...data, updatedAt: new Date() }).where(eq(importadores.id, existing.id));
    return { ...existing, ...data };
  } else {
    await db.insert(importadores).values(data);
    return data;
  }
}

export async function deleteImportador(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(importadores).where(eq(importadores.id, id));
}

export async function searchImportadores(query: string) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(importadores)
    .where(or(
      like(importadores.razaoSocial, `%${query}%`),
      like(importadores.cnpj, `%${query}%`)
    ))
    .limit(20);
}

// ===== RECINTOS =====

export async function getRecintos(tipo?: string) {
  const db = await getDb();
  if (!db) return [];
  if (tipo) {
    return db.select().from(recintos)
      .where(eq(recintos.tipo, tipo as any))
      .orderBy(recintos.nome);
  }
  return db.select().from(recintos).orderBy(recintos.tipo, recintos.nome);
}

export async function seedRecintos() {
  const db = await getDb();
  if (!db) return;
  const existing = await db.select().from(recintos).limit(1);
  if (existing.length > 0) return;

  const dadosRecintos: InsertRecinto[] = [
    // PORTOS SECOS
    { codigo: "1.91.32.01-8", nome: "LOGSERVE - Logística Armazenamento e Serviços Ltda.", tipo: "porto_seco", cidade: "Brasília", uf: "DF", administrador: "LOGSERVE" },
    { codigo: "1.93.31.01-0", nome: "Porto Seco AGESA Armazéns Gerais Alfandegados de MS Ltda.", tipo: "porto_seco", cidade: "Corumbá", uf: "MS", administrador: "AGESA" },
    { codigo: "1.30.32.01-0", nome: "Porto Seco Centro-Oeste S/A", tipo: "porto_seco", cidade: "Anápolis", uf: "GO", administrador: "Centro-Oeste" },
    { codigo: "1.40.32.01-5", nome: "Porto Seco Transmino Transportes Ltda.", tipo: "porto_seco", cidade: "Cuiabá", uf: "MT", administrador: "Transmino" },
    { codigo: "2.93.32.01-0", nome: "Porto Seco Graman - Aurora da Amazônia Terminais e Serviços Ltda.", tipo: "porto_seco", cidade: "Manaus", uf: "AM", administrador: "Graman" },
    { codigo: "4.93.32.01-5", nome: "Supplog Porto Seco de Ipojuca Ltda", tipo: "porto_seco", cidade: "Ipojuca", uf: "PE", administrador: "Supplog" },
    { codigo: "6.35.32.01-8", nome: "Multiterminais Alfandegados do Brasil Ltda.", tipo: "porto_seco", cidade: "Juiz de Fora", uf: "MG", administrador: "Multiterminais" },
    { codigo: "6.45.32.01-1", nome: "Porto Seco do Triângulo Ltda", tipo: "porto_seco", cidade: "Uberaba", uf: "MG", administrador: "Triângulo" },
    { codigo: "7.25.32.01-7", nome: "Transportes Marítimos e Multimodais São Geraldo Ltda.", tipo: "porto_seco", cidade: "Mesquita", uf: "RJ", administrador: "São Geraldo" },
    { codigo: "7.35.32.01-0", nome: "Terminal Logístico do Vale do Paraíba", tipo: "porto_seco", cidade: "Resende", uf: "RJ", administrador: "Vale Paraíba" },
    { codigo: "8.94.32.11-8", nome: "Multilog Brasil S/A - Barueri", tipo: "porto_seco", cidade: "Barueri", uf: "SP", administrador: "Multilog" },
    { codigo: "8.94.32.09-6", nome: "Lachmann Terminais Ltda", tipo: "porto_seco", cidade: "São Bernardo do Campo", uf: "SP", administrador: "Lachmann" },
    { codigo: "8.35.32.01-3", nome: "Brado Logística S/A - Bauru", tipo: "porto_seco", cidade: "Bauru", uf: "SP", administrador: "Brado" },
    { codigo: "8.81.32.01-3", nome: "Aurora Terminais e Serviços Ltda. - Sorocaba", tipo: "porto_seco", cidade: "Sorocaba", uf: "SP", administrador: "Aurora" },
    { codigo: "8.85.32.01-1", nome: "EADI Taubaté Ltda.", tipo: "porto_seco", cidade: "Taubaté", uf: "SP", administrador: "EADI" },
    { codigo: "9.20.32.02-8", nome: "IDR/Paraná - Porto Seco Cascavel", tipo: "porto_seco", cidade: "Cascavel", uf: "PR", administrador: "IDR/Paraná" },
    { codigo: "9.50.32.01-0", nome: "Multilog Brasil S/A - Foz do Iguaçu", tipo: "porto_seco", cidade: "Foz do Iguaçu", uf: "PR", administrador: "Multilog" },
    { codigo: "9.99.32.02-4", nome: "Multilog Brasil S/A - Curitiba", tipo: "porto_seco", cidade: "Curitiba", uf: "PR", administrador: "Multilog" },
    { codigo: "9.98.32.01-1", nome: "Porto Seco Rocha Terminais de Carga Ltda", tipo: "porto_seco", cidade: "São Francisco do Sul", uf: "SC", administrador: "Rocha" },
    { codigo: "0.35.32.01-1", nome: "EADI - Porto Seco Transportes Ltda. - Caxias do Sul", tipo: "porto_seco", cidade: "Caxias do Sul", uf: "RS", administrador: "EADI" },
    { codigo: "0.40.32.01-2", nome: "Multi Armazéns Ltda. - Novo Hamburgo", tipo: "porto_seco", cidade: "Novo Hamburgo", uf: "RS", administrador: "Multi Armazéns" },
    { codigo: "0.60.32.01-0", nome: "Multilog Brasil S/A - Uruguaiana", tipo: "porto_seco", cidade: "Uruguaiana", uf: "RS", administrador: "Multilog" },
    { codigo: "0.97.32.01-2", nome: "Multilog Brasil S/A - Jaguarão", tipo: "porto_seco", cidade: "Jaguarão", uf: "RS", administrador: "Multilog" },
    { codigo: "0.45.32.01-5", nome: "Multilog Brasil S/A - Santana do Livramento", tipo: "porto_seco", cidade: "Santana do Livramento", uf: "RS", administrador: "Multilog" },
    { codigo: "0.93.32.01-4", nome: "Banrisul Armazéns Gerais S/A - Canoas", tipo: "porto_seco", cidade: "Canoas", uf: "RS", administrador: "Banrisul" },
    // PORTOS MARÍTIMOS
    { codigo: "8.94.21.01-0", nome: "Porto de Santos - Terminal de Contêineres", tipo: "porto", cidade: "Santos", uf: "SP", administrador: "Santos Port Authority" },
    { codigo: "7.93.21.01-5", nome: "Porto do Rio de Janeiro - CDRJ", tipo: "porto", cidade: "Rio de Janeiro", uf: "RJ", administrador: "CDRJ" },
    { codigo: "7.92.13.03-0", nome: "Multirio Terminais - Multi-Rio Operações Portuárias S/A", tipo: "porto", cidade: "Rio de Janeiro", uf: "RJ", administrador: "Multi-Rio Operações Portuárias S/A" },
    { codigo: "7.92.13.04-9", nome: "ICTSI Rio Brasil Terminal - Porto do Rio de Janeiro", tipo: "porto", cidade: "Rio de Janeiro", uf: "RJ", administrador: "ICTSI Rio Brasil Terminal" },
    { codigo: "9.93.21.01-8", nome: "Porto de Paranaguá - APPA", tipo: "porto", cidade: "Paranaguá", uf: "PR", administrador: "APPA" },
    { codigo: "9.98.21.01-7", nome: "Porto de São Francisco do Sul", tipo: "porto", cidade: "São Francisco do Sul", uf: "SC", administrador: "APSFS" },
    { codigo: "0.93.21.01-0", nome: "Porto de Porto Alegre - APPA", tipo: "porto", cidade: "Porto Alegre", uf: "RS", administrador: "APPA" },
    { codigo: "5.93.21.01-3", nome: "Porto de Salvador - CODEBA", tipo: "porto", cidade: "Salvador", uf: "BA", administrador: "CODEBA" },
    { codigo: "4.93.21.01-2", nome: "Porto de Suape", tipo: "porto", cidade: "Ipojuca", uf: "PE", administrador: "CODEPE" },
    { codigo: "2.93.21.01-7", nome: "Porto de Manaus - SNPH", tipo: "porto", cidade: "Manaus", uf: "AM", administrador: "SNPH" },
    { codigo: "3.93.21.01-4", nome: "Porto de Fortaleza - CEARÁPORTOS", tipo: "porto", cidade: "Fortaleza", uf: "CE", administrador: "CEARÁPORTOS" },
    { codigo: "7.94.21.01-0", nome: "Porto de Vitória - CODESA", tipo: "porto", cidade: "Vitória", uf: "ES", administrador: "CODESA" },
    { codigo: "9.97.21.01-2", nome: "Porto de Itajaí", tipo: "porto", cidade: "Itajaí", uf: "SC", administrador: "Administração do Porto de Itajaí" },
    { codigo: "9.96.21.01-5", nome: "Porto de Navegantes - PORTONAVE", tipo: "porto", cidade: "Navegantes", uf: "SC", administrador: "PORTONAVE" },
    // AEROPORTOS
    { codigo: "1.91.11.01-0", nome: "Aeroporto Internacional de Brasília - Presidente Juscelino Kubitschek", tipo: "aeroporto", cidade: "Brasília", uf: "DF", administrador: "GRU Airport" },
    { codigo: "8.94.11.01-5", nome: "Aeroporto Internacional de Guarulhos - Governador André Franco Montoro", tipo: "aeroporto", cidade: "Guarulhos", uf: "SP", administrador: "GRU Airport" },
    { codigo: "8.93.11.01-8", nome: "Aeroporto Internacional de Viracopos - Campinas", tipo: "aeroporto", cidade: "Campinas", uf: "SP", administrador: "Viracopos Airports" },
    { codigo: "7.93.11.01-3", nome: "Aeroporto Internacional do Rio de Janeiro - Galeão", tipo: "aeroporto", cidade: "Rio de Janeiro", uf: "RJ", administrador: "RIOgaleão" },
    { codigo: "9.94.11.01-7", nome: "Aeroporto Internacional Afonso Pena - Curitiba", tipo: "aeroporto", cidade: "São José dos Pinhais", uf: "PR", administrador: "Fraport Brasil" },
    { codigo: "0.93.11.01-6", nome: "Aeroporto Internacional Salgado Filho - Porto Alegre", tipo: "aeroporto", cidade: "Porto Alegre", uf: "RS", administrador: "Fraport Brasil" },
    { codigo: "5.93.11.01-9", nome: "Aeroporto Internacional de Salvador - Deputado Luís Eduardo Magalhães", tipo: "aeroporto", cidade: "Salvador", uf: "BA", administrador: "VINCI Airports" },
    { codigo: "3.93.11.01-2", nome: "Aeroporto Internacional de Fortaleza - Pinto Martins", tipo: "aeroporto", cidade: "Fortaleza", uf: "CE", administrador: "Fraport Brasil" },
    { codigo: "2.93.11.01-1", nome: "Aeroporto Internacional Eduardo Gomes - Manaus", tipo: "aeroporto", cidade: "Manaus", uf: "AM", administrador: "VINCI Airports" },
    { codigo: "4.93.11.01-4", nome: "Aeroporto Internacional do Recife - Guararapes", tipo: "aeroporto", cidade: "Recife", uf: "PE", administrador: "Aena Brasil" },
    { codigo: "6.93.11.01-0", nome: "Aeroporto Internacional de Belo Horizonte - Confins", tipo: "aeroporto", cidade: "Lagoa Santa", uf: "MG", administrador: "BH Airport" },
    { codigo: "9.95.11.01-3", nome: "Aeroporto Internacional de Florianópolis - Hercílio Luz", tipo: "aeroporto", cidade: "Florianópolis", uf: "SC", administrador: "Zurich Airport Brasil" },
    { codigo: "9.96.11.01-6", nome: "Aeroporto de Navegantes - Ministro Victor Konder", tipo: "aeroporto", cidade: "Navegantes", uf: "SC", administrador: "Zurich Airport Brasil" },
  ];

  for (const recinto of dadosRecintos) {
    await db.insert(recintos).values(recinto).onDuplicateKeyUpdate({
      set: { nome: recinto.nome, cidade: recinto.cidade, uf: recinto.uf }
    });
  }
  console.log("[DB] Recintos seeded successfully");
}
