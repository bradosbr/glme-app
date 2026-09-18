import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

// Banco em memória: chaves e vínculos por usuário
const banco = vi.hoisted(() => ({
  chaves: new Map<number, { userId: number; clientId: string; clientSecretCifrado: string; updatedAt: Date }>(),
  vinculos: new Set<string>(),
  importadores: [
    { id: 10, cnpj: "11.111.111/0001-11", razaoSocial: "ALFA IMPORTADORA LTDA" },
    { id: 20, cnpj: "22.222.222/0001-22", razaoSocial: "BETA COMERCIO LTDA" },
  ],
}));

vi.mock("./db", () => ({
  getChavePortal: vi.fn(async (userId: number) => banco.chaves.get(userId)),
  salvarChavePortal: vi.fn(async (userId: number, clientId: string, clientSecretCifrado: string) => {
    banco.chaves.set(userId, { userId, clientId, clientSecretCifrado, updatedAt: new Date() });
  }),
  removerChavePortal: vi.fn(async (userId: number) => {
    banco.chaves.delete(userId);
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
const { chavePortalDoUsuario } = await import("./chavePortal");

function contexto(id: number): TrpcContext {
  return {
    user: {
      id, openId: `u${id}`, username: `usuario${id}`, passwordHash: null, email: null, name: `Usuário ${id}`,
      loginMethod: "local", role: "user", active: true, resetRequested: false,
      createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

const original = process.env.CHAVE_CRIPTOGRAFIA;

describe("Minha conta - chave de acesso do Portal Único", () => {
  beforeEach(() => {
    banco.chaves.clear();
    process.env.CHAVE_CRIPTOGRAFIA = randomBytes(32).toString("base64");
  });
  afterEach(() => {
    if (original === undefined) delete process.env.CHAVE_CRIPTOGRAFIA;
    else process.env.CHAVE_CRIPTOGRAFIA = original;
  });

  const par = { clientId: "cliente-1234567890", clientSecret: "segredo-muito-secreto-987" };

  it("guarda o Client-Secret cifrado e nunca o devolve", async () => {
    const api = appRouter.createCaller(contexto(1));
    await api.conta.salvarChavePortal(par);

    const gravado = banco.chaves.get(1)!;
    expect(gravado.clientSecretCifrado).not.toContain("segredo");
    expect(gravado.clientSecretCifrado.startsWith("v1:")).toBe(true);

    const status = await api.conta.chavePortal();
    expect(status).toMatchObject({ configurada: true, clientId: "••••••7890", criptografiaDisponivel: true });
    expect(JSON.stringify(status)).not.toContain("segredo");
  });

  it("o servidor recupera a chave decifrada para usar na API", async () => {
    await appRouter.createCaller(contexto(1)).conta.salvarChavePortal(par);
    expect(await chavePortalDoUsuario(1)).toEqual(par);
    expect(await chavePortalDoUsuario(2)).toBeUndefined();
  });

  it("cada usuário só vê a própria chave", async () => {
    await appRouter.createCaller(contexto(1)).conta.salvarChavePortal(par);
    const outro = await appRouter.createCaller(contexto(2)).conta.chavePortal();
    expect(outro.configurada).toBe(false);
  });

  it("sem chave de criptografia no servidor, não salva", async () => {
    delete process.env.CHAVE_CRIPTOGRAFIA;
    const api = appRouter.createCaller(contexto(1));
    await expect(api.conta.salvarChavePortal(par)).rejects.toThrow("CHAVE_CRIPTOGRAFIA");
    expect(banco.chaves.size).toBe(0);
  });

  it("remove a chave", async () => {
    const api = appRouter.createCaller(contexto(1));
    await api.conta.salvarChavePortal(par);
    await api.conta.removerChavePortal();
    expect((await api.conta.chavePortal()).configurada).toBe(false);
  });

  it("recusa valores curtos demais", async () => {
    await expect(appRouter.createCaller(contexto(1)).conta.salvarChavePortal({ clientId: "abc", clientSecret: "x" })).rejects.toThrow();
  });
});

describe("Minha conta - empresas do usuário", () => {
  beforeEach(() => banco.vinculos.clear());

  it("vincula e desvincula empresas só do usuário logado", async () => {
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
    await expect(anonimo.conta.chavePortal()).rejects.toThrow();
  });
});
