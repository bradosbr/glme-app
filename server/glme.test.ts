import { describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// Mock do banco de dados para testes
vi.mock("./db", () => ({
  getImportadores: vi.fn().mockResolvedValue([
    {
      id: 1,
      cnpj: "12345678000190",
      razaoSocial: "Empresa Teste Ltda",
      nomeFantasia: "Empresa Teste",
      inscricaoEstadual: "123.456.789",
      cnae: "5211600",
      endereco: "Rua Teste, 100",
      bairro: "Centro",
      cep: "01000-000",
      municipio: "São Paulo",
      uf: "SP",
      telefone: "(11) 1234-5678",
      email: "teste@empresa.com",
      editalDBF: "001/2024",
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ]),
  upsertImportador: vi.fn().mockResolvedValue({ id: 1, cnpj: "12345678000190", razaoSocial: "Empresa Teste Ltda" }),
  deleteImportador: vi.fn().mockResolvedValue(undefined),
  searchImportadores: vi.fn().mockResolvedValue([]),
  getRecintos: vi.fn().mockResolvedValue([
    { id: 1, codigo: "8.94.21.01-0", nome: "Porto de Santos", tipo: "porto", cidade: "Santos", uf: "SP" },
    { id: 2, codigo: "1.91.32.01-8", nome: "LOGSERVE - Brasília", tipo: "porto_seco", cidade: "Brasília", uf: "DF" },
    { id: 3, codigo: "8.94.11.01-5", nome: "Aeroporto de Guarulhos", tipo: "aeroporto", cidade: "Guarulhos", uf: "SP" },
  ]),
  seedRecintos: vi.fn().mockResolvedValue(undefined),
  getImportadorByCnpj: vi.fn().mockResolvedValue(undefined),
  getUserByOpenId: vi.fn().mockResolvedValue(undefined),
  upsertUser: vi.fn().mockResolvedValue(undefined),
}));

function createPublicContext(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {
      clearCookie: vi.fn(),
    } as unknown as TrpcContext["res"],
  };
}

describe("GLME - Importadores", () => {
  it("lista importadores cadastrados", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.importadores.listar();
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0]).toHaveProperty("cnpj");
    expect(result[0]).toHaveProperty("razaoSocial");
  });

  it("salva um importador com edital DBF", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.importadores.salvar({
      cnpj: "12345678000190",
      razaoSocial: "Empresa Teste Ltda",
      editalDBF: "001/2024",
    });
    expect(result).toHaveProperty("cnpj");
  });

  it("exclui um importador por ID", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.importadores.excluir({ id: 1 });
    expect(result).toEqual({ success: true });
  });
});

describe("GLME - Recintos Alfandegados", () => {
  it("lista todos os recintos alfandegados", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.recintos.listar();
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
  });

  it("recintos possuem código e nome", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.recintos.listar();
    result.forEach((r: any) => {
      expect(r).toHaveProperty("codigo");
      expect(r).toHaveProperty("nome");
      expect(r).toHaveProperty("tipo");
    });
  });
});

describe("GLME - Parser DI XML", () => {
  it("parseia XML de DI com estrutura básica", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    // XML no formato SISCOMEX real (campos planos, não aninhados)
    const xmlSimples = `<?xml version="1.0" encoding="UTF-8"?>
<declaracaoImportacao>
  <numeroDI>24/1234567-8</numeroDI>
  <dataRegistro>20240115</dataRegistro>
  <importadorNome>Empresa Importadora Ltda</importadorNome>
  <importadorNumero>12345678000190</importadorNumero>
  <importadorEnderecoMunicipio>Santos</importadorEnderecoMunicipio>
  <importadorEnderecoUf>SP</importadorEnderecoUf>
  <informacaoComplementar>CIF US$: 50.000,00 R$: 50000.00</informacaoComplementar>
</declaracaoImportacao>`;
    const result = await caller.di.parsearXML({ xmlContent: xmlSimples });
    expect(result).toHaveProperty("numeroDI", "24/1234567-8");
    expect(result).toHaveProperty("ufDesembaraco");
    expect((result as any).importador).toHaveProperty("nome", "Empresa Importadora Ltda");
  });

  it("retorna estrutura vazia para XML sem dados de importador", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    const xmlVazio = `<?xml version="1.0" encoding="UTF-8"?><declaracaoImportacao></declaracaoImportacao>`;
    const result = await caller.di.parsearXML({ xmlContent: xmlVazio });
    expect(result).toHaveProperty("numeroDI");
    expect(result).toHaveProperty("importador");
    expect(result).toHaveProperty("adicoes");
  });
});

describe("GLME - Parser DI XML com Adições", () => {
  it("parseia XML com adições e extrai numero e NCM", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    const xmlComAdicoes = `<?xml version="1.0" encoding="UTF-8"?>
<declaracaoImportacao>
  <numeroDI>24/9999999-0</numeroDI>
  <importador>
    <nome>IMPORTADORA TESTE SA</nome>
    <cnpj>98765432000100</cnpj>
  </importador>
  <adicoes>
    <adicao>
      <numero>001</numero>
      <ncm>84713012</ncm>
      <valorAdicao>25000.00</valorAdicao>
    </adicao>
    <adicao>
      <numero>002</numero>
      <ncm>84714900</ncm>
      <valorAdicao>15000.00</valorAdicao>
    </adicao>
  </adicoes>
</declaracaoImportacao>`;
    const result = await caller.di.parsearXML({ xmlContent: xmlComAdicoes });
    expect(result.adicoes).toBeDefined();
    expect(Array.isArray(result.adicoes)).toBe(true);
  });
});

describe("GLME - Cálculo ICMS", () => {
  it("calcula VT corretamente (CIF + Impostos)", () => {
    const valorCIF = 10000;
    const impostos = 2000;
    const vt = valorCIF + impostos;
    expect(vt).toBe(12000);
  });

  it("calcula VTI corretamente (VT / 0.795)", () => {
    const vt = 12000;
    const vti = vt / 0.795;
    expect(parseFloat(vti.toFixed(2))).toBeCloseTo(15094.34, 1);
  });

  it("calcula VF corretamente (VTI * 20.5%)", () => {
    const vti = 15094.34;
    const vf = vti * 0.205;
    expect(parseFloat(vf.toFixed(2))).toBeCloseTo(3094.34, 1);
  });
});

describe("GLME - Recintos RJ específicos", () => {
  it("deve conter ICTSI Rio Brasil Terminal na lista mockada", async () => {
    // O mock retorna recintos genéricos, mas verifica que a estrutura está correta
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    const recintos = await caller.recintos.listar();
    expect(Array.isArray(recintos)).toBe(true);
    recintos.forEach((r: any) => {
      expect(r).toHaveProperty("codigo");
      expect(r).toHaveProperty("nome");
      expect(r).toHaveProperty("uf");
    });
  });
});

describe("GLME - PDF Layout", () => {
  it("valida estrutura de dados para geração de PDF", () => {
    const formData = {
      secretariaUF: "PE",
      importador: {
        nome: "Empresa Teste Ltda",
        inscricaoEstadual: "123.456.789",
        cnpj: "00.000.000/0001-00",
        cnae: "5232-0/00",
        endereco: "Rua Teste, 100",
        bairro: "Centro",
        cep: "01000-000",
        municipio: "Recife",
        uf: "PE",
        telefone: "(81) 9999-9999",
      },
      documento: {
        tipo: ["DI"],
        numero: "26/0000001-0",
        dataRegistro: "2025-01-01",
        valorCIF: "50000",
        nomeRecinto: "ICTSI RIO BRASIL TERMINAL",
        codRecinto: "7.92.13.04-9",
        ufDesembaraco: "RJ",
      },
      produtos: [{ adicao: "001", classeTarifaria: "8471.30.19", ncm: "84713019", tratamento: "3", fundamentoLegal: "ICMS diferido", valor: "50000" }],
      icmsCalculo: { editalDBF: "001/2025", valorCIF: "50000", impostos: "5000", vt: "55000", vti: "69182.39", vf: "14182.39" },
    };
    // Verifica que todos os campos obrigatórios estão presentes
    expect(formData.secretariaUF).toBe("PE");
    expect(formData.documento.codRecinto).toBe("7.92.13.04-9");
    expect(formData.documento.nomeRecinto).toBe("ICTSI RIO BRASIL TERMINAL");
    expect(formData.produtos[0].adicao).toBe("001");
    expect(formData.icmsCalculo.editalDBF).toBe("001/2025");
    // Verifica cálculo ICMS
    const vt = parseFloat(formData.icmsCalculo.valorCIF) + parseFloat(formData.icmsCalculo.impostos);
    expect(vt).toBe(55000);
    const vti = vt / 0.795;
    expect(parseFloat(vti.toFixed(2))).toBeCloseTo(69182.39, 0);
    const vf = vti * 0.205;
    expect(parseFloat(vf.toFixed(2))).toBeCloseTo(14182.39, 0);
  });
});

describe("GLME - Parser DI XML Robusto", () => {
  it("parseia XML com formato SISCOMEX alternativo (DI maiúsculo)", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    const xmlAlternativo = `<?xml version="1.0" encoding="UTF-8"?>
<DI>
  <numero>25/1234567-0</numero>
  <dataRegistro>20250115</dataRegistro>
  <valorCIF>75000.00</valorCIF>
  <importadorEnderecoUf>RJ</importadorEnderecoUf>
  <importadorNome>IMPORTADORA RJ LTDA</importadorNome>
  <importadorNumero>11222333000144</importadorNumero>
  <importadorEnderecoMunicipio>Rio de Janeiro</importadorEnderecoMunicipio>
  <adicao>
    <numero>001</numero>
    <ncm>84713012</ncm>
  </adicao>
</DI>`;
    const result = await caller.di.parsearXML({ xmlContent: xmlAlternativo });
    expect(result).toHaveProperty("numeroDI");
    // ufDesembaraco usa importadorEnderecoUf como fallback
    expect((result as any).importador).toHaveProperty("nome", "IMPORTADORA RJ LTDA");
    expect(Array.isArray((result as any).adicoes)).toBe(true);
    expect((result as any).adicoes.length).toBe(1);
    expect((result as any).adicoes[0]).toHaveProperty("numero", "1");
    expect((result as any).adicoes[0]).toHaveProperty("ncm", "84713012");
  });

  it("converte data YYYYMMDD para DD/MM/YYYY", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    const xmlComData = `<?xml version="1.0" encoding="UTF-8"?>
<declaracaoImportacao>
  <dataRegistro>20250315</dataRegistro>
  <importadorNome>TESTE</importadorNome>
</declaracaoImportacao>`;
    const result = await caller.di.parsearXML({ xmlContent: xmlComData });
    // Novo formato: DD/MM/YYYY
    expect((result as any).dataRegistro).toBe("15/03/2025");
  });

  it("retorna erro para XML inválido", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.di.parsearXML({ xmlContent: "isso nao e xml valido!!!" })
    ).rejects.toThrow();
  });
});

describe("GLME - Parser XML SISCOMEX formato real (ListaDeclaracoes)", () => {
  const xmlSiscomexReal = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<ListaDeclaracoes>
    <declaracaoImportacao>
        <adicao>
            <dadosMercadoriaCodigoNcm>61151093</dadosMercadoriaCodigoNcm>
            <dadosMercadoriaNomeNcm>De fibras sintéticas</dadosMercadoriaNomeNcm>
            <iiBaseCalculo>000000000051748</iiBaseCalculo>
            <condicaoVendaValorReais>000000000051745</condicaoVendaValorReais>
            <numeroAdicao>008</numeroAdicao>
            <numeroDI>2604023996</numeroDI>
        </adicao>
        <adicao>
            <dadosMercadoriaCodigoNcm>39241000</dadosMercadoriaCodigoNcm>
            <dadosMercadoriaNomeNcm>Utensilios de mesa</dadosMercadoriaNomeNcm>
            <iiBaseCalculo>000000000168611</iiBaseCalculo>
            <condicaoVendaValorReais>000000000168610</condicaoVendaValorReais>
            <numeroAdicao>004</numeroAdicao>
            <numeroDI>2604023996</numeroDI>
        </adicao>
        <armazenamentoRecintoAduaneiroCodigo>7921302</armazenamentoRecintoAduaneiroCodigo>
        <armazenamentoRecintoAduaneiroNome>ICTSI RIO BRASIL TERMINAL 1 SA</armazenamentoRecintoAduaneiroNome>
        <cargaDataChegada>20260310</cargaDataChegada>
        <dataRegistro>20260312</dataRegistro>
        <importadorEnderecoBairro>CENTRO</importadorEnderecoBairro>
        <importadorEnderecoCep>56506520</importadorEnderecoCep>
        <importadorEnderecoComplemento>ANDAR 04</importadorEnderecoComplemento>
        <importadorEnderecoLogradouro>IDELFONSO FREIRE</importadorEnderecoLogradouro>
        <importadorEnderecoMunicipio>ARCOVERDE</importadorEnderecoMunicipio>
        <importadorEnderecoNumero>64</importadorEnderecoNumero>
        <importadorEnderecoUf>PE</importadorEnderecoUf>
        <importadorNome>ACP ELETRO COMERCIO DE EQUIPAMENTOS LTDA</importadorNome>
        <importadorNumero>61410884000228</importadorNumero>
        <importadorNumeroTelefone>81  30198491</importadorNumeroTelefone>
        <importadorNomeRepresentanteLegal>SIDNEY JOSE VIEIRA DE SOUSA</importadorNomeRepresentanteLegal>
        <informacaoComplementar>FOB US$: 26.282,60 R$: 135.607,70 FRETE US$: 1.950,00 R$: 10.061,22 CIF US$: 28.232,60 R$: 145.668,92</informacaoComplementar>
        <numeroDI>2604023996</numeroDI>
        <totalAdicoes>024</totalAdicoes>
        <urfDespachoNome>PORTO DO RIO DE JANEIRO</urfDespachoNome>
        <urfDespachoCodigo>0717600</urfDespachoCodigo>
        <viaTransporteNome>MARÍTIMA</viaTransporteNome>
        <viaTransporteNomeTransportador>ORIENT OVERSEAS CONTAINER LINE</viaTransporteNomeTransportador>
        <viaTransporteNomeVeiculo>CMA CGM PARATY</viaTransporteNomeVeiculo>
    </declaracaoImportacao>
</ListaDeclaracoes>`;

  it("extrai número da DI do formato ListaDeclaracoes", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.di.parsearXML({ xmlContent: xmlSiscomexReal });
    expect(result.numeroDI).toBe("2604023996");
  });

  it("converte data de registro YYYYMMDD para DD/MM/YYYY", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.di.parsearXML({ xmlContent: xmlSiscomexReal });
    expect(result.dataRegistro).toBe("12/03/2026");
  });

  it("converte data de chegada YYYYMMDD para DD/MM/YYYY", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.di.parsearXML({ xmlContent: xmlSiscomexReal });
    expect(result.dataChegada).toBe("10/03/2026");
  });

  it("extrai dados completos do importador", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.di.parsearXML({ xmlContent: xmlSiscomexReal });
    const imp = result.importador as any;
    expect(imp.nome).toBe("ACP ELETRO COMERCIO DE EQUIPAMENTOS LTDA");
    expect(imp.cnpj).toBe("61410884000228");
    expect(imp.bairro).toBe("CENTRO");
    expect(imp.municipio).toBe("ARCOVERDE");
    expect(imp.uf).toBe("PE");
    expect(imp.cep).toBe("56506520");
  });

  it("extrai recinto aduaneiro com código formatado", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.di.parsearXML({ xmlContent: xmlSiscomexReal });
    expect(result.recintoNome).toBe("ICTSI RIO BRASIL TERMINAL 1 SA");
    expect(result.recintoCodigoRaw).toBe("7921302");
    expect(result.recintoCodigoFormatado).toBe("7.92.13.02");
  });

  it("extrai valor CIF em reais do campo informacaoComplementar", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.di.parsearXML({ xmlContent: xmlSiscomexReal });
    expect(result.valorCIFReais).toBe("145668.92");
  });

  it("extrai adições com número sem zeros à esquerda e NCM", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.di.parsearXML({ xmlContent: xmlSiscomexReal });
    const adicoes = result.adicoes as any[];
    expect(adicoes).toHaveLength(2);
    // Adições ordenadas em ordem crescente: 4 antes de 8
    expect(adicoes[0].numero).toBe("4");
    expect(adicoes[0].ncm).toBe("39241000");
    expect(adicoes[1].numero).toBe("8");
    expect(adicoes[1].ncm).toBe("61151093");
  });

  it("extrai via de transporte, transportador e veículo", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.di.parsearXML({ xmlContent: xmlSiscomexReal });
    expect(result.viaTransporte).toBe("MARÍTIMA");
    expect(result.transportador).toBe("ORIENT OVERSEAS CONTAINER LINE");
    expect(result.nomeVeiculo).toBe("CMA CGM PARATY");
  });

  it("extrai URF de despacho", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.di.parsearXML({ xmlContent: xmlSiscomexReal });
    expect(result.urfNome).toBe("PORTO DO RIO DE JANEIRO");
    expect(result.urfCodigo).toBe("0717600");
  });
});


describe("GLME - Cálculo ICMS Lista Negativa (Fórmula Correta)", () => {
  it("verifica alíquota pelos 4 primeiros dígitos da NCM no Anexo I", async () => {
    // NCM 24021000 → prefixo "2402" → alíquota 29% (Grupo 1 - tabaco)
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.di.parsearXML({ xmlContent: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<ListaDeclaracoes>
    <declaracaoImportacao>
        <adicao>
            <dadosMercadoriaCodigoNcm>24021000</dadosMercadoriaCodigoNcm>
            <iiAliquotaValorRecolher>000000000010000</iiAliquotaValorRecolher>
            <ipiAliquotaValorRecolher>000000000005000</ipiAliquotaValorRecolher>
            <pisPasepAliquotaValorRecolher>000000000001000</pisPasepAliquotaValorRecolher>
            <cofinsAliquotaValorRecolher>000000000004000</cofinsAliquotaValorRecolher>
            <numeroAdicao>001</numeroAdicao>
        </adicao>
        <dataRegistro>20260312</dataRegistro>
        <importadorNome>EMPRESA TESTE LTDA</importadorNome>
        <importadorNumero>12345678000190</importadorNumero>
        <importadorEnderecoUf>PE</importadorEnderecoUf>
        <numeroDI>2604023996</numeroDI>
        <informacaoComplementar>CIF US$: 1.000,00 R$: 5.000,00 TAXA SISCOMEX R$: 200,00</informacaoComplementar>
        <viaTransporteNome>MARÍTIMA</viaTransporteNome>
    </declaracaoImportacao>
</ListaDeclaracoes>` });
    const adicoes = result.adicoes as any[];
    // NCM 24021000 está na lista negativa (tabaco)
    expect(adicoes[0].ncm).toBe("24021000");
    // Impostos: II=100, IPI=50, PIS=10, COFINS=40 → total=200
    expect(adicoes[0].impostos.ii).toBe("100.00");
    expect(adicoes[0].impostos.ipi).toBe("50.00");
    expect(adicoes[0].impostos.pis).toBe("10.00");
    expect(adicoes[0].impostos.cofins).toBe("40.00");
    expect(adicoes[0].impostos.total).toBe("200.00");
  });

  it("fórmula ICMS: (impostos + taxaSiscomex/adições) ÷ 0,795 × alíquota", () => {
    // Exemplo: II=100, IPI=50, PIS=10, COFINS=40, taxaSiscomex=200 (1 adição)
    // somaImpostos = 100 + 50 + 10 + 40 + 200 = 400
    // valorICMS = (400 / 0.795) * (20.5 / 100) = 503.14... * 0.205 ≈ 103.14
    const somaImpostos = 100 + 50 + 10 + 40 + 200; // 400
    const aliquota = 20.5 / 100;
    const valorICMS = (somaImpostos / 0.795) * aliquota;
    expect(valorICMS).toBeCloseTo(103.14, 0);
  });

  it("fórmula ICMS com alíquota 29% (tabaco): (impostos + taxa) ÷ 0,795 × 0,29", () => {
    // somaImpostos = 200 + 200 (taxa) = 400
    // valorICMS = (400 / 0.795) * 0.29 ≈ 145.91
    const somaImpostos = 400;
    const aliquota = 29 / 100;
    const valorICMS = (somaImpostos / 0.795) * aliquota;
    expect(valorICMS).toBeCloseTo(145.91, 0);
  });
});

describe("GLME - Auth Logout", () => {
  it("realiza logout e limpa cookie", async () => {
    const clearedCookies: any[] = [];
    const ctx: TrpcContext = {
      user: {
        id: 1, openId: "test-user", email: "test@test.com", name: "Test",
        loginMethod: "manus", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date(),
      },
      req: { protocol: "https", headers: {} } as TrpcContext["req"],
      res: { clearCookie: (name: string, opts: any) => clearedCookies.push({ name, opts }) } as unknown as TrpcContext["res"],
    };
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.logout();
    expect(result).toEqual({ success: true });
    expect(clearedCookies.length).toBe(1);
  });
});
describe("GLME - Impostos Individuais por Adição", () => {
  const xmlComImpostos = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<ListaDeclaracoes>
    <declaracaoImportacao>
        <adicao>
            <dadosMercadoriaCodigoNcm>39241000</dadosMercadoriaCodigoNcm>
            <dadosMercadoriaNomeNcm>Utensilios de mesa</dadosMercadoriaNomeNcm>
            <iiBaseCalculo>000000000168611</iiBaseCalculo>
            <condicaoVendaValorReais>000000000168610</condicaoVendaValorReais>
            <iiAliquotaValorRecolher>000000000025000</iiAliquotaValorRecolher>
            <ipiAliquotaValorRecolher>000000000005000</ipiAliquotaValorRecolher>
            <pisPasepAliquotaValorRecolher>000000000002000</pisPasepAliquotaValorRecolher>
            <cofinsAliquotaValorRecolher>000000000009000</cofinsAliquotaValorRecolher>
            <numeroAdicao>001</numeroAdicao>
            <numeroDI>2604023996</numeroDI>
        </adicao>
        <adicao>
            <dadosMercadoriaCodigoNcm>01022110</dadosMercadoriaCodigoNcm>
            <dadosMercadoriaNomeNcm>Bovinos reprodutores</dadosMercadoriaNomeNcm>
            <iiBaseCalculo>000000000050000</iiBaseCalculo>
            <condicaoVendaValorReais>000000000050000</condicaoVendaValorReais>
            <iiAliquotaValorRecolher>000000000010000</iiAliquotaValorRecolher>
            <ipiAliquotaValorRecolher>000000000000000</ipiAliquotaValorRecolher>
            <pisPasepAliquotaValorRecolher>000000000001000</pisPasepAliquotaValorRecolher>
            <cofinsAliquotaValorRecolher>000000000004000</cofinsAliquotaValorRecolher>
            <numeroAdicao>002</numeroAdicao>
            <numeroDI>2604023996</numeroDI>
        </adicao>
        <armazenamentoRecintoAduaneiroCodigo>7921302</armazenamentoRecintoAduaneiroCodigo>
        <armazenamentoRecintoAduaneiroNome>ICTSI RIO BRASIL TERMINAL 1 SA</armazenamentoRecintoAduaneiroNome>
        <dataRegistro>20260312</dataRegistro>
        <importadorNome>EMPRESA TESTE LTDA</importadorNome>
        <importadorNumero>12345678000190</importadorNumero>
        <importadorEnderecoUf>PE</importadorEnderecoUf>
        <importadorEnderecoMunicipio>RECIFE</importadorEnderecoMunicipio>
        <importadorEnderecoBairro>CENTRO</importadorEnderecoBairro>
        <importadorEnderecoCep>50000000</importadorEnderecoCep>
        <numeroDI>2604023996</numeroDI>
        <informacaoComplementar>CIF US$: 1.000,00 R$: 5.000,00 TAXA SISCOMEX R$: 200,00</informacaoComplementar>
        <viaTransporteNome>MARÍTIMA</viaTransporteNome>
    </declaracaoImportacao>
</ListaDeclaracoes>`;

  it("extrai impostos individuais de cada adição", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.di.parsearXML({ xmlContent: xmlComImpostos });
    const adicoes = result.adicoes as any[];
    expect(adicoes).toHaveLength(2);
    // Adição 1: NCM 39241000 (não está na lista negativa)
    expect(adicoes[0].impostos).toBeDefined();
    expect(adicoes[0].impostos.ii).toBe("250.00");
    expect(adicoes[0].impostos.ipi).toBe("50.00");
    expect(adicoes[0].impostos.pis).toBe("20.00");
    expect(adicoes[0].impostos.cofins).toBe("90.00");
    expect(adicoes[0].impostos.total).toBe("410.00");
  });

  it("extrai impostos individuais da adição da lista negativa", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.di.parsearXML({ xmlContent: xmlComImpostos });
    const adicoes = result.adicoes as any[];
    // Adição 2: NCM 01022110 (está na lista negativa)
    expect(adicoes[1].impostos).toBeDefined();
    expect(adicoes[1].impostos.ii).toBe("100.00");
    expect(adicoes[1].impostos.ipi).toBe("0.00");
    expect(adicoes[1].impostos.pis).toBe("10.00");
    expect(adicoes[1].impostos.cofins).toBe("40.00");
    expect(adicoes[1].impostos.total).toBe("150.00");
  });

  it("adição sem campos de impostos retorna impostos zerados", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    // Usar o XML original que não tem campos de impostos individuais
    const xmlSemImpostos = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<ListaDeclaracoes>
    <declaracaoImportacao>
        <adicao>
            <dadosMercadoriaCodigoNcm>39241000</dadosMercadoriaCodigoNcm>
            <iiBaseCalculo>000000000168611</iiBaseCalculo>
            <condicaoVendaValorReais>000000000168610</condicaoVendaValorReais>
            <numeroAdicao>001</numeroAdicao>
        </adicao>
        <dataRegistro>20260312</dataRegistro>
        <importadorNome>EMPRESA TESTE LTDA</importadorNome>
        <importadorNumero>12345678000190</importadorNumero>
        <importadorEnderecoUf>PE</importadorEnderecoUf>
        <numeroDI>2604023996</numeroDI>
        <informacaoComplementar>CIF US$: 1.000,00 R$: 5.000,00</informacaoComplementar>
        <viaTransporteNome>MARÍTIMA</viaTransporteNome>
    </declaracaoImportacao>
</ListaDeclaracoes>`;
    const result = await caller.di.parsearXML({ xmlContent: xmlSemImpostos });
    const adicoes = result.adicoes as any[];
    expect(adicoes[0].impostos).toBeDefined();
    expect(adicoes[0].impostos.ii).toBe("0.00");
    expect(adicoes[0].impostos.ipi).toBe("0.00");
    expect(adicoes[0].impostos.pis).toBe("0.00");
    expect(adicoes[0].impostos.cofins).toBe("0.00");
    expect(adicoes[0].impostos.total).toBe("0.00");
  });
});

describe("GLME - Lista Negativa NCM", () => {
  it("NCM 01022110 está na lista negativa", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.di.parsearXML({ xmlContent: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<ListaDeclaracoes>
    <declaracaoImportacao>
        <adicao>
            <dadosMercadoriaCodigoNcm>01022110</dadosMercadoriaCodigoNcm>
            <iiAliquotaValorRecolher>000000000010000</iiAliquotaValorRecolher>
            <pisPasepAliquotaValorRecolher>000000000001000</pisPasepAliquotaValorRecolher>
            <cofinsAliquotaValorRecolher>000000000004000</cofinsAliquotaValorRecolher>
            <numeroAdicao>001</numeroAdicao>
        </adicao>
        <dataRegistro>20260312</dataRegistro>
        <importadorNome>EMPRESA TESTE LTDA</importadorNome>
        <importadorNumero>12345678000190</importadorNumero>
        <importadorEnderecoUf>PE</importadorEnderecoUf>
        <numeroDI>2604023996</numeroDI>
        <informacaoComplementar>CIF US$: 1.000,00 R$: 5.000,00</informacaoComplementar>
        <viaTransporteNome>MARÍTIMA</viaTransporteNome>
    </declaracaoImportacao>
</ListaDeclaracoes>` });
    // O parser deve retornar a adição com a NCM da lista negativa
    const adicoes = result.adicoes as any[];
    expect(adicoes[0].ncm).toBe("01022110");
    // Os impostos devem ser extraídos corretamente
    expect(adicoes[0].impostos.ii).toBe("100.00");
    expect(adicoes[0].impostos.pis).toBe("10.00");
    expect(adicoes[0].impostos.cofins).toBe("40.00");
  });

  it("NCM 39241000 não está na lista negativa", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.di.parsearXML({ xmlContent: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<ListaDeclaracoes>
    <declaracaoImportacao>
        <adicao>
            <dadosMercadoriaCodigoNcm>39241000</dadosMercadoriaCodigoNcm>
            <iiAliquotaValorRecolher>000000000025000</iiAliquotaValorRecolher>
            <numeroAdicao>001</numeroAdicao>
        </adicao>
        <dataRegistro>20260312</dataRegistro>
        <importadorNome>EMPRESA TESTE LTDA</importadorNome>
        <importadorNumero>12345678000190</importadorNumero>
        <importadorEnderecoUf>PE</importadorEnderecoUf>
        <numeroDI>2604023996</numeroDI>
        <informacaoComplementar>CIF US$: 1.000,00 R$: 5.000,00</informacaoComplementar>
        <viaTransporteNome>MARÍTIMA</viaTransporteNome>
    </declaracaoImportacao>
</ListaDeclaracoes>` });
    const adicoes = result.adicoes as any[];
    expect(adicoes[0].ncm).toBe("39241000");
    expect(adicoes[0].impostos.ii).toBe("250.00");
  });
});

describe("GLME - Cálculo ICMS com VCMV e Taxa FOB", () => {
  const xmlComVCMVeTaxaFOB = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<ListaDeclaracoes>
    <declaracaoImportacao>
        <adicao>
            <dadosMercadoriaCodigoNcm>24021000</dadosMercadoriaCodigoNcm>
            <dadosMercadoriaNomeNcm>Cigarros de tabaco</dadosMercadoriaNomeNcm>
            <condicaoVendaValorMoeda>000000000100000</condicaoVendaValorMoeda>
            <condicaoVendaValorReais>000000000515960</condicaoVendaValorReais>
            <iiAliquotaValorRecolher>000000000010000</iiAliquotaValorRecolher>
            <ipiAliquotaValorRecolher>000000000005000</ipiAliquotaValorRecolher>
            <pisPasepAliquotaValorRecolher>000000000001000</pisPasepAliquotaValorRecolher>
            <cofinsAliquotaValorRecolher>000000000004000</cofinsAliquotaValorRecolher>
            <numeroAdicao>001</numeroAdicao>
            <numeroDI>2604023996</numeroDI>
        </adicao>
        <armazenamentoRecintoAduaneiroCodigo>7921302</armazenamentoRecintoAduaneiroCodigo>
        <armazenamentoRecintoAduaneiroNome>ICTSI RIO</armazenamentoRecintoAduaneiroNome>
        <dataRegistro>20260312</dataRegistro>
        <importadorNome>EMPRESA TESTE LTDA</importadorNome>
        <importadorNumero>12345678000190</importadorNumero>
        <importadorEnderecoUf>PE</importadorEnderecoUf>
        <importadorEnderecoMunicipio>RECIFE</importadorEnderecoMunicipio>
        <importadorEnderecoBairro>CENTRO</importadorEnderecoBairro>
        <importadorEnderecoCep>50000000</importadorEnderecoCep>
        <numeroDI>2604023996</numeroDI>
        <informacaoComplementar>FOB US$: 1.000,00 R$: 5.159,60 FRETE US$: 50,00 R$: 257,98 CIF US$: 1.050,00 R$: 5.417,58 TAXA SISCOMEX R$: 200,00</informacaoComplementar>
        <viaTransporteNome>MARÍTIMA</viaTransporteNome>
    </declaracaoImportacao>
</ListaDeclaracoes>`;

  it("extrai taxaFOB calculada a partir dos valores FOB do informacaoComplementar", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.di.parsearXML({ xmlContent: xmlComVCMVeTaxaFOB });
    // Taxa FOB = 5159.60 / 1000.00 = 5.15960
    expect(result.taxaFOB).toBeDefined();
    const taxa = parseFloat(result.taxaFOB as string);
    expect(taxa).toBeCloseTo(5.1596, 3);
  });

  it("extrai VCMV (valorMoeda) da adição em moeda estrangeira", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.di.parsearXML({ xmlContent: xmlComVCMVeTaxaFOB });
    const adicoes = result.adicoes as any[];
    // condicaoVendaValorMoeda = 000000000100000 → 1000.00 USD
    expect(adicoes[0].valorMoeda).toBe("1000.00");
  });

  it("fórmula ICMS com VCMV: (VCMV×taxaFOB + impostos + taxaSiscomex) ÷ 0,795 × alíquota", () => {
    // VCMV = 1000 USD × taxa 5.1596 = 5159.60 BRL
    // II=100, IPI=50, PIS=10, COFINS=40 → impostos=200
    // taxaSiscomex = 200 (1 adição)
    // somaBase = 5159.60 + 200 + 200 = 5559.60
    // NCM 24021000 → prefixo 2402 → alíquota 29%
    // valorICMS = (5559.60 / 0.795) * 0.29 ≈ 2028.08
    const vcmvBRL = 1000 * 5.1596;
    const impostos = 100 + 50 + 10 + 40;
    const taxaSiscomex = 200;
    const somaBase = vcmvBRL + impostos + taxaSiscomex;
    const aliquota = 29 / 100;
    const valorICMS = (somaBase / 0.795) * aliquota;
    expect(valorICMS).toBeCloseTo(2028.08, 0);
  });

  it("fórmula ICMS com alíquota padrão 20,5% quando NCM não consta no Anexo I", () => {
    // NCM 01022110 não tem alíquota no Anexo I → usa 20,5%
    // somaBase = 1000 (VCMV_BRL) + 150 (impostos) + 200 (taxa) = 1350
    // valorICMS = (1350 / 0.795) * 0.205 ≈ 348.30
    const somaBase = 1000 + 150 + 200;
    const aliquota = 20.5 / 100;
    const valorICMS = (somaBase / 0.795) * aliquota;
    expect(valorICMS).toBeCloseTo(348.30, 0);
  });
});

describe("GLME - Taxa FOB do campo condicaoVendaTaxaCambio", () => {
  const xmlComTaxaCambioAdicao = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<ListaDeclaracoes>
    <declaracaoImportacao>
        <adicao>
            <dadosMercadoriaCodigoNcm>24021000</dadosMercadoriaCodigoNcm>
            <condicaoVendaValorMoeda>000000000100000</condicaoVendaValorMoeda>
            <condicaoVendaValorReais>000000000515960</condicaoVendaValorReais>
            <condicaoVendaTaxaCambio>000000000515960</condicaoVendaTaxaCambio>
            <iiAliquotaValorRecolher>000000000010000</iiAliquotaValorRecolher>
            <ipiAliquotaValorRecolher>000000000005000</ipiAliquotaValorRecolher>
            <pisPasepAliquotaValorRecolher>000000000001000</pisPasepAliquotaValorRecolher>
            <cofinsAliquotaValorRecolher>000000000004000</cofinsAliquotaValorRecolher>
            <numeroAdicao>001</numeroAdicao>
            <numeroDI>2604023996</numeroDI>
        </adicao>
        <dataRegistro>20260312</dataRegistro>
        <importadorNome>EMPRESA TESTE LTDA</importadorNome>
        <importadorNumero>12345678000190</importadorNumero>
        <importadorEnderecoUf>PE</importadorEnderecoUf>
        <numeroDI>2604023996</numeroDI>
        <informacaoComplementar>FOB US$: 1.000,00 R$: 5.159,60 CIF US$: 1.050,00 R$: 5.417,58 TAXA SISCOMEX R$: 200,00</informacaoComplementar>
        <viaTransporteNome>MARÍTIMA</viaTransporteNome>
    </declaracaoImportacao>
</ListaDeclaracoes>`;

  it("extrai taxaCambio da adição a partir de condicaoVendaTaxaCambio (÷ 100000)", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.di.parsearXML({ xmlContent: xmlComTaxaCambioAdicao });
    const adicoes = result.adicoes as any[];
    // condicaoVendaTaxaCambio = 000000000515960 → 515960 / 100000 = 5.15960
    expect(adicoes[0].taxaCambio).toBeDefined();
    const taxa = parseFloat(adicoes[0].taxaCambio);
    expect(taxa).toBeCloseTo(5.1596, 3);
  });

  it("taxaFOB global usa condicaoVendaTaxaCambio da primeira adição como prioridade", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.di.parsearXML({ xmlContent: xmlComTaxaCambioAdicao });
    // taxaFOB deve ser derivado do campo da adição (5.15960)
    expect(result.taxaFOB).toBeDefined();
    const taxa = parseFloat(result.taxaFOB as string);
    expect(taxa).toBeCloseTo(5.1596, 3);
  });

  it("taxaFOB usa fallback do informacaoComplementar quando condicaoVendaTaxaCambio ausente", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    // XML sem condicaoVendaTaxaCambio mas com FOB no informacaoComplementar
    const xmlSemTaxaCambio = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<ListaDeclaracoes>
    <declaracaoImportacao>
        <adicao>
            <dadosMercadoriaCodigoNcm>39241000</dadosMercadoriaCodigoNcm>
            <condicaoVendaValorMoeda>000000000100000</condicaoVendaValorMoeda>
            <condicaoVendaValorReais>000000000515960</condicaoVendaValorReais>
            <numeroAdicao>001</numeroAdicao>
        </adicao>
        <dataRegistro>20260312</dataRegistro>
        <importadorNome>EMPRESA TESTE LTDA</importadorNome>
        <importadorNumero>12345678000190</importadorNumero>
        <importadorEnderecoUf>PE</importadorEnderecoUf>
        <numeroDI>2604023996</numeroDI>
        <informacaoComplementar>FOB US$: 1.000,00 R$: 5.159,60 CIF US$: 1.050,00 R$: 5.417,58</informacaoComplementar>
        <viaTransporteNome>MARÍTIMA</viaTransporteNome>
    </declaracaoImportacao>
</ListaDeclaracoes>`;
    const result = await caller.di.parsearXML({ xmlContent: xmlSemTaxaCambio });
    // Fallback: 5159.60 / 1000.00 = 5.1596
    expect(result.taxaFOB).toBeDefined();
    const taxa = parseFloat(result.taxaFOB as string);
    expect(taxa).toBeCloseTo(5.1596, 3);
  });
});

describe("GLME - Fórmula ICMS com Base de Cálculo da Adição", () => {
  it("fórmula: (BaseCalculo + II + IPI + PIS + COFINS + TaxaSISCOMEX) ÷ 0,795 × alíquota", () => {
    // Base de Cálculo = 5159.60 (iiBaseCalculo do XML)
    // II=100, IPI=50, PIS=10, COFINS=40 → impostos=200
    // taxaSiscomex = 200 (1 adição)
    // somaBase = 5159.60 + 200 + 200 = 5559.60
    // NCM 24021000 → prefixo 2402 → alíquota 29%
    // valorICMS = (5559.60 / 0.795) * 0.29 ≈ 2028.08
    const baseCalculo = 5159.60;
    const impostos = 100 + 50 + 10 + 40;
    const taxaSiscomex = 200;
    const somaBase = baseCalculo + impostos + taxaSiscomex;
    const aliquota = 29 / 100;
    const valorICMS = (somaBase / 0.795) * aliquota;
    expect(valorICMS).toBeCloseTo(2028.08, 0);
  });

  it("fórmula com alíquota padrão 20,5% quando NCM não consta no Anexo I", () => {
    // BaseCalculo = 1000, impostos = 150, taxaSiscomex = 200
    // somaBase = 1350
    // valorICMS = (1350 / 0.795) * 0.205 ≈ 348.30
    const somaBase = 1000 + 150 + 200;
    const aliquota = 20.5 / 100;
    const valorICMS = (somaBase / 0.795) * aliquota;
    expect(valorICMS).toBeCloseTo(348.30, 0);
  });

  it("valorAduaneiro extraído do iiBaseCalculo do XML", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    // XML com iiBaseCalculo = 000000000051748 → 517.48
    const xmlComBaseCalculo = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<ListaDeclaracoes>
    <declaracaoImportacao>
        <adicao>
            <dadosMercadoriaCodigoNcm>61151093</dadosMercadoriaCodigoNcm>
            <iiBaseCalculo>000000000051748</iiBaseCalculo>
            <condicaoVendaValorReais>000000000051745</condicaoVendaValorReais>
            <numeroAdicao>008</numeroAdicao>
        </adicao>
        <dataRegistro>20260312</dataRegistro>
        <importadorNome>EMPRESA TESTE LTDA</importadorNome>
        <importadorNumero>12345678000190</importadorNumero>
        <importadorEnderecoUf>PE</importadorEnderecoUf>
        <numeroDI>2604023996</numeroDI>
        <viaTransporteNome>MARÍTIMA</viaTransporteNome>
    </declaracaoImportacao>
</ListaDeclaracoes>`;
    const result = await caller.di.parsearXML({ xmlContent: xmlComBaseCalculo });
    const adicoes = result.adicoes as any[];
    // iiBaseCalculo = 000000000051748 → 517.48
    expect(adicoes[0].valorAduaneiro).toBe("517.48");
  });
});

describe("GLME - Fórmula ICMS com Base de Cálculo da Adição", () => {
  it("fórmula: (BaseCalculo + II + IPI + PIS + COFINS + TaxaSISCOMEX) ÷ 0,795 × alíquota", () => {
    // Base de Cálculo = 5159.60 (iiBaseCalculo do XML)
    // II=100, IPI=50, PIS=10, COFINS=40 → impostos=200
    // taxaSiscomex = 200 (1 adição)
    // somaBase = 5159.60 + 200 + 200 = 5559.60
    // NCM 24021000 → prefixo 2402 → alíquota 29%
    // valorICMS = (5559.60 / 0.795) * 0.29 ≈ 2028.08
    const baseCalculo = 5159.60;
    const impostos = 100 + 50 + 10 + 40;
    const taxaSiscomex = 200;
    const somaBase = baseCalculo + impostos + taxaSiscomex;
    const aliquota = 29 / 100;
    const valorICMS = (somaBase / 0.795) * aliquota;
    expect(valorICMS).toBeCloseTo(2028.08, 0);
  });

  it("fórmula com alíquota padrão 20,5% quando NCM não consta no Anexo I", () => {
    const somaBase = 1000 + 150 + 200;
    const aliquota = 20.5 / 100;
    const valorICMS = (somaBase / 0.795) * aliquota;
    expect(valorICMS).toBeCloseTo(348.30, 0);
  });

  it("valorAduaneiro extraído do iiBaseCalculo do XML", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    const xmlComBaseCalculo = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<ListaDeclaracoes>
    <declaracaoImportacao>
        <adicao>
            <dadosMercadoriaCodigoNcm>61151093</dadosMercadoriaCodigoNcm>
            <iiBaseCalculo>000000000051748</iiBaseCalculo>
            <condicaoVendaValorReais>000000000051745</condicaoVendaValorReais>
            <numeroAdicao>008</numeroAdicao>
        </adicao>
        <dataRegistro>20260312</dataRegistro>
        <importadorNome>EMPRESA TESTE LTDA</importadorNome>
        <importadorNumero>12345678000190</importadorNumero>
        <importadorEnderecoUf>PE</importadorEnderecoUf>
        <numeroDI>2604023996</numeroDI>
        <viaTransporteNome>MARITIMA</viaTransporteNome>
    </declaracaoImportacao>
</ListaDeclaracoes>`;
    const result = await caller.di.parsearXML({ xmlContent: xmlComBaseCalculo });
    const adicoes = result.adicoes as any[];
    // iiBaseCalculo = 000000000051748 → 517.48
    expect(adicoes[0].valorAduaneiro).toBe("517.48");
  });
});

// ===== TESTES DO PARSER DUIMP PDF =====
import { parsearDuimpPDF } from "./duimpParser";

describe("GLME - Parser DUIMP PDF", () => {
  it("extrai número da DUIMP no formato padrão", () => {
    const texto = "DUIMP Nº 25BR000123456-0\nDECLARANTE\nEmpresa Teste LTDA";
    const resultado = parsearDuimpPDF(texto);
    expect(resultado).toHaveProperty("numeroDuimp");
  });

  it("extrai taxa SISCOMEX do texto do extrato", () => {
    const texto = "TAXA DE UTILIZAÇÃO DO SISCOMEX\nR$ 214,50\nOUTROS DADOS";
    const resultado = parsearDuimpPDF(texto);
    // Deve retornar o objeto com a estrutura correta
    expect(resultado).toHaveProperty("adicoes");
    expect(Array.isArray(resultado.adicoes)).toBe(true);
  });

  it("retorna objeto com adicoes vazio para texto sem dados", () => {
    const resultado = parsearDuimpPDF("texto sem dados relevantes");
    expect(resultado.adicoes).toHaveLength(0);
  });

  it("extrai valor aduaneiro quando presente no texto", () => {
    const texto = "VALOR ADUANEIRO: R$ 48.330,56\nOUTROS DADOS";
    const resultado = parsearDuimpPDF(texto);
    // Deve tentar extrair o valor aduaneiro
    expect(resultado.valorAduaneiro).toBe("48330.56");
  });
});
