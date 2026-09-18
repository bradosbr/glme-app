import { describe, expect, it } from "vitest";
import { ALIQUOTA_PADRAO, consultarAliquotaNCM, verificarAliquotaNCM } from "./aliquotasICMS";

describe("consultarAliquotaNCM — regra mais específica vence", () => {
  it("2208.40.00 (aguardente) usa a regra da NCM completa (22,5%), não a da posição 2208 (27%)", () => {
    const r = consultarAliquotaNCM("2208.40.00");
    expect(r.aliquota).toBe(22.5);
    expect(r.origem).toBe("anexo");
    expect(r.nivel).toBe("ncm");
    expect(r.regra?.item).toBe("4.5");
  });

  it("2208.20.00 (outra bebida da posição 2208) cai na regra da posição: 27%", () => {
    const r = consultarAliquotaNCM("22082000");
    expect(r.aliquota).toBe(27);
    expect(r.nivel).toBe("posicao");
  });

  it("2203.00.00 usa a regra específica de 18%, não a de cervejas em geral (27%)", () => {
    expect(consultarAliquotaNCM("22030000").aliquota).toBe(18);
  });

  it("2402.10.00 (tabaco) tem 29% mesmo fora da lista negativa", () => {
    const r = consultarAliquotaNCM("2402.10.00");
    expect(r.aliquota).toBe(29);
    expect(r.nivel).toBe("posicao");
  });

  it("3923.21.90 (saco plástico) casa com a subposição 3923.2: 22,5%", () => {
    const r = consultarAliquotaNCM("3923.21.90");
    expect(r.aliquota).toBe(22.5);
    expect(r.nivel).toBe("subposicao");
  });

  it("aceita NCM com ou sem pontuação", () => {
    expect(consultarAliquotaNCM("2208.40.00")).toEqual(consultarAliquotaNCM("22084000"));
  });
});

describe("consultarAliquotaNCM — regras concorrentes", () => {
  it("2207 tem duas regras no mesmo nível (27% e AEHC 15,52%): sinaliza a alternativa", () => {
    const r = consultarAliquotaNCM("2207.10.90");
    expect(r.origem).toBe("anexo");
    expect(r.aliquota).toBe(27);
    expect(r.alternativas.map((a) => a.aliquota)).toEqual([15.52]);
  });

  it("NCM com uma única regra não tem alternativas", () => {
    expect(consultarAliquotaNCM("2208.40.00").alternativas).toEqual([]);
  });
});

describe("consultarAliquotaNCM — sem regra no Anexo I", () => {
  it("NCM fora do Anexo I usa a alíquota padrão", () => {
    const r = consultarAliquotaNCM("8471.30.12");
    expect(r.aliquota).toBe(ALIQUOTA_PADRAO);
    expect(r.origem).toBe("padrao");
    expect(r.regra).toBeNull();
    expect(r.nivel).toBeNull();
  });

  it("NCM curta não casa por prefixo reverso ('22' não herda a regra 2203)", () => {
    expect(consultarAliquotaNCM("22").origem).toBe("padrao");
  });

  it("vazio ou sem dígitos usa a padrão", () => {
    expect(consultarAliquotaNCM("").origem).toBe("padrao");
    expect(consultarAliquotaNCM("abc").origem).toBe("padrao");
  });
});

describe("verificarAliquotaNCM (compatibilidade)", () => {
  it("devolve a regra mais específica ou null", () => {
    expect(verificarAliquotaNCM("2208.40.00")?.aliquota).toBe(22.5);
    expect(verificarAliquotaNCM("8471.30.12")).toBeNull();
  });
});

describe("consultarAliquotaNCM — regras observadas no e-Fisco", () => {
  it("3923.30.90 (frascos de plástico) vai a 22,5%, como na DMI da SEFAZ-PE", () => {
    const c = consultarAliquotaNCM("39233090");
    expect(c.aliquota).toBe(22.5);
    expect(c.regra?.fonte).toBe("efisco");
  });

  it("não afeta o saco plástico (3923.2) nem outras subposições da 3923", () => {
    expect(consultarAliquotaNCM("39232190").regra?.item).toBe("4.6");
    expect(consultarAliquotaNCM("39239000").aliquota).toBe(ALIQUOTA_PADRAO);
  });
});
