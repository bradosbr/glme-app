/**
 * Consulta da DUIMP na API do Portal Único Siscomex (intervenientes privados),
 * autenticando com a chave de acesso da empresa (Client-Id / Client-Secret).
 *
 * Especificações oficiais (docs.portalunico.siscomex.gov.br):
 * - Autenticação: /api/plat/plat-auth.json — POST /portal/api/autenticar/chave-acesso com os
 *   cabeçalhos Client-Id, Client-Secret e Role-Type; o token volta nos cabeçalhos Set-Token e
 *   X-CSRF-Token (este renovado a cada resposta). Reautenticar em menos de 60 s gera PLAT-ER2033.
 * - DUIMP: /api/dimp/intervenientes-privados.json — base /duimp-api/api/ext, perfil IMPEXP.
 */

import type { ChavePortalDecifrada } from "./chavePortal";
import type { DuimpAdicao, DuimpItem, DuimpParsedData } from "./duimpParser";

const AMBIENTES = {
  producao: "https://portalunico.siscomex.gov.br",
  validacao: "https://val.portalunico.siscomex.gov.br",
} as const;

const ITENS_POR_PAGINA = 100;
const TEMPO_LIMITE_MS = 15000;
/** Token vale 60 min; reaproveita por 50 min para não reautenticar (limite de 60 s). */
const VALIDADE_SESSAO_MS = 50 * 60 * 1000;

export class ErroPortalUnico extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
  }
}

function urlBase(): string {
  const ambiente = (process.env.PORTAL_UNICO_AMBIENTE || "producao") as keyof typeof AMBIENTES;
  return AMBIENTES[ambiente] ?? AMBIENTES.producao;
}

// ---------------------------------------------------------------------------
// Sessão (token + CSRF), reaproveitada por chave enquanto a função estiver ativa
// ---------------------------------------------------------------------------

interface Sessao {
  token: string;
  csrf: string;
  expira: number;
}

const sessoes = new Map<string, Sessao>();

/** Para os testes: esquece as sessões guardadas. */
export function limparSessoesPortal() {
  sessoes.clear();
}

async function lerErro(resp: Response): Promise<string> {
  try {
    const corpo = await resp.json();
    const mensagem = corpo?.message || corpo?.mensagem || corpo?.detail || "";
    const codigo = corpo?.code || corpo?.codigo || "";
    return [codigo, mensagem].filter(Boolean).join(" — ");
  } catch {
    return "";
  }
}

async function autenticar(chave: ChavePortalDecifrada): Promise<Sessao> {
  const cache = sessoes.get(chave.clientId);
  if (cache && cache.expira > Date.now()) return cache;

  const resp = await fetch(`${urlBase()}/portal/api/autenticar/chave-acesso`, {
    method: "POST",
    headers: { "Client-Id": chave.clientId, "Client-Secret": chave.clientSecret, "Role-Type": "IMPEXP" },
    signal: AbortSignal.timeout(TEMPO_LIMITE_MS),
  });
  if (!resp.ok) {
    const detalhe = await lerErro(resp);
    if (/PLAT-ER2033/.test(detalhe)) {
      throw new ErroPortalUnico("O Portal Único recusou uma nova autenticação em menos de 1 minuto. Aguarde e tente de novo.", resp.status);
    }
    if (resp.status === 401 || resp.status === 403 || resp.status === 422) {
      throw new ErroPortalUnico(
        `O Portal Único recusou a chave de acesso da empresa${detalhe ? ` (${detalhe})` : ""}. Confira se a chave está ativa e se o titular tem representação da empresa no perfil importador.`,
        resp.status,
      );
    }
    throw new ErroPortalUnico(`Falha na autenticação no Portal Único (HTTP ${resp.status})${detalhe ? `: ${detalhe}` : ""}.`, resp.status);
  }
  const token = resp.headers.get("set-token");
  const csrf = resp.headers.get("x-csrf-token");
  if (!token || !csrf) throw new ErroPortalUnico("O Portal Único não devolveu o token de acesso.");
  const sessao = { token, csrf, expira: Date.now() + VALIDADE_SESSAO_MS };
  sessoes.set(chave.clientId, sessao);
  return sessao;
}

async function obter<T>(sessao: Sessao, caminho: string): Promise<T> {
  const resp = await fetch(`${urlBase()}/duimp-api/api/ext${caminho}`, {
    headers: { Authorization: sessao.token, "X-CSRF-Token": sessao.csrf, Accept: "application/json" },
    signal: AbortSignal.timeout(TEMPO_LIMITE_MS),
  });
  // O X-CSRF-Token é renovado a cada resposta: sempre reenviar o mais recente
  const novoCsrf = resp.headers.get("x-csrf-token");
  if (novoCsrf) sessao.csrf = novoCsrf;
  if (!resp.ok) {
    const detalhe = await lerErro(resp);
    if (resp.status === 404) throw new ErroPortalUnico("DUIMP não encontrada. Confira o número e a versão.", 404);
    if (resp.status === 401 || resp.status === 403) {
      throw new ErroPortalUnico(
        `Sem permissão para consultar esta DUIMP${detalhe ? ` (${detalhe})` : ""}. A chave precisa ser de quem representa o importador da declaração.`,
        resp.status,
      );
    }
    throw new ErroPortalUnico(`Erro na consulta da DUIMP (HTTP ${resp.status})${detalhe ? `: ${detalhe}` : ""}.`, resp.status);
  }
  return (await resp.json()) as T;
}

// ---------------------------------------------------------------------------
// Tipos da resposta (só os campos usados)
// ---------------------------------------------------------------------------

/**
 * Valores numéricos da resposta: a especificação diz "number", mas o Portal devolve
 * alguns como texto (ex.: pesoLiquido "12.50000"). Tudo passa por num().
 */
type Numero = number | string;

export function num(v: Numero | null | undefined): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const t = String(v ?? "").trim();
  if (!t) return 0;
  // Aceita "1234.56" e "1.234,56"
  const normalizado = t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t;
  const n = Number(normalizado);
  return Number.isFinite(n) ? n : 0;
}

/** Campos de texto que podem chegar como número (NCM, versão, NI): sempre como texto. */
export function texto(v: unknown): string {
  return v === undefined || v === null ? "" : String(v).trim();
}

type TipoTributo = "II" | "IPI" | "PIS" | "COFINS" | "TAXA_UTILIZACAO" | string;

interface TributoCalculado {
  tipo?: TipoTributo;
  valoresBRL?: { devido?: Numero; aRecolher?: Numero };
}

export interface ItemDuimpAPI {
  status?: string;
  /** Importação por conta e ordem / encomenda: ni = CNPJ do adquirente ou encomendante. */
  caracterizacaoImportacao?: { indicador?: string; ni?: string | number };
  identificacao?: { numeroItem?: number };
  produto?: { ncm?: string | number };
  mercadoria?: { pesoLiquido?: Numero; descricao?: string };
  tributos?: {
    mercadoria?: { valorAduaneiroBRL?: Numero };
    tributosCalculados?: TributoCalculado[];
  };
}

export interface DuimpGeralAPI {
  identificacao?: { numero?: string; versao?: string | number; dataRegistro?: string; importador?: { ni?: string | number } };
  adicoes?: { numero?: number; itens?: number[] }[];
  tributos?: { tributosCalculados?: TributoCalculado[] };
  quantidadeItens?: number;
  /** recintoEntrega só vem em situações especiais de despacho (código de 7 dígitos). */
  carga?: { recintoEntrega?: Numero };
}

// ---------------------------------------------------------------------------
// Conversão para o formato usado pelo formulário
// ---------------------------------------------------------------------------

/** Valor do tributo usado na base do ICMS: o valor a recolher (como na DI), ou o devido. */
function valorTributo(lista: TributoCalculado[] | undefined, tipo: TipoTributo): number {
  const t = (lista ?? []).find((x) => x.tipo === tipo);
  const aRecolher = t?.valoresBRL?.aRecolher;
  return num(aRecolher !== undefined && aRecolher !== null && aRecolher !== "" ? aRecolher : t?.valoresBRL?.devido);
}

const centavos = (v: number) => Math.round((v || 0) * 100);
const reais = (c: number) => (c / 100).toFixed(2);

function dataBR(iso?: string): string | undefined {
  const m = iso?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : undefined;
}

/**
 * Monta as adições oficiais da DUIMP (bloco "adicoes" dos dados gerais) somando os valores
 * dos itens de cada uma. Sem esse bloco, agrupa os itens por NCM.
 */
export function mapearDuimpAPI(geral: DuimpGeralAPI, itens: ItemDuimpAPI[]): DuimpParsedData {
  const ativos = itens.filter((i) => i.status !== "INATIVO");
  const porNumero = new Map(ativos.map((i) => [Number(i.identificacao?.numeroItem), i]));

  let grupos: { numero: string; itens: ItemDuimpAPI[] }[];
  if (geral.adicoes && geral.adicoes.length > 0) {
    grupos = geral.adicoes
      .map((a) => ({
        numero: String(a.numero ?? ""),
        itens: (a.itens ?? []).map((n) => porNumero.get(Number(n))).filter((i): i is ItemDuimpAPI => Boolean(i)),
      }))
      .filter((g) => g.itens.length > 0);
  } else {
    const porNcm = new Map<string, ItemDuimpAPI[]>();
    for (const i of ativos) {
      const ncm = texto(i.produto?.ncm);
      porNcm.set(ncm, [...(porNcm.get(ncm) ?? []), i]);
    }
    grupos = Array.from(porNcm.values()).map((lista, idx) => ({ numero: String(idx + 1), itens: lista }));
  }

  const soma = (lista: ItemDuimpAPI[], f: (i: ItemDuimpAPI) => number) => lista.reduce((t, i) => t + centavos(f(i)), 0);

  const adicoes: DuimpAdicao[] = grupos.map((g) => {
    const itensDaAdicao: DuimpItem[] = g.itens.map((i) => ({
      numero: String(i.identificacao?.numeroItem ?? ""),
      descricao: (i.mercadoria?.descricao ?? "").replace(/\s+/g, " ").trim(),
    }));
    const peso = g.itens.reduce((t, i) => t + num(i.mercadoria?.pesoLiquido), 0);
    return {
      numero: g.numero,
      ncm: texto(g.itens[0]?.produto?.ncm),
      descricao: itensDaAdicao.map((i) => i.descricao).filter(Boolean).join(" / "),
      itens: itensDaAdicao,
      valorAduaneiro: reais(soma(g.itens, (i) => num(i.tributos?.mercadoria?.valorAduaneiroBRL))),
      ii: reais(soma(g.itens, (i) => valorTributo(i.tributos?.tributosCalculados, "II"))),
      ipi: reais(soma(g.itens, (i) => valorTributo(i.tributos?.tributosCalculados, "IPI"))),
      pis: reais(soma(g.itens, (i) => valorTributo(i.tributos?.tributosCalculados, "PIS"))),
      cofins: reais(soma(g.itens, (i) => valorTributo(i.tributos?.tributosCalculados, "COFINS"))),
      pesoLiquido: peso > 0 ? peso.toFixed(5) : undefined,
    };
  });

  const total = (campo: "valorAduaneiro" | "ii" | "ipi" | "pis" | "cofins") =>
    adicoes.reduce((t, a) => t + centavos(parseFloat(a[campo] ?? "0")), 0);

  // Taxa Siscomex: total da declaração (os itens também trazem a parcela de cada um)
  const taxaGeral = valorTributo(geral.tributos?.tributosCalculados, "TAXA_UTILIZACAO");
  const taxa = taxaGeral > 0
    ? centavos(taxaGeral)
    : soma(ativos, (i) => valorTributo(i.tributos?.tributosCalculados, "TAXA_UTILIZACAO"));

  const tributos = total("ii") + total("ipi") + total("pis") + total("cofins");

  // Adquirente: primeiro item importado por conta e ordem ou por encomenda
  const porTerceiro = ativos.find(
    (i) => i.caracterizacaoImportacao?.indicador && i.caracterizacaoImportacao.indicador !== "IMPORTACAO_DIRETA" && texto(i.caracterizacaoImportacao.ni),
  );
  const recinto = texto(geral.carga?.recintoEntrega).replace(/\D/g, "");

  return {
    numeroDuimp: texto(geral.identificacao?.numero) || undefined,
    versaoDuimp: texto(geral.identificacao?.versao) || undefined,
    dataRegistro: dataBR(geral.identificacao?.dataRegistro),
    importadorCnpj: texto(geral.identificacao?.importador?.ni) || undefined,
    adquirenteCnpj: porTerceiro ? texto(porTerceiro.caracterizacaoImportacao!.ni) : undefined,
    recintoCodigoRaw: recinto.length >= 7 ? recinto.slice(0, 7) : undefined,
    valorAduaneiro: reais(total("valorAduaneiro")),
    ii: reais(total("ii")),
    ipi: reais(total("ipi")),
    pis: reais(total("pis")),
    cofins: reais(total("cofins")),
    taxaSiscomex: taxa > 0 ? reais(taxa) : undefined,
    impostosTotal: tributos + taxa > 0 ? reais(tributos + taxa) : undefined,
    adicoes,
  };
}

// ---------------------------------------------------------------------------
// Consulta completa
// ---------------------------------------------------------------------------

/** Consulta a DUIMP (versão informada ou a vigente) com todos os itens. */
export async function consultarDuimp(chave: ChavePortalDecifrada, numeroInformado: string, versaoInformada?: string): Promise<DuimpParsedData> {
  const numero = numeroInformado.replace(/[^0-9A-Za-z]/g, "").toUpperCase();
  if (!/^\d{2}BR\d{10}\d$/.test(numero)) {
    throw new ErroPortalUnico("Número da DUIMP inválido. Formato: 26BR0000000000-0.");
  }
  const sessao = await autenticar(chave);

  let versao = (versaoInformada ?? "").replace(/\D/g, "");
  if (!versao || Number(versao) < 1) {
    const vigente = await obter<{ versao?: string }>(sessao, `/duimp/${numero}/versoes`);
    versao = String(vigente.versao ?? "");
    if (!versao) throw new ErroPortalUnico("Não foi possível identificar a versão vigente da DUIMP.");
  }
  versao = String(Number(versao));

  const geral = await obter<DuimpGeralAPI>(sessao, `/duimp/${numero}/${versao}`);

  const itens: ItemDuimpAPI[] = [];
  const total = geral.quantidadeItens ?? Infinity;
  for (let inicial = 1; itens.length < total; inicial += ITENS_POR_PAGINA) {
    const pagina = await obter<ItemDuimpAPI[]>(sessao, `/duimp/${numero}/${versao}/itens?inicial=${inicial}&tamanho=${ITENS_POR_PAGINA}`);
    itens.push(...pagina);
    if (pagina.length < ITENS_POR_PAGINA) break;
  }

  return mapearDuimpAPI(geral, itens);
}
