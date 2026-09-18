/**
 * Cifragem de segredos guardados no banco (ex.: Client-Secret da chave de acesso
 * do Portal Único), com AES-256-GCM.
 *
 * A chave vem de CHAVE_CRIPTOGRAFIA: 32 bytes em base64. Gerar com
 *   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
 * Use uma chave diferente em cada ambiente. Se a chave for perdida ou trocada,
 * os segredos guardados não podem mais ser lidos (o usuário cadastra de novo).
 *
 * Formato gravado: "v1:<iv>:<tag>:<conteúdo>", cada parte em base64.
 */

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const VERSAO = "v1";

export class ErroCripto extends Error {}

function chave(): Buffer {
  const base64 = (process.env.CHAVE_CRIPTOGRAFIA || "").trim();
  if (!base64) throw new ErroCripto("Chave de criptografia não configurada (variável CHAVE_CRIPTOGRAFIA).");
  const bytes = Buffer.from(base64, "base64");
  if (bytes.length !== 32) throw new ErroCripto("CHAVE_CRIPTOGRAFIA precisa ter 32 bytes em base64.");
  return bytes;
}

export function criptografiaDisponivel(): boolean {
  try {
    chave();
    return true;
  } catch {
    return false;
  }
}

export function cifrar(texto: string): string {
  const iv = randomBytes(12);
  const cifra = createCipheriv("aes-256-gcm", chave(), iv);
  const conteudo = Buffer.concat([cifra.update(texto, "utf8"), cifra.final()]);
  const tag = cifra.getAuthTag();
  return [VERSAO, iv.toString("base64"), tag.toString("base64"), conteudo.toString("base64")].join(":");
}

export function decifrar(gravado: string): string {
  const [versao, iv, tag, conteudo] = gravado.split(":");
  if (versao !== VERSAO || !iv || !tag || conteudo === undefined) {
    throw new ErroCripto("Formato de segredo cifrado desconhecido.");
  }
  try {
    const decifra = createDecipheriv("aes-256-gcm", chave(), Buffer.from(iv, "base64"));
    decifra.setAuthTag(Buffer.from(tag, "base64"));
    return Buffer.concat([decifra.update(Buffer.from(conteudo, "base64")), decifra.final()]).toString("utf8");
  } catch (e) {
    if (e instanceof ErroCripto) throw e;
    // Tag inválida: chave trocada ou conteúdo adulterado
    throw new ErroCripto("Não foi possível decifrar o segredo: a chave de criptografia mudou ou o dado foi alterado.");
  }
}

/** Mostra só o fim de um identificador (ex.: "••••••7f3a"). */
export function mascarar(valor: string, visiveis = 4): string {
  if (valor.length <= visiveis) return "•".repeat(valor.length);
  return `${"•".repeat(6)}${valor.slice(-visiveis)}`;
}
