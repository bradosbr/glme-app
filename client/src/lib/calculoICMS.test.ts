import { describe, expect, it } from "vitest";
import {
  calcularICMS,
  calcularPorTotais,
  divisorDaAliquota,
  memoriaDeCalculo,
  memoriaResumida,
  ratear,
  type AdicaoParaCalculo,
  type DespesasDeclaracao,
} from "./calculoICMS";

const semDespesas: DespesasDeclaracao = { taxaSiscomex: 0, outrasDespesas: 0, iofCambio: 0, afrmm: 0, incluirAFRMM: false };

/** Alíquota e lista negativa fixas por NCM, para os testes não dependerem das tabelas. */
const opcoes = (aliquotas: Record<string, number>, negativa: string[] = []) => ({
  aliquotaDe: (ncm: string) => aliquotas[ncm] ?? 20.5,
  naListaNegativa: (ncm: string) => negativa.includes(ncm),
});

const adicao = (adicao: string, ncm: string, valorAduaneiro: number, tributos = 0, pesoLiquido?: number): AdicaoParaCalculo => ({
  adicao, ncm, valorAduaneiro, ii: tributos, ipi: 0, pis: 0, cofins: 0, pesoLiquido,
});

describe("divisor da base por dentro", () => {
  it("é 1 − alíquota da mercadoria", () => {
    expect(divisorDaAliquota(20.5)).toBe(0.795);
    expect(divisorDaAliquota(18)).toBe(0.82);
    expect(divisorDaAliquota(29)).toBe(0.71);
    expect(divisorDaAliquota(22.5)).toBe(0.775);
    expect(divisorDaAliquota(15.52)).toBe(0.8448);
  });
});

describe("rateio em centavos", () => {
  it("é proporcional e fecha exatamente com o total (Taxa Siscomex por valor aduaneiro)", () => {
    const partes = ratear(23134, [900000, 100000]);
    expect(partes).toEqual([20821, 2313]);
    expect(partes[0] + partes[1]).toBe(23134);
  });

  it("divide em partes iguais quando não há pesos", () => {
    expect(ratear(100, [0, 0, 0])).toEqual([34, 33, 33]);
  });
});

describe("cálculo por adição", () => {
  it("reproduz o exemplo oficial da SEFAZ-PE (alíquota de 18%, divisor 0,82)", () => {
    const r = calcularICMS(
      [{ adicao: "1", ncm: "X", valorAduaneiro: 3500, ii: 200, ipi: 350, pis: 8.6, cofins: 39.7 }],
      { ...semDespesas, outrasDespesas: 51.7 },
      opcoes({ X: 18 }),
    );
    expect(r.adicoes[0].valorPartida).toBe(4150);
    expect(r.adicoes[0].baseCalculo).toBe(5060.98);
    expect(r.adicoes[0].icms).toBe(910.98);
  });

  it("usa o divisor da própria alíquota (29%: 0,71, não 0,795)", () => {
    const r = calcularICMS([adicao("1", "24022000", 100000, 61865.67)], semDespesas, opcoes({ "24022000": 29 }));
    expect(r.adicoes[0].divisor).toBe(0.71);
    expect(r.adicoes[0].baseCalculo).toBe(227979.82);
    expect(r.adicoes[0].icms).toBe(66114.15);
  });

  it("separa alíquotas diferentes em grupos, cada um com o seu divisor", () => {
    const r = calcularICMS(
      [adicao("1", "A", 1000), adicao("2", "B", 1000), adicao("3", "A", 1000)],
      semDespesas,
      opcoes({ A: 20.5, B: 29 }),
    );
    expect(r.diferimento.map((g) => [g.aliquota, g.divisor, g.adicoes])).toEqual([
      [20.5, 0.795, ["1", "3"]],
      [29, 0.71, ["2"]],
    ]);
    // 2000 ÷ 0,795 = 2515,72 × 20,5% = 515,72 · 1000 ÷ 0,71 = 1408,45 × 29% = 408,45
    expect(r.diferimento[0].icms).toBe(515.72);
    expect(r.diferimento[1].icms).toBe(408.45);
    expect(r.totalDiferido).toBe(924.17);
  });

  it("rateia a Taxa Siscomex pelo valor aduaneiro, inclusive na adição de tributação normal", () => {
    const r = calcularICMS(
      [adicao("1", "A", 900000), adicao("2", "NEG", 100000)],
      { ...semDespesas, taxaSiscomex: 231.34 },
      opcoes({}, ["NEG"]),
    );
    expect(r.adicoes.map((a) => a.despesas.taxaSiscomex)).toEqual([208.21, 23.13]);
    expect(r.diferimento).toHaveLength(1);
    expect(r.diferimento[0].adicoes).toEqual(["1"]);
    expect(r.tributacaoNormal[0].adicoes).toEqual(["2"]);
  });

  it("inclui IOF-câmbio e outras despesas aduaneiras na base", () => {
    const r = calcularICMS([adicao("1", "A", 1000)], { ...semDespesas, iofCambio: 10, outrasDespesas: 20 }, opcoes({}));
    expect(r.adicoes[0].valorPartida).toBe(1030);
  });

  it("só soma o AFRMM quando marcado, rateado pelo peso líquido", () => {
    const itens = [adicao("1", "A", 1000, 0, 30), adicao("2", "A", 1000, 0, 10)];
    const sem = calcularICMS(itens, { ...semDespesas, afrmm: 100 }, opcoes({}));
    expect(sem.adicoes.map((a) => a.despesas.afrmm)).toEqual([0, 0]);
    const com = calcularICMS(itens, { ...semDespesas, afrmm: 100, incluirAFRMM: true }, opcoes({}));
    expect(com.adicoes.map((a) => a.despesas.afrmm)).toEqual([75, 25]);
  });
});

describe("cálculo pelos totais", () => {
  it("aplica o divisor da alíquota informada", () => {
    const g = calcularPorTotais({ valorAduaneiro: 3500, tributosFederais: 598.3 }, { ...semDespesas, outrasDespesas: 51.7 }, 18);
    expect(g.valorPartida).toBe(4150);
    expect(g.icms).toBe(910.98);
  });
});

describe("memória de cálculo da GLME", () => {
  it("com uma alíquota, imprime VT, VTI e VF sem cabeçalho de grupo", () => {
    const g = calcularPorTotais({ valorAduaneiro: 1000, tributosFederais: 0 }, semDespesas, 20.5);
    const linhas = memoriaDeCalculo([g]).map((l) => l.texto);
    expect(linhas).toHaveLength(3);
    expect(linhas[0].startsWith("(VALOR ADUANEIRO) R$ 1.000,00")).toBe(true);
    expect(linhas[1]).toBe("BASE DE CÁLCULO: (VT) R$ 1.000,00 ÷ 0,795 = (VTI) R$ 1.257,86");
    expect(linhas[2]).toBe("ICMS: (VTI) R$ 1.257,86 × 20,5% = (VF) R$ 257,86");
  });

  it("com várias alíquotas, identifica as adições de cada uma e totaliza", () => {
    const r = calcularICMS([adicao("1", "A", 1000), adicao("2", "B", 1000), adicao("3", "NEG", 500)], semDespesas, opcoes({ B: 29 }, ["NEG"]));
    const linhas = memoriaDeCalculo(r.diferimento, r.adicoes.filter((a) => a.regime === "tributacao_normal")).map((l) => l.texto);
    expect(linhas[0].startsWith("ALÍQUOTA 20,5% — ADIÇÃO 1: ")).toBe(true);
    expect(linhas[3].startsWith("ALÍQUOTA 29% — ADIÇÃO 2: ")).toBe(true);
    expect(linhas[6]).toBe("TOTAL DO ICMS DIFERIDO: R$ 666,31");
    expect(linhas[7]).toContain("ADIÇÃO 3 - NCM NEG - TRIBUTAÇÃO NORMAL");
  });
});

describe("memória resumida (frente da guia)", () => {
  it("com uma alíquota é igual à completa", () => {
    const g = calcularPorTotais({ valorAduaneiro: 1000, tributosFederais: 0 }, semDespesas, 20.5);
    expect(memoriaResumida([g])).toEqual(memoriaDeCalculo([g]));
  });

  it("com várias alíquotas usa uma linha por alíquota e remete ao verso", () => {
    const r = calcularICMS([adicao("1", "A", 1000), adicao("2", "B", 1000)], semDespesas, opcoes({ B: 29 }));
    const linhas = memoriaResumida(r.diferimento).map((l) => l.texto);
    expect(linhas).toEqual([
      "ALÍQUOTA 20,5% (ADIÇÃO 1): (VT) R$ 1.000,00 ÷ 0,795 = (VTI) R$ 1.257,86 × 20,5% = (VF) R$ 257,86",
      "ALÍQUOTA 29% (ADIÇÃO 2): (VT) R$ 1.000,00 ÷ 0,71 = (VTI) R$ 1.408,45 × 29% = (VF) R$ 408,45",
      "TOTAL DO ICMS DIFERIDO: R$ 666,31 — MEMÓRIA DE CÁLCULO DETALHADA NO VERSO.",
    ]);
  });
});
