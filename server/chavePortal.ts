/**
 * Acesso do servidor à chave de acesso do Portal Único do usuário.
 * O Client-Secret só é decifrado aqui, no momento do uso, e nunca vai ao navegador.
 */

import { decifrar } from "./cripto";
import { getChavePortal } from "./db";

export interface ChavePortalDecifrada {
  clientId: string;
  clientSecret: string;
}

/** Chave do usuário pronta para autenticar no Portal Único, ou undefined se não houver. */
export async function chavePortalDoUsuario(userId: number): Promise<ChavePortalDecifrada | undefined> {
  const chave = await getChavePortal(userId);
  if (!chave) return undefined;
  return { clientId: chave.clientId, clientSecret: decifrar(chave.clientSecretCifrado) };
}
