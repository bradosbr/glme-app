import { describe, expect, it } from "vitest";
import { parsearRecintosSiscomex } from "./recintosSiscomex";

/** Trecho real da tabela oficial (já em UTF-8), com os casos que importam. */
const CSV = [
  "06/11/2026 04:45,,,",
  "Código,Descrição,Início de Vigência,Fim de Vigência",
  "911101,AEROPORTO INTERNAC. SALGADO FILHO-PORTO ALEGRE/RS,12/11/2021,-",
  "4931301,PORTO DE SUAPE-IPOJUCA-PORTO MARÍTIMO ALFANDEGADO,01/01/2018,-",
  "1303201,PORTO SECO CENTRO OESTE - DAIA/ANAPOLIS/GO,10/01/2017,-",
  '155201,"DRF-PASSO FUNDO (NAC. RECOF,AD TEMP,DEP ESP)",03/10/2024,-',
  "453301,EST.FER.ALF.-ALL-AMERICA LATINA LOGISTICA S/A-SANTANA DO LI- VRAMENTO-RS.,01/01/2018,-",
  "8888888,EST. EXPORTADOR - TAGUATINGA,08/09/2017,-",
  "8888888,EST. EXPORTADOR - SOBRADINHO,08/09/2017,-",
  "2222222,ENTRADA E SAIDA FICTA,01/01/2018,-",
  "5555555,PONTO VIRTUAL DE FRONTEIRA - PACARAIMA,23/10/2017,-",
  "9919901,RECINTO ENCERRADO,01/01/2018,31/12/2020",
  "321901,QUARAI/RS - PONTO DE FRONTEIRA (BRASIL/URUGUAI),01/01/2018,-",
  "7922101,TERMINAL DE REMESSA EXPRESSA-DHL W. EXPRESS BRASIL,01/01/2018,-",
].join("\n");

const recintos = parsearRecintosSiscomex(CSV, new Date(2026, 10, 6));
const porCodigo = (codigo: string) => recintos.find((r) => r.codigo === codigo);

describe("tabela de recintos do Siscomex", () => {
  it("formata o código em 7 dígitos, repondo o zero à esquerda", () => {
    expect(recintos.map((r) => r.codigo)).toEqual([
      "0.15.52.01", "0.32.19.01", "0.45.33.01", "0.91.11.01", "1.30.32.01", "4.93.13.01", "7.92.21.01",
    ]);
  });

  it("deixa de fora os códigos fictícios e os recintos com vigência encerrada", () => {
    expect(recintos.some((r) => /8888888|2222222|5555555/.test(r.codigo.replace(/\D/g, "")))).toBe(false);
    expect(recintos.some((r) => r.nome === "RECINTO ENCERRADO")).toBe(false);
  });

  it("classifica pelo código quando os dígitos do tipo são conhecidos", () => {
    expect(porCodigo("0.91.11.01")?.tipo).toBe("aeroporto");
    expect(porCodigo("4.93.13.01")?.tipo).toBe("porto");
    expect(porCodigo("1.30.32.01")?.tipo).toBe("porto_seco");
    expect(porCodigo("0.32.19.01")?.tipo).toBe("fronteira");
  });

  it("usa a descrição quando o código não diz o tipo", () => {
    expect(porCodigo("0.45.33.01")?.tipo).toBe("outro"); // estação ferroviária
    expect(porCodigo("0.15.52.01")?.tipo).toBe("outro"); // unidade da Receita (DRF)
    expect(porCodigo("7.92.21.01")?.tipo).toBe("outro"); // terminal de remessa expressa
  });

  it("lê cidade e UF do fim da descrição", () => {
    expect(porCodigo("0.91.11.01")).toMatchObject({ cidade: "PORTO ALEGRE", uf: "RS" });
    expect(porCodigo("1.30.32.01")).toMatchObject({ cidade: "ANAPOLIS", uf: "GO" });
    expect(porCodigo("4.93.13.01")).toMatchObject({ cidade: null, uf: null });
  });

  it("junta a palavra partida pela quebra do relatório e tira a pontuação do fim", () => {
    expect(porCodigo("0.45.33.01")?.nome).toContain("SANTANA DO LIVRAMENTO");
    expect(porCodigo("0.45.33.01")?.nome.endsWith("RS")).toBe(true);
  });

  it("mantém a descrição com vírgula, que vem entre aspas", () => {
    expect(porCodigo("0.15.52.01")?.nome).toBe("DRF-PASSO FUNDO (NAC. RECOF,AD TEMP,DEP ESP)");
  });
});
