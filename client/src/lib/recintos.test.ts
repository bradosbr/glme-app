import { describe, expect, it } from "vitest";
import { filtrarRecintos, recintoPorCodigo, type Recinto } from "./recintos";

const recintos: Recinto[] = [
  { id: 1, codigo: "4.93.21.01-2", nome: "Porto de Suape", tipo: "porto", cidade: "Ipojuca", uf: "PE" },
  { id: 2, codigo: "7.93.11.01-3", nome: "Aeroporto Internacional do Rio de Janeiro - Galeão", tipo: "aeroporto", cidade: "Rio de Janeiro", uf: "RJ" },
  { id: 3, codigo: "4.93.32.01-5", nome: "Supplog Porto Seco de Ipojuca Ltda", tipo: "porto_seco", cidade: "Ipojuca", uf: "PE" },
];

describe("busca de recintos", () => {
  it("ignora acentos e maiúsculas", () => {
    expect(filtrarRecintos(recintos, "galeao").map((r) => r.id)).toEqual([2]);
  });

  it("todas as palavras precisam aparecer (nome, cidade, UF ou tipo)", () => {
    expect(filtrarRecintos(recintos, "ipojuca porto seco").map((r) => r.id)).toEqual([3]);
    expect(filtrarRecintos(recintos, "suape pe").map((r) => r.id)).toEqual([1]);
  });

  it("acha pelo código com ou sem pontuação", () => {
    expect(filtrarRecintos(recintos, "4932101").map((r) => r.id)).toEqual([1]);
    expect(filtrarRecintos(recintos, "4.93.21").map((r) => r.id)).toEqual([1]);
  });

  it("busca vazia não lista nada", () => {
    expect(filtrarRecintos(recintos, "  ")).toEqual([]);
  });

  it("encontra pelo código de 7 dígitos da DI/DUIMP, sem confundir recintos parecidos", () => {
    expect(recintoPorCodigo(recintos, "4932101")?.id).toBe(1);
    expect(recintoPorCodigo(recintos, 4933201)?.id).toBe(3);
    expect(recintoPorCodigo(recintos, "4932199")).toBeUndefined();
    expect(recintoPorCodigo(recintos, "49")).toBeUndefined();
  });
});
