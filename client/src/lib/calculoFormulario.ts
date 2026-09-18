/**
 * Liga o formulário da GLME ao motor de cálculo (calculoICMS).
 *
 * Dois modos:
 * - "por_adicao": todas as adições têm valor aduaneiro → cálculo por adição,
 *   agrupado por alíquota, com rateio das despesas (o correto quando há
 *   alíquotas diferentes na mesma declaração);
 * - "totais": sem os valores de cada adição (digitação manual ou extrato sem
 *   valores por item) → cálculo único sobre os totais da declaração.
 *
 * O resultado é derivado a cada renderização: qualquer campo alterado
 * (inclusive o valor aduaneiro da seção ICMS) refaz o cálculo.
 */

import type { FormData, ValoresAdicaoForm } from "@/hooks/useGLMEForm";
import { ALIQUOTA_PADRAO, consultarAliquotaNCM } from "./aliquotasICMS";
import {
  calcularICMS,
  calcularPorTotais,
  formatarAliquota,
  memoriaDeCalculo,
  memoriaResumida,
  type AdicaoCalculada,
  type AdicaoParaCalculo,
  type DespesasDeclaracao,
  type GrupoAliquota,
  type LinhaMemoria,
} from "./calculoICMS";

export type ModoCalculo = "por_adicao" | "totais";

export interface CalculoFormulario {
  modo: ModoCalculo;
  despesas: DespesasDeclaracao;
  /** Grupos do ICMS diferido (os que vão para a GLME), um por alíquota. */
  diferimento: GrupoAliquota[];
  totalDiferido: number;
  /** Adições da GLME calculadas (modo por adição), na ordem do formulário. */
  produtos: (AdicaoCalculada | undefined)[];
  /** Adições de tributação normal calculadas (modo por adição), na ordem do formulário. */
  tributadas: (AdicaoCalculada | undefined)[];
  totalTributacaoNormal: number;
  /** Valor aduaneiro das adições que constam na guia (campo 5.5). */
  valorAduaneiroGLME: number;
  /** Memória completa (verso da guia). */
  memoria: LinhaMemoria[];
  /** Memória compacta (frente da guia, campo 5.4 com pouca altura). */
  memoriaFrente: LinhaMemoria[];
  avisos: string[];
}

/** Converte o texto digitado em número (aceita "1.234,56" e "1234.56"). */
export function paraNumero(v: string | number | undefined | null): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const t = String(v ?? "").trim();
  if (!t) return 0;
  const normalizado = t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t;
  const n = parseFloat(normalizado);
  return Number.isFinite(n) ? n : 0;
}

const ncmLimpo = (ncm?: string) => (ncm || "").replace(/\D/g, "");

function paraCalculo(
  adicao: string,
  ncm: string,
  valores: ValoresAdicaoForm,
  regime: AdicaoParaCalculo["regime"],
): AdicaoParaCalculo {
  return {
    adicao,
    ncm,
    regime,
    valorAduaneiro: paraNumero(valores.valorAduaneiro),
    ii: paraNumero(valores.ii),
    ipi: paraNumero(valores.ipi),
    pis: paraNumero(valores.pis),
    cofins: paraNumero(valores.cofins),
    pesoLiquido: paraNumero(valores.pesoLiquido) || undefined,
    aliquota: paraNumero(valores.aliquota) || undefined,
  };
}

export function despesasDoFormulario(icms: FormData["icmsCalculo"]): DespesasDeclaracao {
  return {
    taxaSiscomex: paraNumero(icms.taxaSiscomex),
    outrasDespesas: paraNumero(icms.outrasDespesas),
    iofCambio: paraNumero(icms.iofCambio),
    afrmm: paraNumero(icms.afrmm),
    incluirAFRMM: Boolean(icms.incluirAFRMM),
  };
}

export function calcularFormulario(formData: FormData): CalculoFormulario {
  const despesas = despesasDoFormulario(formData.icmsCalculo);
  const produtos = formData.produtos.filter((p) => ncmLimpo(p.classeTarifaria || p.ncm) || p.adicao);
  const tributadas = formData.adicoesTributadas ?? [];
  const avisos: string[] = [];

  const temValor = (v?: ValoresAdicaoForm) => Boolean(v) && paraNumero(v!.valorAduaneiro) > 0;
  const todas = [...produtos.map((p) => p.valores), ...tributadas.map((t) => t.valores)];
  const porAdicao = todas.length > 0 && todas.every(temValor);

  if (porAdicao) {
    const entrada: AdicaoParaCalculo[] = [
      ...produtos.map((p) => paraCalculo(p.adicao, ncmLimpo(p.classeTarifaria || p.ncm), p.valores!, "diferimento")),
      ...tributadas.map((t) => paraCalculo(t.adicao, ncmLimpo(t.ncm), t.valores!, "tributacao_normal")),
    ];
    const r = calcularICMS(entrada, despesas);
    const calculadosProdutos = r.adicoes.slice(0, produtos.length);
    const calculadasTributadas = r.adicoes.slice(produtos.length);

    // Mantém a posição de cada adição do formulário (as sem NCM nem número ficam de fora)
    const indice = new Map(produtos.map((p, i) => [p, calculadosProdutos[i]]));

    return {
      modo: "por_adicao",
      despesas,
      diferimento: r.diferimento,
      totalDiferido: r.totalDiferido,
      produtos: formData.produtos.map((p) => indice.get(p)),
      tributadas: calculadasTributadas,
      totalTributacaoNormal: r.totalTributacaoNormal,
      valorAduaneiroGLME: calculadosProdutos.reduce((t, a) => t + Math.round(a.valorAduaneiro * 100), 0) / 100,
      memoria: memoriaDeCalculo(r.diferimento, calculadasTributadas),
      memoriaFrente: memoriaResumida(r.diferimento, calculadasTributadas),
      avisos,
    };
  }

  // ---- Cálculo pelos totais da declaração ----
  const aliquotas = Array.from(
    new Set(
      produtos
        .map((p) => ncmLimpo(p.classeTarifaria || p.ncm))
        .filter((n) => n.length >= 4)
        .map((n) => consultarAliquotaNCM(n).aliquota),
    ),
  );
  const aliquota = aliquotas.length === 1 ? aliquotas[0] : ALIQUOTA_PADRAO;

  if (aliquotas.length > 1) {
    avisos.push(
      `As adições têm alíquotas diferentes (${aliquotas.map(formatarAliquota).join(", ")}). ` +
        `Informe o valor aduaneiro e os tributos de cada adição para calcular o ICMS por alíquota; ` +
        `até lá, o total é calculado a ${formatarAliquota(aliquota)}.`,
    );
  }
  if (tributadas.length > 0) {
    avisos.push(
      "Há adições de tributação normal. Sem os valores de cada adição, o valor aduaneiro e os tributos " +
        "informados devem corresponder só às adições da GLME.",
    );
  }
  if (todas.some(temValor) && !porAdicao) {
    avisos.push("Algumas adições têm valores e outras não: preencha o valor aduaneiro de todas para calcular por adição.");
  }

  const grupo = calcularPorTotais(
    { valorAduaneiro: paraNumero(formData.icmsCalculo.valorCIF), tributosFederais: paraNumero(formData.icmsCalculo.impostos) },
    despesas,
    aliquota,
  );
  const diferimento = grupo.valorPartida > 0 ? [grupo] : [];
  const tributadasSemValor = tributadas.map((t) => ({
    adicao: t.adicao,
    ncm: ncmLimpo(t.ncm),
    aliquota: consultarAliquotaNCM(ncmLimpo(t.ncm)).aliquota,
  }));

  return {
    modo: "totais",
    despesas,
    diferimento,
    totalDiferido: diferimento[0]?.icms ?? 0,
    produtos: formData.produtos.map(() => undefined),
    tributadas: tributadas.map(() => undefined),
    totalTributacaoNormal: 0,
    valorAduaneiroGLME: paraNumero(formData.icmsCalculo.valorCIF),
    memoria: memoriaDeCalculo(diferimento, tributadasSemValor),
    memoriaFrente: memoriaResumida(diferimento, tributadasSemValor),
    avisos,
  };
}

/** Converte valores numéricos (DI/DUIMP) em texto do formulário. */
export function valoresDaDeclaracao(v: {
  valorAduaneiro?: string | number;
  ii?: string | number;
  ipi?: string | number;
  pis?: string | number;
  cofins?: string | number;
  pesoLiquido?: string | number;
}): ValoresAdicaoForm | undefined {
  if (!(paraNumero(v.valorAduaneiro) > 0)) return undefined;
  const t = (x?: string | number) => (paraNumero(x) ? String(paraNumero(x)) : "");
  return {
    valorAduaneiro: t(v.valorAduaneiro),
    ii: t(v.ii),
    ipi: t(v.ipi),
    pis: t(v.pis),
    cofins: t(v.cofins),
    pesoLiquido: t(v.pesoLiquido) || undefined,
  };
}
