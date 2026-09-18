/**
 * Acesso do servidor à chave de acesso do Portal Único da empresa.
 * O Client-Secret só é decifrado aqui, no momento do uso, e nunca vai ao navegador.
 */

import { decifrar } from "./cripto";
import { getChavePortalEmpresa } from "./db";

export interface ChavePortalDecifrada {
  clientId: string;
  clientSecret: string;
}

/** Chave da empresa pronta para autenticar no Portal Único, ou undefined se não houver. */
export async function chavePortalDaEmpresa(importadorId: number): Promise<ChavePortalDecifrada | undefined> {
  const chave = await getChavePortalEmpresa(importadorId);
  if (!chave) return undefined;
  return { clientId: chave.clientId, clientSecret: decifrar(chave.clientSecretCifrado) };
}
