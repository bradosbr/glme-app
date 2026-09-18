import { afterEach, describe, expect, it } from "vitest";
import {
  ErroSefaz,
  consultarCadastroSefaz,
  interpretarRespostaCadastro,
  montarEnvelopeConsulta,
  statusCertificado,
} from "./sefazCadastro";
import { CADASTRO_UF, LINK_CCC, UFS_COM_WEBSERVICE, linkConsultaIE } from "@shared/sefazUF";

const envelope = (infCons: string) =>
  `<?xml version="1.0" encoding="utf-8"?><soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope"><soap:Body>` +
  `<nfeResultMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/CadConsultaCadastro4">` +
  `<retConsCad versao="2.00" xmlns="http://www.portalfiscal.inf.br/nfe"><infCons>${infCons}</infCons></retConsCad>` +
  `</nfeResultMsg></soap:Body></soap:Envelope>`;

const infCad = (ie: string, cSit: string) =>
  `<infCad><IE>${ie}</IE><CNPJ>00000000000191</CNPJ><UF>PE</UF><cSit>${cSit}</cSit>` +
  `<xNome>EMPRESA TESTE LTDA</xNome><xRegApur>NORMAL - REGIME PERIÓDICO DE APURAÇÃO</xRegApur><CNAE>4649499</CNAE>` +
  `<dIniAtiv>2015-01-10</dIniAtiv><dUltSit>2020-03-02</dUltSit>` +
  `<ender><xLgr>RUA DA AURORA</xLgr><nro>10</nro><xBairro>BOA VISTA</xBairro><cMun>2611606</cMun><xMun>RECIFE</xMun><CEP>50050000</CEP></ender></infCad>`;

describe("SEFAZ - consulta cadastro: requisição", () => {
  it("monta o ConsCad 2.00 com UF e CNPJ", () => {
    const xml = montarEnvelopeConsulta("00000000000191", "PE");
    expect(xml).toContain('<ConsCad xmlns="http://www.portalfiscal.inf.br/nfe" versao="2.00">');
    expect(xml).toContain("<xServ>CONS-CAD</xServ><UF>PE</UF><CNPJ>00000000000191</CNPJ>");
  });
});

describe("SEFAZ - consulta cadastro: resposta", () => {
  it("lê inscrição estadual, situação, regime e endereço (cStat 111)", async () => {
    const r = await interpretarRespostaCadastro(
      envelope(`<cStat>111</cStat><xMotivo>Consulta cadastro com uma ocorrencia</xMotivo>${infCad("0123456789", "1")}`),
    );
    expect(r.encontrado).toBe(true);
    expect(r.cadastros).toHaveLength(1);
    const c = r.cadastros[0];
    expect(c.inscricaoEstadual).toBe("0123456789");
    expect(c.habilitado).toBe(true);
    expect(c.situacao).toBe("Habilitado");
    expect(c.regimeApuracao).toBe("NORMAL - REGIME PERIÓDICO DE APURAÇÃO");
    expect(c.dataSituacao).toBe("2020-03-02");
    expect(c.endereco.municipio).toBe("RECIFE");
  });

  it("traz todas as inscrições quando há mais de uma (cStat 112)", async () => {
    const r = await interpretarRespostaCadastro(
      envelope(`<cStat>112</cStat><xMotivo>Consulta cadastro com mais de uma ocorrencia</xMotivo>${infCad("111", "1")}${infCad("222", "0")}`),
    );
    expect(r.cadastros.map((c) => [c.inscricaoEstadual, c.habilitado])).toEqual([["111", true], ["222", false]]);
  });

  it("CNPJ sem cadastro na UF não é erro: devolve a mensagem da SEFAZ", async () => {
    const r = await interpretarRespostaCadastro(
      envelope(`<cStat>259</cStat><xMotivo>Rejeicao: CNPJ da consulta nao cadastrado como contribuinte na UF</xMotivo>`),
    );
    expect(r.encontrado).toBe(false);
    expect(r.codigo).toBe("259");
    expect(r.mensagem).toContain("nao cadastrado");
  });

  it("falha SOAP vira erro legível", async () => {
    const fault =
      `<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope"><soap:Body><soap:Fault>` +
      `<soap:Reason><soap:Text xml:lang="pt">Certificado nao autorizado</soap:Text></soap:Reason></soap:Fault></soap:Body></soap:Envelope>`;
    await expect(interpretarRespostaCadastro(fault)).rejects.toThrow("Certificado nao autorizado");
  });
});

describe("SEFAZ - certificado", () => {
  const original = { base64: process.env.CERTIFICADO_A1_BASE64, senha: process.env.CERTIFICADO_A1_SENHA };
  afterEach(() => {
    process.env.CERTIFICADO_A1_BASE64 = original.base64;
    process.env.CERTIFICADO_A1_SENHA = original.senha;
    if (original.base64 === undefined) delete process.env.CERTIFICADO_A1_BASE64;
    if (original.senha === undefined) delete process.env.CERTIFICADO_A1_SENHA;
  });

  it("sem certificado configurado, informa e não tenta consultar", async () => {
    delete process.env.CERTIFICADO_A1_BASE64;
    expect(statusCertificado()).toEqual({ configurado: false });
    await expect(consultarCadastroSefaz("00000000000191")).rejects.toMatchObject({ tipo: "nao_configurado" });
  });

  it("arquivo que não é .pfx vira erro de certificado, sem sair para a rede", async () => {
    process.env.CERTIFICADO_A1_BASE64 = Buffer.from("isto não é um pfx").toString("base64");
    process.env.CERTIFICADO_A1_SENHA = "x";
    await expect(consultarCadastroSefaz("00000000000191")).rejects.toBeInstanceOf(ErroSefaz);
    await expect(consultarCadastroSefaz("00000000000191")).rejects.toMatchObject({ tipo: "certificado" });
  });

  it("recusa UF sem webservice, indicando o site de consulta da SEFAZ", async () => {
    await expect(consultarCadastroSefaz("00000000000191", "RJ")).rejects.toMatchObject({ tipo: "uf" });
    await expect(consultarCadastroSefaz("00000000000191", "RJ")).rejects.toThrow("fazenda.rj.gov.br");
    await expect(consultarCadastroSefaz("00000000000191", "XX")).rejects.toThrow("UF inválida");
  });
});

describe("SEFAZ - tabela de UFs", () => {
  it("cobre as 27 UFs, cada uma com um link de consulta https ou http", () => {
    expect(Object.keys(CADASTRO_UF)).toHaveLength(27);
    for (const [uf, c] of Object.entries(CADASTRO_UF)) expect(c.consulta, uf).toMatch(/^https?:\/\//);
  });

  it("tem consulta automática nas 15 UFs do Portal da NF-e", () => {
    expect([...UFS_COM_WEBSERVICE].sort()).toEqual(
      ["AC", "AM", "BA", "ES", "GO", "MG", "MS", "MT", "PB", "PE", "PR", "RN", "RS", "SC", "SP"],
    );
  });

  it("AC, ES, PB, RN e SC consultam pela SEFAZ Virtual do RS", () => {
    for (const uf of ["AC", "ES", "PB", "RN", "SC"]) {
      expect(CADASTRO_UF[uf].webservice).toBe("https://cad.svrs.rs.gov.br/ws/cadconsultacadastro/cadconsultacadastro4.asmx");
    }
  });

  it("UF desconhecida cai no CCC nacional", () => {
    expect(linkConsultaIE("XX")).toBe(LINK_CCC);
    expect(linkConsultaIE(" pe ")).toBe("http://www.sintegra.sefaz.pe.gov.br/");
  });
});
