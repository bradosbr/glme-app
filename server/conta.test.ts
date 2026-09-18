import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

// Banco em memória: importadores, chaves por empresa e vínculos usuário ↔ empresa
const banco = vi.hoisted(() => ({
  importadores: [] as { id: number; cnpj: string; razaoSocial: string; editalDBF?: string }[],
  chaves: new Map<number, { importadorId: number; clientId: string; clientSecretCifrado: string; atualizadoPor: number; updatedAt: Date }>(),
  vinculos: new Set<string>(),
  proximoId: 1,
}));

vi.mock("./db", () => ({
  getImportadorByCnpj: vi.fn(async (cnpj: string) => banco.importadores.find((i) => i.cnpj === cnpj.replace(/\D/g, ""))),
  upsertImportador: vi.fn(async (dados: { cnpj: string; razaoSocial: string; editalDBF?: string }) => {
    const cnpj = dados.cnpj.replace(/\D/g, "");
    const existente = banco.importadores.find((i) => i.cnpj === cnpj);
    if (existente) return Object.assign(existente, dados, { cnpj });
    const novo = { ...dados, cnpj, id: banco.proximoId++ };
    banco.importadores.push(novo);
    return novo;
  }),
  usuarioVinculadoAEmpresa: vi.fn(async (userId: number, importadorId: number) => banco.vinculos.has(`${userId}:${importadorId}`)),
  getChavePortalEmpresa: vi.fn(async (importadorId: number) => banco.chaves.get(importadorId)),
  salvarChavePortalEmpresa: vi.fn(async (importadorId: number, clientId: string, clientSecretCifrado: string, userId: number) => {
    banco.chaves.set(importadorId, { importadorId, clientId, clientSecretCifrado, atualizadoPor: userId, updatedAt: new Date() });
  }),
  removerChavePortalEmpresa: vi.fn(async (importadorId: number) => {
    banco.chaves.delete(importadorId);
  }),
  listarEmpresasDoUsuario: vi.fn(async (userId: number) =>
    banco.importadores.filter((i) => banco.vinculos.has(`${userId}:${i.id}`)),
  ),
  vincularEmpresa: vi.fn(async (userId: number, importadorId: number) => {
    banco.vinculos.add(`${userId}:${importadorId}`);
  }),
  desvincularEmpresa: vi.fn(async (userId: number, importadorId: number) => {
    banco.vinculos.delete(`${userId}:${importadorId}`);
  }),
}));

const { appRouter } = await import("./routers");
const { chavePortalDaEmpresa } = await import("./chavePortal");

function contexto(id: number, role: "user" | "admin" = "user"): TrpcContext {
  return {
    user: {
      id, openId: `u${id}`, username: `usuario${id}`, passwordHash: null, email: null, name: `Usuário ${id}`,
      loginMethod: "local", role, active: true, resetRequested: false,
      createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

const empresa = { cnpj: "11.111.111/0001-11", razaoSocial: "ALFA IMPORTADORA LTDA", editalDBF: "001/2026" };
const chave = { clientId: "cliente-1234567890", clientSecret: "segredo-muito-secreto-987" };
const original = process.env.CHAVE_CRIPTOGRAFIA;

beforeEach(() => {
  banco.importadores.length = 0;
  banco.chaves.clear();
  banco.vinculos.clear();
  banco.proximoId = 1;
  process.env.CHAVE_CRIPTOGRAFIA = randomBytes(32).toString("base64");
});
afterEach(() => {
  if (original === undefined) delete process.env.CHAVE_CRIPTOGRAFIA;
  else process.env.CHAVE_CRIPTOGRAFIA = original;
});

describe("Cadastro da empresa com chave de acesso do Portal Único", () => {
  it("cadastra a empresa com edital e chave; o segredo fica cifrado e não volta", async () => {
    const api = appRouter.createCaller(contexto(1));
    const salvo = await api.importadores.salvar({ ...empresa, chavePortal: chave });
    expect(salvo).toMatchObject({ id: 1, editalDBF: "001/2026" });

    const gravado = banco.chaves.get(1)!;
    expect(gravado.clientSecretCifrado.startsWith("v1:")).toBe(true);
    expect(gravado.clientSecretCifrado).not.toContain("segredo");
    expect(gravado.atualizadoPor).toBe(1);

    const status = await api.importadores.chavePortal({ importadorId: 1 });
    expect(status).toMatchObject({ configurada: true, clientId: "••••••7890", podeAlterar: true });
    expect(JSON.stringify(status)).not.toContain("segredo");
  });

  it("o servidor recupera a chave decifrada da empresa", async () => {
    await appRouter.createCaller(contexto(1)).importadores.salvar({ ...empresa, chavePortal: chave });
    expect(await chavePortalDaEmpresa(1)).toEqual(chave);
    expect(await chavePortalDaEmpresa(99)).toBeUndefined();
  });

  it("quem cria o cadastro fica vinculado; quem só atualiza, não", async () => {
    await appRouter.createCaller(contexto(1)).importadores.salvar(empresa);
    await appRouter.createCaller(contexto(2)).importadores.salvar({ ...empresa, editalDBF: "002/2026" });
    expect(banco.vinculos.has("1:1")).toBe(true);
    expect(banco.vinculos.has("2:1")).toBe(false);
  });

  it("usuário sem vínculo não troca nem remove a chave de outra empresa", async () => {
    await appRouter.createCaller(contexto(1)).importadores.salvar({ ...empresa, chavePortal: chave });
    const intruso = appRouter.createCaller(contexto(2));

    await expect(intruso.importadores.salvar({ ...empresa, chavePortal: { clientId: "outro-cliente-000", clientSecret: "outro-segredo-000" } }))
      .rejects.toThrow("Só o administrador ou um usuário vinculado");
    await expect(intruso.importadores.removerChavePortal({ importadorId: 1 })).rejects.toThrow("Só o administrador");
    expect((await intruso.importadores.chavePortal({ importadorId: 1 })).podeAlterar).toBe(false);
    expect(banco.chaves.get(1)!.clientId).toBe(chave.clientId);
  });

  it("administrador e usuário vinculado podem trocar e remover a chave", async () => {
    await appRouter.createCaller(contexto(1)).importadores.salvar({ ...empresa, chavePortal: chave });
    const admin = appRouter.createCaller(contexto(9, "admin"));
    await admin.importadores.salvar({ ...empresa, chavePortal: { clientId: "cliente-admin-0001", clientSecret: "segredo-admin-0001" } });
    expect(banco.chaves.get(1)!.clientId).toBe("cliente-admin-0001");

    await appRouter.createCaller(contexto(1)).importadores.removerChavePortal({ importadorId: 1 });
    expect(banco.chaves.has(1)).toBe(false);
  });

  it("sem chave de criptografia no servidor, não grava nada", async () => {
    delete process.env.CHAVE_CRIPTOGRAFIA;
    const api = appRouter.createCaller(contexto(1));
    await expect(api.importadores.salvar({ ...empresa, chavePortal: chave })).rejects.toThrow("CHAVE_CRIPTOGRAFIA");
    expect(banco.importadores).toHaveLength(0);
    // Sem chave informada, o cadastro funciona normalmente
    await api.importadores.salvar(empresa);
    expect(banco.importadores).toHaveLength(1);
  });

  it("recusa Client-Id ou Client-Secret curtos demais", async () => {
    await expect(appRouter.createCaller(contexto(1)).importadores.salvar({ ...empresa, chavePortal: { clientId: "abc", clientSecret: "x" } }))
      .rejects.toThrow();
  });
});

describe("Minha conta - empresas do usuário", () => {
  it("vincula e desvincula empresas só do usuário logado", async () => {
    banco.importadores.push({ id: 10, cnpj: "10", razaoSocial: "ALFA" }, { id: 20, cnpj: "20", razaoSocial: "BETA" });
    const u1 = appRouter.createCaller(contexto(1));
    const u2 = appRouter.createCaller(contexto(2));
    await u1.conta.vincularEmpresa({ importadorId: 10 });
    await u2.conta.vincularEmpresa({ importadorId: 20 });

    expect((await u1.conta.empresas()).map((e) => e.id)).toEqual([10]);
    expect((await u2.conta.empresas()).map((e) => e.id)).toEqual([20]);

    await u1.conta.desvincularEmpresa({ importadorId: 10 });
    expect(await u1.conta.empresas()).toEqual([]);
    expect((await u2.conta.empresas()).map((e) => e.id)).toEqual([20]);
  });

  it("exige login", async () => {
    const anonimo = appRouter.createCaller({ ...contexto(1), user: null } as unknown as TrpcContext);
    await expect(anonimo.conta.empresas()).rejects.toThrow();
    await expect(anonimo.importadores.chavePortal({ importadorId: 1 })).rejects.toThrow();
  });
});
