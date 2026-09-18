/**
 * Consulta ao Cadastro de Contribuintes do ICMS pelo webservice oficial da SEFAZ
 * (NfeConsultaCadastro 4.00 — o mesmo serviço usado na emissão da NF-e).
 *
 * Devolve inscrição estadual, situação cadastral, regime de apuração e CNAE.
 * A conexão exige certificado digital ICP-Brasil do tipo A1 (e-CNPJ), informado
 * nas variáveis de ambiente CERTIFICADO_A1_BASE64 (o arquivo .pfx em base64)
 * e CERTIFICADO_A1_SENHA.
 */

import https from "node:https";
import tls from "node:tls";
import axios from "axios";
import * as xml2js from "xml2js";
import { cadastroDaUF, linkConsultaIE, UFS_COM_WEBSERVICE } from "@shared/sefazUF";
import { ICP_BRASIL_RAIZ_V10 } from "./certs/icpBrasil";

// Endereços por UF em shared/sefazUF.ts (Portal da NF-e). Todos os servidores usam a cadeia
// ICP-Brasil v10 ou uma raiz pública já presente no Node (MG: Sectigo R46).
export const UFS_ATENDIDAS = UFS_COM_WEBSERVICE;

const SOAP_ACTION = "http://www.portalfiscal.inf.br/nfe/wsdl/CadConsultaCadastro4/consultaCadastro";

export class ErroSefaz extends Error {
  constructor(
    message: string,
    readonly tipo: "nao_configurado" | "certificado" | "conexao" | "uf" | "resposta",
  ) {
    super(message);
  }
}

// ---------------------------------------------------------------------------
// Certificado
// ---------------------------------------------------------------------------

interface Certificado {
  pfx: Buffer;
  senha: string;
}

function lerCertificado(): Certificado {
  const base64 = (process.env.CERTIFICADO_A1_BASE64 || "").replace(/\s+/g, "");
  const senha = process.env.CERTIFICADO_A1_SENHA || "";
  if (!base64) {
    throw new ErroSefaz(
      "Certificado digital A1 não configurado (variáveis CERTIFICADO_A1_BASE64 e CERTIFICADO_A1_SENHA).",
      "nao_configurado",
    );
  }
  return { pfx: Buffer.from(base64, "base64"), senha };
}

function contextoSeguro(cert: Certificado) {
  try {
    return tls.createSecureContext({ pfx: cert.pfx, passphrase: cert.senha });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // RC2/3DES (A1 exportado no formato antigo): o OpenSSL 3 do Node não abre sem conversão
    if (/unsupported/i.test(msg)) {
      throw new ErroSefaz(
        "O certificado A1 usa criptografia antiga (RC2/3DES). Rode pnpm certificado:configurar para convertê-lo para AES-256.",
        "certificado",
      );
    }
    if (/mac verify|bad decrypt|password|pkcs12/i.test(msg)) {
      throw new ErroSefaz("Não foi possível abrir o certificado A1: confira a senha e o arquivo .pfx.", "certificado");
    }
    throw new ErroSefaz(`Certificado A1 inválido: ${msg}`, "certificado");
  }
}

export interface StatusCertificado {
  configurado: boolean;
  titular?: string;
  emissor?: string;
  validoAte?: string;
  expirado?: boolean;
  erro?: string;
}

/** Situação do certificado configurado, sem expor o arquivo nem a senha. */
export function statusCertificado(agora = new Date()): StatusCertificado {
  let cert: Certificado;
  try {
    cert = lerCertificado();
  } catch {
    return { configurado: false };
  }
  try {
    const socket = new tls.TLSSocket(null as never, { secureContext: contextoSeguro(cert) });
    const dados = socket.getCertificate() as tls.PeerCertificate | null;
    socket.destroy();
    if (!dados || !("valid_to" in dados)) return { configurado: true, erro: "Não foi possível ler os dados do certificado." };
    const validoAte = new Date(dados.valid_to);
    return {
      configurado: true,
      titular: dados.subject?.CN,
      emissor: dados.issuer?.CN,
      validoAte: validoAte.toISOString(),
      expirado: validoAte.getTime() < agora.getTime(),
    };
  } catch (e) {
    return { configurado: true, erro: e instanceof Error ? e.message : String(e) };
  }
}

// ---------------------------------------------------------------------------
// Requisição e resposta
// ---------------------------------------------------------------------------

export function montarEnvelopeConsulta(cnpj: string, uf: string): string {
  return (
    `<?xml version="1.0" encoding="utf-8"?>` +
    `<soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">` +
    `<soap12:Body>` +
    `<nfeDadosMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/CadConsultaCadastro4">` +
    `<ConsCad xmlns="http://www.portalfiscal.inf.br/nfe" versao="2.00">` +
    `<infCons><xServ>CONS-CAD</xServ><UF>${uf}</UF><CNPJ>${cnpj}</CNPJ></infCons>` +
    `</ConsCad>` +
    `</nfeDadosMsg>` +
    `</soap12:Body>` +
    `</soap12:Envelope>`
  );
}

export interface CadastroContribuinte {
  inscricaoEstadual: string;
  cnpj: string;
  uf: string;
  /** cSit: 1 = habilitado, 0 = não habilitado. */
  habilitado: boolean;
  situacao: string;
  razaoSocial: string;
  nomeFantasia: string;
  regimeApuracao: string;
  cnae: string;
  inicioAtividade: string;
  dataSituacao: string;
  dataBaixa: string;
  endereco: {
    logradouro: string;
    numero: string;
    complemento: string;
    bairro: string;
    municipio: string;
    cep: string;
  };
}

export interface ResultadoConsultaCadastro {
  encontrado: boolean;
  codigo: string;
  mensagem: string;
  cadastros: CadastroContribuinte[];
}

const texto = (v: unknown): string => {
  if (v === undefined || v === null) return "";
  // Elemento com atributos (ex.: <Text xml:lang="pt">) chega como { _: "conteúdo", $: {...} }
  if (typeof v === "object") return texto((v as Record<string, unknown>)._);
  return String(v).trim();
};
const lista = <T>(v: T | T[] | undefined): T[] => (v === undefined ? [] : Array.isArray(v) ? v : [v]);

/** Procura um elemento pelo nome em qualquer nível (a resposta SOAP varia entre UFs). */
function buscar(no: unknown, nome: string): unknown {
  if (!no || typeof no !== "object") return undefined;
  const obj = no as Record<string, unknown>;
  if (nome in obj) return obj[nome];
  for (const v of Object.values(obj)) {
    const achado = buscar(v, nome);
    if (achado !== undefined) return achado;
  }
  return undefined;
}

export async function interpretarRespostaCadastro(xml: string): Promise<ResultadoConsultaCadastro> {
  let doc: unknown;
  try {
    doc = await xml2js.parseStringPromise(xml, {
      explicitArray: false,
      tagNameProcessors: [xml2js.processors.stripPrefix],
      attrNameProcessors: [xml2js.processors.stripPrefix],
    });
  } catch {
    throw new ErroSefaz("A SEFAZ devolveu uma resposta que não é XML válido.", "resposta");
  }

  const infCons = buscar(buscar(doc, "retConsCad"), "infCons") as Record<string, unknown> | undefined;
  if (!infCons) {
    const falha = texto(buscar(doc, "Text") ?? buscar(doc, "faultstring"));
    throw new ErroSefaz(falha ? `A SEFAZ recusou a consulta: ${falha}` : "Resposta da SEFAZ sem o retorno da consulta.", "resposta");
  }

  const codigo = texto(infCons.cStat);
  const mensagem = texto(infCons.xMotivo);
  // 111: uma ocorrência · 112: mais de uma ocorrência (vários estabelecimentos/inscrições)
  const encontrado = codigo === "111" || codigo === "112";

  const cadastros = lista(infCons.infCad as Record<string, unknown> | Record<string, unknown>[] | undefined).map((c) => {
    const ender = (c.ender || {}) as Record<string, unknown>;
    const habilitado = texto(c.cSit) === "1";
    return {
      inscricaoEstadual: texto(c.IE),
      cnpj: texto(c.CNPJ),
      uf: texto(c.UF),
      habilitado,
      situacao: habilitado ? "Habilitado" : "Não habilitado",
      razaoSocial: texto(c.xNome),
      nomeFantasia: texto(c.xFant),
      regimeApuracao: texto(c.xRegApur),
      cnae: texto(c.CNAE),
      inicioAtividade: texto(c.dIniAtiv),
      dataSituacao: texto(c.dUltSit),
      dataBaixa: texto(c.dBaixa),
      endereco: {
        logradouro: texto(ender.xLgr),
        numero: texto(ender.nro),
        complemento: texto(ender.xCpl),
        bairro: texto(ender.xBairro),
        municipio: texto(ender.xMun),
        cep: texto(ender.CEP),
      },
    };
  });

  return { encontrado: encontrado && cadastros.length > 0, codigo, mensagem, cadastros };
}

/** Consulta o cadastro de contribuintes do ICMS da UF para o CNPJ informado. */
export async function consultarCadastroSefaz(cnpjInformado: string, ufInformada = "PE"): Promise<ResultadoConsultaCadastro> {
  const cnpj = cnpjInformado.replace(/\D/g, "");
  if (cnpj.length !== 14) throw new ErroSefaz("CNPJ inválido.", "resposta");
  const uf = ufInformada.trim().toUpperCase();
  const cadastro = cadastroDaUF(uf);
  if (!cadastro) throw new ErroSefaz(`UF inválida: ${uf || "(vazia)"}.`, "uf");
  const url = cadastro.webservice;
  if (!url) {
    throw new ErroSefaz(
      `A SEFAZ de ${cadastro.nome} não oferece consulta automática de cadastro. Consulte em ${linkConsultaIE(uf)}`,
      "uf",
    );
  }

  const cert = lerCertificado();
  // Valida o certificado antes de abrir a conexão, para uma mensagem de erro clara
  contextoSeguro(cert);
  const agente = new https.Agent({
    pfx: cert.pfx,
    passphrase: cert.senha,
    ca: [...tls.rootCertificates, ICP_BRASIL_RAIZ_V10],
    keepAlive: false,
  });

  try {
    const resp = await axios.post<string>(url, montarEnvelopeConsulta(cnpj, uf), {
      httpsAgent: agente,
      headers: { "Content-Type": `application/soap+xml; charset=utf-8; action="${SOAP_ACTION}"` },
      responseType: "text",
      transformResponse: (d) => d,
      timeout: 20000,
      // A SEFAZ responde falhas SOAP com HTTP 500 e corpo XML: interpretar mesmo assim
      validateStatus: (s) => s < 600,
    });
    return await interpretarRespostaCadastro(resp.data);
  } catch (e) {
    if (e instanceof ErroSefaz) throw e;
    if (axios.isAxiosError(e)) {
      if (e.code === "ECONNABORTED") throw new ErroSefaz("A SEFAZ não respondeu a tempo. Tente novamente.", "conexao");
      // Alertas TLS 42/46: o servidor recusou o certificado do cliente
      if (/bad certificate|certificate unknown|alert number 4[26]/i.test(e.message)) {
        throw new ErroSefaz(
          `A SEFAZ-${uf} recusou o certificado digital. Use um e-CNPJ A1 ICP-Brasil válido e dentro do prazo.`,
          "certificado",
        );
      }
      throw new ErroSefaz(`Falha de conexão com a SEFAZ-${uf}: ${e.message}`, "conexao");
    }
    throw new ErroSefaz(e instanceof Error ? e.message : String(e), "conexao");
  } finally {
    agente.destroy();
  }
}
