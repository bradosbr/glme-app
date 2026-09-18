import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { consultarDuimp, limparSessoesPortal, mapearDuimpAPI, type DuimpGeralAPI, type ItemDuimpAPI } from "./portalUnico";

const chave = { clientId: "cliente-0001", clientSecret: "segredo-0001" };

const tributos = (ii: number, ipi: number, pis: number, cofins: number, taxa = 0) => [
  { tipo: "II", valoresBRL: { devido: ii, aRecolher: ii } },
  { tipo: "IPI", valoresBRL: { devido: ipi, aRecolher: ipi } },
  { tipo: "PIS", valoresBRL: { devido: pis, aRecolher: pis } },
  { tipo: "COFINS", valoresBRL: { devido: cofins, aRecolher: cofins } },
  ...(taxa ? [{ tipo: "TAXA_UTILIZACAO", valoresBRL: { devido: taxa, aRecolher: taxa } }] : []),
];

const item = (n: number, ncm: string, va: number, t: ReturnType<typeof tributos>, peso = 10, status = "ATIVO"): ItemDuimpAPI => ({
  status,
  identificacao: { numeroItem: n },
  produto: { ncm },
  mercadoria: { pesoLiquido: peso, descricao: `PRODUTO ${n}` },
  tributos: { mercadoria: { valorAduaneiroBRL: va }, tributosCalculados: t },
});

describe("Portal Único - conversão da DUIMP", () => {
  it("usa as adições oficiais da DUIMP, somando valores, tributos e peso dos itens", () => {
    const geral: DuimpGeralAPI = {
      identificacao: { numero: "26BR0000000001", versao: "2", dataRegistro: "2026-09-10T14:00:00-0300", importador: { ni: "11111111000111" } },
      adicoes: [{ numero: 1, itens: [1, 3] }, { numero: 2, itens: [2] }],
      tributos: { tributosCalculados: [{ tipo: "TAXA_UTILIZACAO", valoresBRL: { aRecolher: 231.34 } }] },
    };
    const r = mapearDuimpAPI(geral, [
      item(1, "84713012", 1000, tributos(0, 150, 21, 96.5), 5),
      item(2, "24022000", 500, tributos(100, 150, 10.5, 48.25), 2),
      item(3, "84713012", 250.5, tributos(0, 37.5, 5.25, 24.13), 1.5),
    ]);
    expect(r).toMatchObject({
      numeroDuimp: "26BR0000000001", versaoDuimp: "2", dataRegistro: "10/09/2026", importadorCnpj: "11111111000111",
      valorAduaneiro: "1750.50", taxaSiscomex: "231.34",
    });
    expect(r.adicoes).toHaveLength(2);
    expect(r.adicoes![0]).toMatchObject({
      numero: "1", ncm: "84713012", valorAduaneiro: "1250.50", ipi: "187.50", pis: "26.25", cofins: "120.63", pesoLiquido: "6.50000",
    });
    expect(r.adicoes![0].itens!.map((i) => i.numero)).toEqual(["1", "3"]);
    expect(r.adicoes![1]).toMatchObject({ numero: "2", ncm: "24022000", ii: "100.00" });
    // Tributos federais (II + IPI + PIS + COFINS) + Taxa Siscomex
    expect(r.impostosTotal).toBe((100 + 187.5 + 150 + 26.25 + 10.5 + 120.63 + 48.25 + 231.34).toFixed(2));
  });

  it("ignora itens inativos e, sem o bloco de adições, agrupa por NCM", () => {
    const r = mapearDuimpAPI({ identificacao: { numero: "X" } }, [
      item(1, "84713012", 100, tributos(0, 0, 0, 0)),
      item(2, "84713012", 50, tributos(0, 0, 0, 0)),
      item(3, "24022000", 70, tributos(0, 0, 0, 0)),
      item(4, "84713012", 999, tributos(0, 0, 0, 0), 1, "INATIVO"),
    ]);
    expect(r.adicoes!.map((a) => [a.ncm, a.valorAduaneiro])).toEqual([["84713012", "150.00"], ["24022000", "70.00"]]);
  });

  it("aceita números vindos como texto (peso, valores) e NCM/versão vindos como número", () => {
    const r = mapearDuimpAPI(
      { identificacao: { numero: "26BR00000000011", versao: 2 as unknown as string, importador: { ni: "11111111000111" } }, adicoes: [{ numero: 1, itens: [1, 2] }] },
      [
        { status: "ATIVO", identificacao: { numeroItem: 1 }, produto: { ncm: 84713012 as unknown as string },
          mercadoria: { pesoLiquido: "12.50000" }, tributos: { mercadoria: { valorAduaneiroBRL: "1000.10" },
          tributosCalculados: [{ tipo: "IPI", valoresBRL: { aRecolher: "150.00" } }] } },
        { status: "ATIVO", identificacao: { numeroItem: 2 }, produto: { ncm: "84713012" },
          mercadoria: { pesoLiquido: 7.5 }, tributos: { mercadoria: { valorAduaneiroBRL: 500 },
          tributosCalculados: [{ tipo: "IPI", valoresBRL: { devido: 75 } }] } },
      ],
    );
    expect(r.versaoDuimp).toBe("2");
    expect(r.adicoes![0]).toMatchObject({ ncm: "84713012", pesoLiquido: "20.00000", valorAduaneiro: "1500.10", ipi: "225.00" });
  });

  it("importação por conta e ordem traz o CNPJ do adquirente; direta, não", () => {
    const terceiro = { ...item(1, "84713012", 10, tributos(0, 0, 0, 0)), caracterizacaoImportacao: { indicador: "IMPORTACAO_POR_CONTA_E_ORDEM", ni: "22222222000122" } };
    expect(mapearDuimpAPI({}, [terceiro]).adquirenteCnpj).toBe("22222222000122");
    const direta = { ...item(1, "84713012", 10, tributos(0, 0, 0, 0)), caracterizacaoImportacao: { indicador: "IMPORTACAO_DIRETA" } };
    expect(mapearDuimpAPI({}, [direta]).adquirenteCnpj).toBeUndefined();
  });

  it("usa o recinto de entrega quando a DUIMP informa (7 dígitos)", () => {
    expect(mapearDuimpAPI({ carga: { recintoEntrega: 4932101 } }, []).recintoCodigoRaw).toBe("4932101");
    expect(mapearDuimpAPI({}, []).recintoCodigoRaw).toBeUndefined();
  });

  it("sem taxa no total da declaração, soma a taxa dos itens", () => {
    const r = mapearDuimpAPI({}, [item(1, "1", 10, tributos(0, 0, 0, 0, 115.67)), item(2, "1", 10, tributos(0, 0, 0, 0, 115.67))]);
    expect(r.taxaSiscomex).toBe("231.34");
  });
});

// ---------------------------------------------------------------------------
// Chamadas HTTP (fetch simulado)
// ---------------------------------------------------------------------------

type Chamada = { url: string; init?: RequestInit };

function portalSimulado(opcoes: { itens?: number; autenticacao?: Response; consulta?: Response } = {}) {
  const chamadas: Chamada[] = [];
  let csrf = 0;
  const totalItens = opcoes.itens ?? 3;
  const fetchFalso = vi.fn(async (url: string, init?: RequestInit) => {
    chamadas.push({ url, init });
    const proximoCsrf = { "x-csrf-token": `csrf-${++csrf}` };
    if (url.endsWith("/portal/api/autenticar/chave-acesso")) {
      return opcoes.autenticacao ?? new Response(null, { status: 200, headers: { "set-token": "Bearer jwt-1", ...proximoCsrf } });
    }
    if (opcoes.consulta) return opcoes.consulta;
    const json = (corpo: unknown) => new Response(JSON.stringify(corpo), { status: 200, headers: { "content-type": "application/json", ...proximoCsrf } });
    if (url.endsWith("/versoes")) return json({ numero: "26BR0000000001", versao: "3" });
    const itens = url.match(/itens\?inicial=(\d+)&tamanho=(\d+)/);
    if (itens) {
      const inicial = Number(itens[1]);
      const fim = Math.min(totalItens, inicial + Number(itens[2]) - 1);
      return json(Array.from({ length: Math.max(0, fim - inicial + 1) }, (_, k) => item(inicial + k, "84713012", 10, tributos(0, 1, 0, 0))));
    }
    return json({ identificacao: { numero: "26BR0000000001", versao: "3" }, quantidadeItens: totalItens });
  });
  vi.stubGlobal("fetch", fetchFalso);
  return chamadas;
}

describe("Portal Único - consulta da DUIMP", () => {
  beforeEach(() => limparSessoesPortal());
  afterEach(() => vi.unstubAllGlobals());

  it("autentica com a chave de acesso e o perfil IMPEXP, e usa o token nas consultas", async () => {
    const chamadas = portalSimulado();
    // Aceita o número com hífen, como aparece no extrato
    await consultarDuimp(chave, "26BR0000000001-1", "3");
    const auth = chamadas[0];
    expect(auth.url).toBe("https://portalunico.siscomex.gov.br/portal/api/autenticar/chave-acesso");
    expect(auth.init?.method).toBe("POST");
    expect(auth.init?.headers).toMatchObject({ "Client-Id": "cliente-0001", "Client-Secret": "segredo-0001", "Role-Type": "IMPEXP" });
    const consulta = chamadas[1];
    expect(consulta.url).toBe("https://portalunico.siscomex.gov.br/duimp-api/api/ext/duimp/26BR00000000011/3");
    expect(consulta.init?.headers).toMatchObject({ Authorization: "Bearer jwt-1", "X-CSRF-Token": "csrf-1" });
    // O X-CSRF-Token é renovado a cada resposta
    expect(chamadas[2].init?.headers).toMatchObject({ "X-CSRF-Token": "csrf-2" });
  });

  it("sem versão informada, busca a versão vigente", async () => {
    const chamadas = portalSimulado();
    const r = await consultarDuimp(chave, "26BR00000000011");
    expect(chamadas[1].url).toMatch(/\/duimp\/26BR00000000011\/versoes$/);
    expect(chamadas[2].url).toMatch(/\/duimp\/26BR00000000011\/3$/);
    expect(r.adicoes).toHaveLength(1);
  });

  it("pagina os itens de 100 em 100", async () => {
    const chamadas = portalSimulado({ itens: 150 });
    const r = await consultarDuimp(chave, "26BR00000000011", "3");
    const paginas = chamadas.filter((c) => c.url.includes("/itens?"));
    expect(paginas.map((c) => c.url.split("?")[1])).toEqual(["inicial=1&tamanho=100", "inicial=101&tamanho=100"]);
    expect(r.adicoes![0].itens).toHaveLength(150);
  });

  it("reaproveita a sessão: a segunda consulta não autentica de novo", async () => {
    const chamadas = portalSimulado();
    await consultarDuimp(chave, "26BR00000000011", "3");
    await consultarDuimp(chave, "26BR00000000011", "3");
    expect(chamadas.filter((c) => c.url.includes("/autenticar/")).length).toBe(1);
  });

  it("chave recusada vira mensagem clara", async () => {
    portalSimulado({ autenticacao: new Response(JSON.stringify({ code: "PLAT-ER2013", message: "Sem representação" }), { status: 422 }) });
    await expect(consultarDuimp(chave, "26BR00000000011", "3")).rejects.toThrow("recusou a chave de acesso");
  });

  it("autenticação repetida em menos de 1 minuto", async () => {
    portalSimulado({ autenticacao: new Response(JSON.stringify({ code: "PLAT-ER2033", message: "Acesso em massa" }), { status: 422 }) });
    await expect(consultarDuimp(chave, "26BR00000000011", "3")).rejects.toThrow("menos de 1 minuto");
  });

  it("DUIMP inexistente", async () => {
    portalSimulado({ consulta: new Response("{}", { status: 404 }) });
    await expect(consultarDuimp(chave, "26BR00000000011", "3")).rejects.toThrow("DUIMP não encontrada");
  });

  it("recusa número de DUIMP inválido sem chamar o Portal", async () => {
    const chamadas = portalSimulado();
    await expect(consultarDuimp(chave, "123")).rejects.toThrow("Número da DUIMP inválido");
    expect(chamadas).toHaveLength(0);
  });
});
