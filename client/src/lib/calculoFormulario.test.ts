import { describe, expect, it } from "vitest";
import type { FormData, ProdutoAdicao } from "@/hooks/useGLMEForm";
import { calcularFormulario, paraNumero, valoresDaDeclaracao } from "./calculoFormulario";

const empresa = { nome: "", inscricaoEstadual: "", cnpj: "", cnae: "", endereco: "", bairro: "", cep: "", municipio: "", uf: "", telefone: "" };

function formulario(parcial: Partial<FormData> & { icms?: Partial<FormData["icmsCalculo"]> }): FormData {
  const { icms, ...resto } = parcial;
  return {
    secretariaUF: "PE",
    importador: empresa,
    adquirente: empresa,
    documento: { tipo: ["DI"], numero: "", dataRegistro: "", valorCIF: "", nomeRecinto: "", codRecinto: "", ufDesembaraco: "" },
    numeroAdicao: "",
    valorCIFAdicion: "",
    produtos: [],
    icmsCalculo: { editalDBF: "", valorCIF: "", impostos: "", vt: "", vti: "", vf: "", ...icms },
    ...resto,
  };
}

const produto = (adicao: string, ncm: string, valorAduaneiro?: number, ii = 0): ProdutoAdicao => ({
  adicao,
  ncm,
  classeTarifaria: ncm,
  tratamento: "3",
  fundamentoLegal: "",
  valor: "",
  valores: valorAduaneiro === undefined ? undefined : { valorAduaneiro: String(valorAduaneiro), ii: String(ii), ipi: "", pis: "", cofins: "" },
});

describe("conversão de números digitados", () => {
  it("aceita vírgula decimal e ponto decimal", () => {
    expect(paraNumero("1.234,56")).toBe(1234.56);
    expect(paraNumero("1234.56")).toBe(1234.56);
    expect(paraNumero("")).toBe(0);
    expect(paraNumero("abc")).toBe(0);
  });

  it("não cria valores de adição sem valor aduaneiro", () => {
    expect(valoresDaDeclaracao({ valorAduaneiro: "0", ii: "10" })).toBeUndefined();
    expect(valoresDaDeclaracao({ valorAduaneiro: "900.50", ii: "10.00", pesoLiquido: "12.34500" })).toEqual({
      valorAduaneiro: "900.5", ii: "10", ipi: "", pis: "", cofins: "", pesoLiquido: "12.345",
    });
  });
});

describe("cálculo por adição (DI com valores de cada adição)", () => {
  const fd = formulario({
    produtos: [produto("1", "84713012", 1000), produto("2", "24021000", 1000)],
    adicoesTributadas: [
      { adicao: "3", ncm: "22084000", valores: { valorAduaneiro: "1000", ii: "", ipi: "", pis: "", cofins: "" } },
    ],
    icms: { taxaSiscomex: "300" },
  });
  const c = calcularFormulario(fd);

  it("agrupa as adições da guia por alíquota, cada uma com o seu divisor", () => {
    expect(c.modo).toBe("por_adicao");
    expect(c.diferimento.map((g) => [g.aliquota, g.divisor, g.adicoes])).toEqual([
      [20.5, 0.795, ["1"]],
      [29, 0.71, ["2"]],
    ]);
  });

  it("rateia a Taxa Siscomex também para a adição de tributação normal", () => {
    expect(c.produtos.map((p) => p?.despesas.taxaSiscomex)).toEqual([100, 100]);
    expect(c.tributadas[0]?.despesas.taxaSiscomex).toBe(100);
    expect(c.tributadas[0]?.regime).toBe("tributacao_normal");
  });

  it("o campo 5.5 soma só o valor aduaneiro das adições da guia", () => {
    expect(c.valorAduaneiroGLME).toBe(2000);
  });

  it("a memória traz cada alíquota, o total e a adição fora da guia", () => {
    const textos = c.memoria.map((l) => l.texto);
    expect(textos.some((t) => t.startsWith("ALÍQUOTA 20,5% — ADIÇÃO 1:"))).toBe(true);
    expect(textos.some((t) => t.startsWith("ALÍQUOTA 29% — ADIÇÃO 2:"))).toBe(true);
    expect(textos.some((t) => t.startsWith("TOTAL DO ICMS DIFERIDO:"))).toBe(true);
    expect(textos.some((t) => t.startsWith("ADIÇÃO 3 - NCM 22084000 - TRIBUTAÇÃO NORMAL - ALÍQUOTA 22,5% - VALOR DO ICMS"))).toBe(true);
  });
});

describe("cálculo pelos totais (sem valores por adição)", () => {
  it("usa a alíquota da NCM e a Taxa Siscomex separada dos tributos", () => {
    const c = calcularFormulario(formulario({
      produtos: [produto("1", "84713012")],
      icms: { valorCIF: "1000", impostos: "100", taxaSiscomex: "50" },
    }));
    expect(c.modo).toBe("totais");
    expect(c.diferimento[0].valorPartida).toBe(1150);
    expect(c.diferimento[0].divisor).toBe(0.795);
    expect(c.totalDiferido).toBe(296.54); // 1150 ÷ 0,795 = 1446,54 × 20,5%
  });

  it("recalcula quando o valor aduaneiro da seção ICMS muda", () => {
    const antes = calcularFormulario(formulario({ produtos: [produto("1", "84713012")], icms: { valorCIF: "1000", impostos: "0" } }));
    const depois = calcularFormulario(formulario({ produtos: [produto("1", "84713012")], icms: { valorCIF: "2000", impostos: "0" } }));
    expect(antes.totalDiferido).toBe(257.86);
    expect(depois.totalDiferido).toBe(515.72);
  });

  it("avisa quando há alíquotas diferentes e faltam os valores por adição", () => {
    const c = calcularFormulario(formulario({
      produtos: [produto("1", "84713012"), produto("2", "24021000")],
      icms: { valorCIF: "1000", impostos: "0" },
    }));
    expect(c.avisos[0]).toContain("alíquotas diferentes");
  });

  it("não calcula nada com o formulário vazio", () => {
    const c = calcularFormulario(formulario({ produtos: [produto("", "")] }));
    expect(c.diferimento).toEqual([]);
    expect(c.memoria).toEqual([]);
  });
});
