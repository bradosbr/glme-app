/**
 * Cálculo do ICMS na importação (Pernambuco), por adição e por alíquota.
 *
 * Base legal:
 * - Lei 15.730/2016, art. 12, VI (reproduz a LC 87/1996, art. 13, V): valor aduaneiro
 *   + II + IPI + imposto sobre câmbio (IOF) + outros impostos, taxas, contribuições e
 *   despesas aduaneiras (PIS/COFINS, Taxa Siscomex, taxas de anuentes).
 * - LC 87/1996, art. 13, § 1º, I: o ICMS integra a própria base ("por dentro").
 * - Informativo SEFAZ-PE "Comércio Exterior", item 2.5: divide-se o somatório pela
 *   diferença entre 100 e a alíquota DA MERCADORIA (0,795 para 20,5%; 0,82 para 18%).
 * - Ajuste SINIEF 32/21: Taxa Siscomex e demais despesas rateadas pelo valor aduaneiro
 *   de cada item; AFRMM pelo peso líquido; o rateio alcança itens tributados ou não.
 *
 * Valores monetários são tratados em centavos (inteiros) para que os rateios
 * fechem exatamente com o total da declaração.
 */

import { consultarAliquotaNCM, formatarMoeda } from "./aliquotasICMS";
import { ncmNaListaNegativa } from "./listaNegativa";

export interface ValoresAdicao {
  valorAduaneiro: number;
  ii: number;
  ipi: number;
  pis: number;
  cofins: number;
  /** Peso líquido em kg — critério de rateio do AFRMM. */
  pesoLiquido?: number;
}

export interface AdicaoParaCalculo extends ValoresAdicao {
  adicao: string;
  ncm: string;
  /** Regime definido pelo usuário; sem ele, vale a lista negativa do PEAP. */
  regime?: Regime;
}

/** Despesas lançadas uma vez por declaração e rateadas entre as adições. */
export interface DespesasDeclaracao {
  taxaSiscomex: number;
  /** Taxas de órgãos anuentes (Anvisa, Mapa, Inmetro...) e demais valores devidos à aduana. */
  outrasDespesas: number;
  /** Imposto sobre operações de câmbio (IOF-câmbio) da importação. */
  iofCambio: number;
  afrmm: number;
  /** A inclusão do AFRMM na base não é pacífica em PE: fica a critério do usuário. */
  incluirAFRMM: boolean;
}

export type Regime = "diferimento" | "tributacao_normal";

export interface DespesasRateadas {
  taxaSiscomex: number;
  outrasDespesas: number;
  iofCambio: number;
  afrmm: number;
  total: number;
}

export interface AdicaoCalculada extends AdicaoParaCalculo {
  aliquota: number;
  regime: Regime;
  tributosFederais: number;
  despesas: DespesasRateadas;
  /** Valor aduaneiro + tributos federais + despesas aduaneiras (VT da adição). */
  valorPartida: number;
  divisor: number;
  /** Base de cálculo "por dentro" (VTI da adição). */
  baseCalculo: number;
  icms: number;
}

export interface GrupoAliquota {
  regime: Regime;
  aliquota: number;
  divisor: number;
  adicoes: string[];
  valorAduaneiro: number;
  tributosFederais: number;
  despesas: number;
  /** VT = valor aduaneiro + tributos federais + despesas. */
  valorPartida: number;
  /** VTI = VT ÷ (1 − alíquota). */
  baseCalculo: number;
  /** VF = VTI × alíquota. */
  icms: number;
}

export interface ResultadoICMS {
  adicoes: AdicaoCalculada[];
  diferimento: GrupoAliquota[];
  tributacaoNormal: GrupoAliquota[];
  totalDiferido: number;
  totalTributacaoNormal: number;
}

export interface OpcoesCalculo {
  aliquotaDe?: (ncm: string) => number;
  naListaNegativa?: (ncm: string) => boolean;
}

const aliquotaPadraoDe = (ncm: string) => consultarAliquotaNCM(ncm).aliquota;
const listaNegativaPadrao = (ncm: string) => ncmNaListaNegativa((ncm || "").replace(/\D/g, ""));

const paraCentavos = (v: number) => Math.round((Number.isFinite(v) ? v : 0) * 100);
const paraReais = (c: number) => c / 100;

/** 1 − alíquota, ex.: 20,5% → 0,795. */
export function divisorDaAliquota(aliquota: number): number {
  return Math.round((1 - aliquota / 100) * 1e6) / 1e6;
}

/**
 * Distribui um total em centavos proporcionalmente aos pesos (maiores restos):
 * a soma das partes é sempre igual ao total. Sem pesos válidos, divide em partes iguais.
 */
export function ratear(totalCentavos: number, pesos: number[]): number[] {
  if (pesos.length === 0) return [];
  const validos = pesos.map((p) => (Number.isFinite(p) && p > 0 ? p : 0));
  const soma = validos.reduce((a, b) => a + b, 0);
  const base = soma > 0 ? validos : pesos.map(() => 1);
  const somaBase = soma > 0 ? soma : pesos.length;

  const exatos = base.map((p) => (totalCentavos * p) / somaBase);
  const partes = exatos.map((v) => Math.floor(v));
  let resto = totalCentavos - partes.reduce((a, b) => a + b, 0);
  const ordem = exatos
    .map((v, i) => ({ i, fracao: v - Math.floor(v) }))
    .sort((a, b) => b.fracao - a.fracao || a.i - b.i);
  for (let k = 0; resto > 0; k = (k + 1) % ordem.length, resto--) partes[ordem[k].i]++;
  return partes;
}

function calcularBase(partidaCentavos: number, aliquota: number) {
  const divisor = divisorDaAliquota(aliquota);
  const baseCentavos = Math.round(partidaCentavos / divisor);
  const icmsCentavos = Math.round((baseCentavos * aliquota) / 100);
  return { divisor, baseCentavos, icmsCentavos };
}

/**
 * Calcula o ICMS de cada adição e agrupa por regime e alíquota.
 * Adições na lista negativa do PEAP ficam em "tributação normal" (fora da GLME).
 */
export function calcularICMS(
  adicoes: AdicaoParaCalculo[],
  despesas: DespesasDeclaracao,
  opcoes: OpcoesCalculo = {},
): ResultadoICMS {
  const aliquotaDe = opcoes.aliquotaDe ?? aliquotaPadraoDe;
  const naListaNegativa = opcoes.naListaNegativa ?? listaNegativaPadrao;

  const valoresAduaneiros = adicoes.map((a) => paraCentavos(a.valorAduaneiro));
  const pesos = adicoes.map((a) => a.pesoLiquido ?? 0);
  const temTodosOsPesos = pesos.length > 0 && pesos.every((p) => p > 0);

  const siscomex = ratear(paraCentavos(despesas.taxaSiscomex), valoresAduaneiros);
  const outras = ratear(paraCentavos(despesas.outrasDespesas), valoresAduaneiros);
  const iof = ratear(paraCentavos(despesas.iofCambio), valoresAduaneiros);
  // AFRMM pelo peso líquido; sem o peso de todas as adições, usa o valor aduaneiro
  const afrmm = despesas.incluirAFRMM
    ? ratear(paraCentavos(despesas.afrmm), temTodosOsPesos ? pesos : valoresAduaneiros)
    : adicoes.map(() => 0);

  const calculadas: AdicaoCalculada[] = adicoes.map((a, i) => {
    const aliquota = aliquotaDe(a.ncm);
    const tributos = paraCentavos(a.ii) + paraCentavos(a.ipi) + paraCentavos(a.pis) + paraCentavos(a.cofins);
    const desp = siscomex[i] + outras[i] + iof[i] + afrmm[i];
    const partida = valoresAduaneiros[i] + tributos + desp;
    const { divisor, baseCentavos, icmsCentavos } = calcularBase(partida, aliquota);
    return {
      ...a,
      aliquota,
      regime: a.regime ?? (naListaNegativa(a.ncm) ? "tributacao_normal" : "diferimento"),
      tributosFederais: paraReais(tributos),
      despesas: {
        taxaSiscomex: paraReais(siscomex[i]),
        outrasDespesas: paraReais(outras[i]),
        iofCambio: paraReais(iof[i]),
        afrmm: paraReais(afrmm[i]),
        total: paraReais(desp),
      },
      valorPartida: paraReais(partida),
      divisor,
      baseCalculo: paraReais(baseCentavos),
      icms: paraReais(icmsCentavos),
    };
  });

  const diferimento = agrupar(calculadas, "diferimento");
  const tributacaoNormal = agrupar(calculadas, "tributacao_normal");
  const soma = (g: GrupoAliquota[]) => paraReais(g.reduce((t, x) => t + paraCentavos(x.icms), 0));

  return {
    adicoes: calculadas,
    diferimento,
    tributacaoNormal,
    totalDiferido: soma(diferimento),
    totalTributacaoNormal: soma(tributacaoNormal),
  };
}

/** O grupo soma as parcelas (VT) e aplica a base e a alíquota sobre o total. */
function agrupar(adicoes: AdicaoCalculada[], regime: Regime): GrupoAliquota[] {
  const porAliquota = new Map<number, AdicaoCalculada[]>();
  for (const a of adicoes.filter((x) => x.regime === regime)) {
    porAliquota.set(a.aliquota, [...(porAliquota.get(a.aliquota) ?? []), a]);
  }
  return Array.from(porAliquota.entries())
    .sort(([a], [b]) => a - b)
    .map(([aliquota, lista]) => {
      const soma = (f: (x: AdicaoCalculada) => number) => lista.reduce((t, x) => t + paraCentavos(f(x)), 0);
      const partida = soma((x) => x.valorPartida);
      const { divisor, baseCentavos, icmsCentavos } = calcularBase(partida, aliquota);
      return {
        regime,
        aliquota,
        divisor,
        adicoes: lista.map((x) => x.adicao),
        valorAduaneiro: paraReais(soma((x) => x.valorAduaneiro)),
        tributosFederais: paraReais(soma((x) => x.tributosFederais)),
        despesas: paraReais(soma((x) => x.despesas.total)),
        valorPartida: paraReais(partida),
        baseCalculo: paraReais(baseCentavos),
        icms: paraReais(icmsCentavos),
      };
    });
}

/**
 * Cálculo pelos totais da declaração, para quando não há os valores de cada adição
 * (digitação manual ou extrato sem valores por item). Uma única alíquota.
 */
export function calcularPorTotais(
  totais: { valorAduaneiro: number; tributosFederais: number },
  despesas: DespesasDeclaracao,
  aliquota: number,
): GrupoAliquota {
  const desp =
    paraCentavos(despesas.taxaSiscomex) + paraCentavos(despesas.outrasDespesas) +
    paraCentavos(despesas.iofCambio) + (despesas.incluirAFRMM ? paraCentavos(despesas.afrmm) : 0);
  const va = paraCentavos(totais.valorAduaneiro);
  const trib = paraCentavos(totais.tributosFederais);
  const partida = va + trib + desp;
  const { divisor, baseCentavos, icmsCentavos } = calcularBase(partida, aliquota);
  return {
    regime: "diferimento",
    aliquota,
    divisor,
    adicoes: [],
    valorAduaneiro: paraReais(va),
    tributosFederais: paraReais(trib),
    despesas: paraReais(desp),
    valorPartida: paraReais(partida),
    baseCalculo: paraReais(baseCentavos),
    icms: paraReais(icmsCentavos),
  };
}

// ---------------------------------------------------------------------------
// Memória de cálculo (campo 5.4 da GLME)
// ---------------------------------------------------------------------------

export const formatarAliquota = (a: number) => `${a.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;
export const formatarDivisor = (d: number) => d.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 6 });

const listarAdicoes = (adicoes: string[]) =>
  adicoes.length === 1 ? `ADIÇÃO ${adicoes[0]}` : `ADIÇÕES ${adicoes.join(", ")}`;

export interface LinhaMemoria {
  texto: string;
  destaque?: boolean;
}

/**
 * Linhas da memória de cálculo impressas na GLME: VT, VTI e VF de cada alíquota
 * do ICMS diferido e, em seguida, as adições de tributação normal (fora da guia).
 */
export function memoriaDeCalculo(
  diferimento: GrupoAliquota[],
  tributadas: Array<Pick<AdicaoCalculada, "adicao" | "ncm" | "aliquota"> & { icms?: number }> = [],
): LinhaMemoria[] {
  const linhas: LinhaMemoria[] = [];
  const variasAliquotas = diferimento.length > 1;

  for (const g of diferimento) {
    const titulo = g.adicoes.length > 0 || variasAliquotas
      ? `ALÍQUOTA ${formatarAliquota(g.aliquota)}${g.adicoes.length > 0 ? ` — ${listarAdicoes(g.adicoes)}` : ""}: `
      : "";
    linhas.push({
      texto: `${titulo}(VALOR ADUANEIRO) R$ ${formatarMoeda(g.valorAduaneiro)} + TRIBUTOS FEDERAIS R$ ${formatarMoeda(g.tributosFederais)} + DESPESAS ADUANEIRAS R$ ${formatarMoeda(g.despesas)} = (VT) R$ ${formatarMoeda(g.valorPartida)}`,
      destaque: true,
    });
    linhas.push({
      texto: `BASE DE CÁLCULO: (VT) R$ ${formatarMoeda(g.valorPartida)} ÷ ${formatarDivisor(g.divisor)} = (VTI) R$ ${formatarMoeda(g.baseCalculo)}`,
      destaque: true,
    });
    linhas.push({
      texto: `ICMS: (VTI) R$ ${formatarMoeda(g.baseCalculo)} × ${formatarAliquota(g.aliquota)} = (VF) R$ ${formatarMoeda(g.icms)}`,
      destaque: true,
    });
  }

  if (variasAliquotas) {
    const total = diferimento.reduce((t, g) => t + paraCentavos(g.icms), 0);
    linhas.push({ texto: `TOTAL DO ICMS DIFERIDO: R$ ${formatarMoeda(paraReais(total))}`, destaque: true });
  }

  for (const a of tributadas) {
    linhas.push({
      texto: `ADIÇÃO ${a.adicao} - NCM ${a.ncm} - TRIBUTAÇÃO NORMAL - ALÍQUOTA ${formatarAliquota(a.aliquota)}${a.icms !== undefined ? ` - VALOR DO ICMS - R$ ${formatarMoeda(a.icms)}` : ""}. RECOLHIMENTO INTEGRAL: A ADIÇÃO NÃO CONSTA NA GLME.`,
    });
  }

  return linhas;
}

/**
 * Versão compacta para a frente da guia, onde o campo 5.4 tem pouca altura:
 * com uma alíquota é igual à memória completa; com várias, uma linha por
 * alíquota e o total — o detalhamento vai no verso.
 */
export function memoriaResumida(
  diferimento: GrupoAliquota[],
  tributadas: Array<Pick<AdicaoCalculada, "adicao" | "ncm" | "aliquota"> & { icms?: number }> = [],
): LinhaMemoria[] {
  if (diferimento.length <= 1) return memoriaDeCalculo(diferimento, tributadas);
  const linhas: LinhaMemoria[] = diferimento.map((g) => ({
    texto: `ALÍQUOTA ${formatarAliquota(g.aliquota)}${g.adicoes.length > 0 ? ` (${listarAdicoes(g.adicoes)})` : ""}: (VT) R$ ${formatarMoeda(g.valorPartida)} ÷ ${formatarDivisor(g.divisor)} = (VTI) R$ ${formatarMoeda(g.baseCalculo)} × ${formatarAliquota(g.aliquota)} = (VF) R$ ${formatarMoeda(g.icms)}`,
    destaque: true,
  }));
  const total = diferimento.reduce((t, g) => t + paraCentavos(g.icms), 0);
  linhas.push({ texto: `TOTAL DO ICMS DIFERIDO: R$ ${formatarMoeda(paraReais(total))} — MEMÓRIA DE CÁLCULO DETALHADA NO VERSO.`, destaque: true });
  for (const a of tributadas) {
    linhas.push({
      texto: `ADIÇÃO ${a.adicao} (NCM ${a.ncm}): TRIBUTAÇÃO NORMAL A ${formatarAliquota(a.aliquota)}${a.icms !== undefined ? ` - ICMS R$ ${formatarMoeda(a.icms)}` : ""} - NÃO CONSTA NA GLME.`,
    });
  }
  return linhas;
}
