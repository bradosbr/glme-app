import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cifrar, criptografiaDisponivel, decifrar, ErroCripto, mascarar } from "./cripto";

const original = process.env.CHAVE_CRIPTOGRAFIA;
const novaChave = () => randomBytes(32).toString("base64");

describe("criptografia de segredos (AES-256-GCM)", () => {
  beforeEach(() => {
    process.env.CHAVE_CRIPTOGRAFIA = novaChave();
  });
  afterEach(() => {
    if (original === undefined) delete process.env.CHAVE_CRIPTOGRAFIA;
    else process.env.CHAVE_CRIPTOGRAFIA = original;
  });

  it("cifra e decifra, sem deixar o texto legível no valor gravado", () => {
    const gravado = cifrar("segredo-do-portal-único");
    expect(gravado.startsWith("v1:")).toBe(true);
    expect(gravado).not.toContain("segredo");
    expect(decifrar(gravado)).toBe("segredo-do-portal-único");
  });

  it("cada cifragem usa um vetor novo (mesmo texto, valores diferentes)", () => {
    expect(cifrar("x")).not.toBe(cifrar("x"));
  });

  it("recusa conteúdo adulterado", () => {
    const [v, iv, tag, conteudo] = cifrar("valor").split(":");
    const alterado = Buffer.from(conteudo, "base64");
    alterado[0] ^= 0xff;
    expect(() => decifrar([v, iv, tag, alterado.toString("base64")].join(":"))).toThrow(ErroCripto);
  });

  it("com outra chave, não decifra", () => {
    const gravado = cifrar("valor");
    process.env.CHAVE_CRIPTOGRAFIA = novaChave();
    expect(() => decifrar(gravado)).toThrow("a chave de criptografia mudou");
  });

  it("sem chave configurada, informa e não cifra", () => {
    delete process.env.CHAVE_CRIPTOGRAFIA;
    expect(criptografiaDisponivel()).toBe(false);
    expect(() => cifrar("x")).toThrow("CHAVE_CRIPTOGRAFIA");
  });

  it("recusa chave com tamanho errado", () => {
    process.env.CHAVE_CRIPTOGRAFIA = randomBytes(16).toString("base64");
    expect(criptografiaDisponivel()).toBe(false);
  });

  it("mascara identificadores mostrando só o fim", () => {
    expect(mascarar("abcdef123456")).toBe("••••••3456");
    expect(mascarar("abc")).toBe("•••");
  });
});
