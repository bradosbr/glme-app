import { z } from "zod";
import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, adminProcedure, router } from "./_core/trpc";
import { sdk } from "./_core/sdk";
import { verifyPassword } from "./password";
import { TRPCError } from "@trpc/server";
import {
  getImportadores,
  getImportadorByCnpj,
  upsertImportador,
  deleteImportador,
  searchImportadores,
  getRecintos,
  seedRecintos,
  getUserByUsername,
  getUserById,
  listUsers,
  createLocalUser,
  setUserPassword,
  updateUserFields,
  deleteUser,
  requestPasswordReset,
  touchLastSignedIn,
  listarEmpresasDoUsuario,
  vincularEmpresa,
  desvincularEmpresa,
  usuarioVinculadoAEmpresa,
  getChavePortalEmpresa,
  salvarChavePortalEmpresa,
  removerChavePortalEmpresa,
} from "./db";
import { cifrar, criptografiaDisponivel, mascarar } from "./cripto";
import axios from "axios";
import * as xml2js from "xml2js";
import { parsearDuimpPDF, type DuimpParsedData } from "./duimpParser";
import { consultarCadastroSefaz, statusCertificado, ErroSefaz, UFS_ATENDIDAS } from "./sefazCadastro";

/**
 * Mapeia os dados brutos da API do Portal Único para o formato DuimpParsedData.
 */
function mapearDuimpAPIParaGLME(data: Record<string, unknown>): DuimpParsedData {
  const get = (obj: Record<string, unknown>, ...keys: string[]): string | undefined => {
    for (const k of keys) {
      const v = obj[k];
      if (v !== undefined && v !== null && v !== "") return String(v);
    }
    return undefined;
  };

  // Importador
  const importador = (data.importador || data.declarante || {}) as Record<string, unknown>;
  const endereco = (importador.endereco || {}) as Record<string, unknown>;

  // Adições
  const itens = (Array.isArray(data.itens) ? data.itens : []) as Record<string, unknown>[];
  const adicoes = itens.map((item, idx) => ({
    numero: String(idx + 1),
    ncm: get(item, "ncm", "codigoNcm") ?? "",
    descricao: get(item, "descricao", "descricaoMercadoria") ?? "",
    // Na API cada item vira uma adição: o próprio item é o único da lista
    itens: [{
      numero: get(item, "numeroItem", "numero") ?? String(idx + 1),
      descricao: get(item, "descricao", "descricaoMercadoria") ?? "",
    }],
    quantidade: get(item, "quantidade", "quantidadeEstatistica"),
    valorFOB: get(item, "valorFob", "valorFOB"),
    valorAduaneiro: get(item, "valorAduaneiro", "valorAduaneiroReal", "baseCalculoII", "baseCalculo"),
    pesoLiquido: get(item, "pesoLiquido", "pesoLiquidoKg"),
    baseCalculo: get(item, "baseCalculoII", "baseCalculo"),
    ii: get(item, "valorII", "impostoImportacao"),
    ipi: get(item, "valorIPI", "ipi"),
    pis: get(item, "valorPIS", "pisPasep"),
    cofins: get(item, "valorCOFINS", "cofins"),
  }));

  // Tributos federais: soma dos itens (a API não traz o total pronto)
  const somar = (campo: "ii" | "ipi" | "pis" | "cofins") =>
    adicoes.reduce((t, a) => t + Math.round(parseFloat(a[campo] || "0") * 100), 0);
  const [ii, ipi, pis, cofins] = [somar("ii"), somar("ipi"), somar("pis"), somar("cofins")];
  const taxaSiscomex = get(data, "taxaSiscomex", "taxaUtilizacaoSiscomex");
  const totalImpostos = ii + ipi + pis + cofins + Math.round(parseFloat(taxaSiscomex || "0") * 100);

  return {
    numeroDuimp: get(data, "numeroDuimp", "numero"),
    versaoDuimp: get(data, "versao"),
    importadorNome: get(importador, "nome", "razaoSocial"),
    importadorCnpj: get(importador, "cnpj"),
    importadorEndereco: get(endereco, "logradouro", "endereco"),
    importadorBairro: get(endereco, "bairro"),
    importadorCep: get(endereco, "cep"),
    importadorMunicipio: get(endereco, "municipio", "cidade"),
    importadorUf: get(endereco, "uf", "estado"),
    valorFOBDolar: get(data, "valorFobDolar", "totalFobUsd"),
    valorFOBReais: get(data, "valorFobReais", "totalFobBrl"),
    taxaCambio: get(data, "taxaCambio"),
    valorAduaneiro: get(data, "valorAduaneiro"),
    taxaSiscomex,
    ii: (ii / 100).toFixed(2),
    ipi: (ipi / 100).toFixed(2),
    pis: (pis / 100).toFixed(2),
    cofins: (cofins / 100).toFixed(2),
    impostosTotal: totalImpostos > 0 ? (totalImpostos / 100).toFixed(2) : undefined,
    adicoes,
  };
}

// ===== CNPJ API =====
async function buscarCNPJ(cnpj: string) {
  const cnpjClean = cnpj.replace(/\D/g, "");
  if (cnpjClean.length !== 14) throw new Error("CNPJ inválido");

  try {
    const resp = await axios.get(`https://brasilapi.com.br/api/cnpj/v1/${cnpjClean}`, { timeout: 10000 });
    const d = resp.data;
    return {
      cnpj: cnpjClean,
      razaoSocial: d.razao_social || "",
      nomeFantasia: d.nome_fantasia || "",
      cnae: d.cnae_fiscal ? String(d.cnae_fiscal) : "",
      endereco: `${d.logradouro || ""}, ${d.numero || ""}`.trim().replace(/^,\s*/, ""),
      bairro: d.bairro || "",
      cep: d.cep || "",
      municipio: d.municipio || "",
      uf: d.uf || "",
      telefone: d.ddd_telefone_1 ? `(${d.ddd_telefone_1}) ${d.telefone_1 || ""}` : "",
      email: d.email || "",
      situacao: d.descricao_situacao_cadastral || "",
    };
  } catch (_e1) {
    try {
      const resp2 = await axios.get(`https://receitaws.com.br/v1/cnpj/${cnpjClean}`, { timeout: 10000 });
      const d = resp2.data;
      if (d.status === "ERROR") throw new Error(d.message);
      return {
        cnpj: cnpjClean,
        razaoSocial: d.nome || "",
        nomeFantasia: d.fantasia || "",
        cnae: d.atividade_principal?.[0]?.code || "",
        endereco: `${d.logradouro || ""}, ${d.numero || ""}`.trim().replace(/^,\s*/, ""),
        bairro: d.bairro || "",
        cep: d.cep || "",
        municipio: d.municipio || "",
        uf: d.uf || "",
        telefone: d.telefone || "",
        email: d.email || "",
        situacao: d.situacao || "",
      };
    } catch (_e2) {
      throw new Error("Não foi possível consultar o CNPJ. Tente novamente mais tarde.");
    }
  }
}

// ===== PARSER DE DI XML =====
// Helper para extrair valor de um campo em múltiplos formatos de XML SISCOMEX
function getVal(obj: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const v = obj?.[key];
    if (v && typeof v === "string" && v.trim()) return v.trim();
    if (v && typeof v === "number") return String(v);
    const attrs = obj?.$ as Record<string, unknown>;
    if (attrs?.[key] && typeof attrs[key] === "string") return (attrs[key] as string).trim();
  }
  return "";
}

// Converte data YYYYMMDD para DD/MM/YYYY
function formatarData(raw: string): string {
  if (!raw) return "";
  if (/^\d{8}$/.test(raw)) {
    return `${raw.slice(6,8)}/${raw.slice(4,6)}/${raw.slice(0,4)}`;
  }
  return raw;
}

// Converte valor numérico em centavos (string) para reais com 2 casas decimais
function formatarValor(raw: string): string {
  if (!raw) return "";
  const num = parseInt(raw.replace(/\D/g, ""), 10);
  if (isNaN(num)) return "";
  return (num / 100).toFixed(2);
}

function parseDIXML(xmlContent: string): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    xml2js.parseString(
      xmlContent,
      { explicitArray: false, ignoreAttrs: false, trim: true, normalize: true },
      (err: Error | null, result: Record<string, unknown>) => {
        if (err) return reject(new Error(`XML inválido: ${err.message}`));
        try {
          // Suporta múltiplas raízes: ListaDeclaracoes > declaracaoImportacao ou direto
          let di = result as Record<string, unknown>;
          if (result?.ListaDeclaracoes) {
            const lista = result.ListaDeclaracoes as Record<string, unknown>;
            di = (lista?.declaracaoImportacao || lista) as Record<string, unknown>;
          } else if (result?.declaracaoImportacao) {
            di = result.declaracaoImportacao as Record<string, unknown>;
          } else if (result?.DeclaracaoImportacao) {
            di = result.DeclaracaoImportacao as Record<string, unknown>;
          } else {
            di = (Object.values(result)[0] || result) as Record<string, unknown>;
          }

          // ===== NÚMERO DA DI =====
          const numeroDI = getVal(di, "numeroDI", "numero", "numDI", "nrDI");

          // ===== DATA DE REGISTRO =====
          const dataRegistroRaw = getVal(di, "dataRegistro", "dataDesembaraco", "dataChegada");
          const dataRegistro = formatarData(dataRegistroRaw);

          // ===== IMPORTADOR =====
          // No XML SISCOMEX real, os campos do importador ficam diretamente na raiz da declaração
          const importadorNome = getVal(di, "importadorNome");
          const importadorCNPJ = getVal(di, "importadorNumero"); // CNPJ está em importadorNumero
          const importadorLogradouro = getVal(di, "importadorEnderecoLogradouro");
          const importadorNumero = getVal(di, "importadorEnderecoNumero");
          const importadorComplemento = getVal(di, "importadorEnderecoComplemento");
          const importadorBairro = getVal(di, "importadorEnderecoBairro");
          const importadorCEP = getVal(di, "importadorEnderecoCep");
          const importadorMunicipio = getVal(di, "importadorEnderecoMunicipio");
          const importadorUF = getVal(di, "importadorEnderecoUf");
          const importadorTelefone = getVal(di, "importadorNumeroTelefone");
          const importadorRepresentante = getVal(di, "importadorNomeRepresentanteLegal");
          const importadorCPFRepresentante = getVal(di, "importadorCpfRepresentanteLegal");

          // Monta endereço completo
          const enderecoPartes = [importadorLogradouro, importadorNumero, importadorComplemento].filter(Boolean);
          const enderecoCompleto = enderecoPartes.join(", ");

          // ===== RECINTO ADUANEIRO =====
          const recintoNome = getVal(di, "armazenamentoRecintoAduaneiroNome");
          const recintoCodigoRaw = getVal(di, "armazenamentoRecintoAduaneiroCodigo");
          // Formata código: 7921302 → 7.92.13.02-X
          let recintoCodigoFormatado = recintoCodigoRaw;
          if (/^\d{7}$/.test(recintoCodigoRaw)) {
            recintoCodigoFormatado = `${recintoCodigoRaw.slice(0,1)}.${recintoCodigoRaw.slice(1,3)}.${recintoCodigoRaw.slice(3,5)}.${recintoCodigoRaw.slice(5,7)}`;
          }

          // ===== URF / UF DESEMBARAÇO =====
          const urfNome = getVal(di, "urfDespachoNome", "cargaUrfEntradaNome");
          const urfCodigo = getVal(di, "urfDespachoCodigo", "cargaUrfEntradaCodigo");
          // UF do desembaraço: extrair dos 2 primeiros dígitos do código URF (07 = RJ)
          const ufDesembaraco = getVal(di, "importadorEnderecoUf"); // Usa UF do importador como fallback

          // ===== VIA DE TRANSPORTE =====
          const viaTransporte = getVal(di, "viaTransporteNome");
          const transportador = getVal(di, "viaTransporteNomeTransportador");
          const nomeVeiculo = getVal(di, "viaTransporteNomeVeiculo");

          // ===== VALORES CIF =====
          // Extrair do informacaoComplementar: "CIF US$: 28.232,60 R$: 145.668,92"
          const infoCompl = getVal(di, "informacaoComplementar");
          let valorCIFReais = "";
          let valorCIFDolar = "";
          let valorFOBReais = "";
          let valorFOBDolar = "";
          let valorFreteReais = "";
          let valorFreteDolar = "";

          if (infoCompl) {
            // Formato brasileiro: "CIF US$: 28.232,60 R$: 145.668,92"
            const cifMatch = infoCompl.match(/CIF\s+US\$:\s*([\d.,]+)\s+R\$:\s*([\d.,]+)/i);
            if (cifMatch) {
              valorCIFDolar = cifMatch[1].replace(/\./g, "").replace(",", ".");
              valorCIFReais = cifMatch[2].replace(/\./g, "").replace(",", ".");
            }
            const fobMatch = infoCompl.match(/FOB\s+US\$:\s*([\d.,]+)\s+R\$:\s*([\d.,]+)/i);
            if (fobMatch) {
              valorFOBDolar = fobMatch[1].replace(/\./g, "").replace(",", ".");
              valorFOBReais = fobMatch[2].replace(/\./g, "").replace(",", ".");
            }
            const freteMatch = infoCompl.match(/FRETE\s+US\$:\s*([\d.,]+)\s+R\$:\s*([\d.,]+)/i);
            if (freteMatch) {
              valorFreteDolar = freteMatch[1].replace(/\./g, "").replace(",", ".");
              valorFreteReais = freteMatch[2].replace(/\./g, "").replace(",", ".");
            }
          }

          // Fallback: usar localDescargaTotalReais como CIF em reais
          if (!valorCIFReais) {
            const cifRaw = getVal(di, "localDescargaTotalReais");
            if (cifRaw) valorCIFReais = formatarValor(cifRaw);
          }

          // ===== FRETE TOTAL =====
          const freteTotalReaisRaw = getVal(di, "freteTotalReais");
          if (!valorFreteReais && freteTotalReaisRaw) {
            valorFreteReais = formatarValor(freteTotalReaisRaw);
          }

          // ===== DATA DE CHEGADA =====
          const dataChegadaRaw = getVal(di, "cargaDataChegada");
          const dataChegada = formatarData(dataChegadaRaw);

          // ===== PAÍS DE PROCEDÊNCIA =====
          const paisProcedencia = getVal(di, "cargaPaisProcedenciaNome");

          // ===== ADIÇÕES =====
          const adicoesRaw =
            di?.adicao ||
            di?.Adicao ||
            di?.adicoes ||
            di?.Adicoes ||
            null;
          const adicoes: Record<string, unknown>[] = adicoesRaw
            ? Array.isArray(adicoesRaw) ? adicoesRaw : [adicoesRaw]
            : [];

          // ===== SOMAR IMPOSTOS DE TODAS AS ADIÇÕES =====
          let totalII = 0;
          let totalIPI = 0;
          let totalPIS = 0;
          let totalCOFINS = 0;

          for (const ad of adicoes) {
            const iiRaw = getVal(ad as Record<string, unknown>, "iiAliquotaValorRecolher");
            const ipiRaw = getVal(ad as Record<string, unknown>, "ipiAliquotaValorRecolher");
            const pisRaw = getVal(ad as Record<string, unknown>, "pisPasepAliquotaValorRecolher");
            const cofinsRaw = getVal(ad as Record<string, unknown>, "cofinsAliquotaValorRecolher");
            if (iiRaw) totalII += parseInt(iiRaw.replace(/\D/g, ""), 10);
            if (ipiRaw) totalIPI += parseInt(ipiRaw.replace(/\D/g, ""), 10);
            if (pisRaw) totalPIS += parseInt(pisRaw.replace(/\D/g, ""), 10);
            if (cofinsRaw) totalCOFINS += parseInt(cofinsRaw.replace(/\D/g, ""), 10);
          }

          // Extrair Taxa SISCOMEX do informacaoComplementar: "TAXA SISCOMEX R$: 586,08"
          let taxaSiscomex = 0;
          if (infoCompl) {
            const taxaMatch = infoCompl.match(/TAXA\s+SISCOMEX\s+R\$:\s*([\d.,]+)/i);
            if (taxaMatch) {
              const taxaStr = taxaMatch[1].replace(/\./g, "").replace(",", ".");
              taxaSiscomex = Math.round(parseFloat(taxaStr) * 100);
            }
          }

          // Pagamentos da DI (<pagamento>): o valor efetivamente recolhido da Taxa Siscomex
          // (receita 7811) prevalece sobre o texto livre. As demais receitas desconhecidas
          // são devolvidas à parte para o usuário avaliar se entram como despesa aduaneira.
          const RECEITAS_CONHECIDAS = new Set(["0086", "1038", "5602", "5629", "7811"]);
          const pagamentosRaw = di?.pagamento;
          const pagamentos: Record<string, unknown>[] = pagamentosRaw
            ? (Array.isArray(pagamentosRaw) ? pagamentosRaw : [pagamentosRaw]) as Record<string, unknown>[]
            : [];
          let taxaSiscomexPaga = 0;
          const outrasReceitas: { codigo: string; valor: string }[] = [];
          for (const p of pagamentos) {
            const codigo = getVal(p, "codigoReceita").padStart(4, "0");
            const valor = parseInt(getVal(p, "valorReceita").replace(/\D/g, "") || "0", 10);
            if (!valor) continue;
            if (codigo === "7811") taxaSiscomexPaga += valor;
            else if (!RECEITAS_CONHECIDAS.has(codigo)) outrasReceitas.push({ codigo, valor: (valor / 100).toFixed(2) });
          }
          if (taxaSiscomexPaga > 0) taxaSiscomex = taxaSiscomexPaga;

          const totalImpostosReais = ((totalII + totalIPI + totalPIS + totalCOFINS + taxaSiscomex) / 100).toFixed(2);
          const totalTributosFederais = ((totalII + totalIPI + totalPIS + totalCOFINS) / 100).toFixed(2);

          // Calcular taxa de câmbio FOB (BRL por USD)
          // Prioridade 1: campo condicaoVendaTaxaCambio da primeira adição (mais preciso)
          // Prioridade 2: calcular a partir dos valores FOB do informacaoComplementar
          let taxaFOB = "";
          const primeiraAdicaoTaxaRaw = adicoes.length > 0
            ? getVal(adicoes[0] as Record<string, unknown>, "condicaoVendaTaxaCambio")
            : "";
          if (primeiraAdicaoTaxaRaw) {
            const taxaNum = parseInt(primeiraAdicaoTaxaRaw.replace(/\D/g, ""), 10);
            if (taxaNum > 0) taxaFOB = (taxaNum / 100000).toFixed(6);
          }
          if (!taxaFOB && valorFOBDolar && valorFOBReais) {
            const fobD = parseFloat(valorFOBDolar);
            const fobR = parseFloat(valorFOBReais);
            if (fobD > 0) taxaFOB = (fobR / fobD).toFixed(6);
          }
          const adicoesParsed = adicoes.map((ad: Record<string, unknown>, idx: number) => {
            const numero = getVal(ad, "numeroAdicao", "numero", "numAdicao") || String(idx + 1);
            const ncm = getVal(ad, "dadosMercadoriaCodigoNcm", "ncm", "classificacaoFiscal", "codigoNcm");
            const ncmNome = getVal(ad, "dadosMercadoriaNomeNcm", "nomeNcm");
            const incoterm = getVal(ad, "condicaoVendaIncoterm");
            const moeda = getVal(ad, "condicaoVendaMoedaNome");
            const valorMoeda = getVal(ad, "condicaoVendaValorMoeda");
            const valorReais = getVal(ad, "condicaoVendaValorReais");
            // Taxa de câmbio da adição: condicaoVendaTaxaCambio (15 dígitos, 5 casas decimais)
            const taxaCambioRaw = getVal(ad, "condicaoVendaTaxaCambio");
            const taxaCambioAdicao = taxaCambioRaw
              ? (parseInt(taxaCambioRaw.replace(/\D/g, ""), 10) / 100000).toFixed(6)
              : "";
            const paisOrigem = getVal(ad, "paisOrigemMercadoriaNome");
            const fornecedor = getVal(ad, "fornecedorNome");
            // Descrição da mercadoria (primeiro item)
            const mercadoria = ad?.mercadoria as Record<string, unknown> | undefined;
            const descricao = mercadoria
              ? getVal(mercadoria, "descricaoMercadoria")
              : "";
            // Valor aduaneiro da adição (base de cálculo II em centavos)
            const valorAduaneiroRaw = getVal(ad, "iiBaseCalculo");
            const valorAduaneiro = valorAduaneiroRaw ? formatarValor(valorAduaneiroRaw) : formatarValor(valorReais);

            // Impostos individuais da adição (em centavos → reais)
            const adIIRaw = getVal(ad as Record<string, unknown>, "iiAliquotaValorRecolher");
            const adIPIRaw = getVal(ad as Record<string, unknown>, "ipiAliquotaValorRecolher");
            const adPISRaw = getVal(ad as Record<string, unknown>, "pisPasepAliquotaValorRecolher");
            const adCOFINSRaw = getVal(ad as Record<string, unknown>, "cofinsAliquotaValorRecolher");
            const adIIVal = adIIRaw ? parseInt(adIIRaw.replace(/\D/g, ""), 10) : 0;
            const adIPIVal = adIPIRaw ? parseInt(adIPIRaw.replace(/\D/g, ""), 10) : 0;
            const adPISVal = adPISRaw ? parseInt(adPISRaw.replace(/\D/g, ""), 10) : 0;
            const adCOFINSVal = adCOFINSRaw ? parseInt(adCOFINSRaw.replace(/\D/g, ""), 10) : 0;
            // Peso líquido (kg, 5 casas decimais) — critério de rateio do AFRMM
            const pesoRaw = getVal(ad, "dadosMercadoriaPesoLiquido");
            const pesoLiquido = pesoRaw ? (parseInt(pesoRaw.replace(/\D/g, ""), 10) / 100000).toFixed(5) : "";

            return {
              numero: numero.replace(/^0+/, "") || String(idx + 1),
              ncm,
              ncmNome,
              descricao: descricao.replace(/\s+/g, " ").trim(),
              incoterm,
              moeda,
              valorMoeda: valorMoeda ? formatarValor(valorMoeda) : "",
              valorReais: valorReais ? formatarValor(valorReais) : "",
              taxaCambio: taxaCambioAdicao,
              valorAduaneiro,
              paisOrigem,
              fornecedor,
              pesoLiquido,
              impostos: {
                ii: (adIIVal / 100).toFixed(2),
                ipi: (adIPIVal / 100).toFixed(2),
                pis: (adPISVal / 100).toFixed(2),
                cofins: (adCOFINSVal / 100).toFixed(2),
                total: ((adIIVal + adIPIVal + adPISVal + adCOFINSVal) / 100).toFixed(2),
              },
            };
          });

          // Ordenar adições por número crescente
          adicoesParsed.sort((a, b) => parseInt(a.numero) - parseInt(b.numero));

          const parsed = {
            numeroDI,
            dataRegistro,
            dataChegada,
            paisProcedencia,
            viaTransporte,
            transportador,
            nomeVeiculo,
            urfNome,
            urfCodigo,
            recintoNome,
            recintoCodigoRaw,
            recintoCodigoFormatado,
            valorCIFReais,
            valorCIFDolar,
            valorFOBReais,
            valorFOBDolar,
            taxaFOB,
            valorFreteReais,
            valorFreteDolar,
            totalImpostosReais,
            totalII: (totalII / 100).toFixed(2),
            totalIPI: (totalIPI / 100).toFixed(2),
            totalPIS: (totalPIS / 100).toFixed(2),
            totalCOFINS: (totalCOFINS / 100).toFixed(2),
            taxaSiscomex: (taxaSiscomex / 100).toFixed(2),
            totalTributosFederais,
            outrasReceitas,
            // Soma dos valores aduaneiros das adições (base do II): não depende do texto livre
            valorAduaneiroTotal: (adicoesParsed.reduce((t, a) => t + Math.round(parseFloat(a.valorAduaneiro || "0") * 100), 0) / 100).toFixed(2),
            importador: {
              nome: importadorNome,
              cnpj: importadorCNPJ,
              endereco: enderecoCompleto,
              bairro: importadorBairro,
              cep: importadorCEP,
              municipio: importadorMunicipio,
              uf: importadorUF,
              telefone: importadorTelefone.replace(/\s+/g, " ").trim(),
              representanteLegal: importadorRepresentante,
              cpfRepresentante: importadorCPFRepresentante,
            },
            ufDesembaraco,
            adicoes: adicoesParsed,
          };
          resolve(parsed);
        } catch (_e) {
          reject(new Error("Formato de XML de DI não reconhecido. Verifique se é um XML exportado do SISCOMEX."));
        }
      }
    );
  });
}

/**
 * Trocar ou remover a chave de acesso de uma empresa: administrador, usuário vinculado
 * à empresa ou, se a empresa ainda não tem chave, quem está cadastrando.
 */
async function exigirPermissaoChave(usuario: { id: number; role: string }, importadorId: number) {
  if (usuario.role === "admin") return;
  if (!(await getChavePortalEmpresa(importadorId))) return;
  if (await usuarioVinculadoAEmpresa(usuario.id, importadorId)) return;
  throw new TRPCError({
    code: "FORBIDDEN",
    message: "Só o administrador ou um usuário vinculado à empresa pode alterar a chave de acesso dela.",
  });
}

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => {
      if (!opts.ctx.user) return null;
      const { passwordHash: _ph, ...safe } = opts.ctx.user;
      return safe;
    }),

    login: publicProcedure
      .input(z.object({
        username: z.string().min(1, "Informe o usuário"),
        password: z.string().min(1, "Informe a senha"),
      }))
      .mutation(async ({ input, ctx }) => {
        const user = await getUserByUsername(input.username);
        if (!user || !(await verifyPassword(input.password, user.passwordHash))) {
          // Mensagem genérica para não revelar qual campo está errado
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Usuário ou senha inválidos" });
        }
        if (!user.active) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Usuário desativado. Contate o administrador." });
        }
        const sessionToken = await sdk.createSessionToken(user.openId, {
          name: user.name || user.username || "",
          expiresInMs: ONE_YEAR_MS,
        });
        const cookieOptions = getSessionCookieOptions(ctx.req);
        ctx.res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });
        await touchLastSignedIn(user.id);
        const { passwordHash: _ph, ...safe } = user;
        return safe;
      }),

    // "Esqueci minha senha": apenas sinaliza ao administrador (sem e-mail).
    forgotPassword: publicProcedure
      .input(z.object({ username: z.string().min(1, "Informe o usuário") }))
      .mutation(async ({ input }) => {
        await requestPasswordReset(input.username);
        return { success: true } as const;
      }),

    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  // ===== USUÁRIOS (somente admin) =====
  usuarios: router({
    listar: adminProcedure.query(async () => {
      return await listUsers();
    }),

    criar: adminProcedure
      .input(z.object({
        username: z.string().min(1, "Usuário é obrigatório"),
        password: z.string().min(6, "Senha deve ter ao menos 6 caracteres"),
        name: z.string().optional(),
        email: z.string().email("E-mail inválido").optional().or(z.literal("")),
        role: z.enum(["user", "admin"]).default("user"),
      }))
      .mutation(async ({ input }) => {
        try {
          const user = await createLocalUser({
            username: input.username,
            password: input.password,
            name: input.name || input.username,
            email: input.email || null,
            role: input.role,
          });
          if (!user) throw new Error("Falha ao criar usuário");
          const { passwordHash: _ph, ...safe } = user;
          return safe;
        } catch (e) {
          throw new TRPCError({ code: "BAD_REQUEST", message: e instanceof Error ? e.message : "Erro ao criar usuário" });
        }
      }),

    redefinirSenha: adminProcedure
      .input(z.object({
        id: z.number().int().positive(),
        password: z.string().min(6, "Senha deve ter ao menos 6 caracteres"),
      }))
      .mutation(async ({ input }) => {
        await setUserPassword(input.id, input.password);
        return { success: true } as const;
      }),

    atualizar: adminProcedure
      .input(z.object({
        id: z.number().int().positive(),
        name: z.string().optional(),
        email: z.string().email("E-mail inválido").optional().or(z.literal("")),
        role: z.enum(["user", "admin"]).optional(),
        active: z.boolean().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        // Impede que o admin desative/rebaixe a própria conta e fique sem acesso
        if (input.id === ctx.user.id && (input.active === false || input.role === "user")) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Você não pode rebaixar ou desativar a própria conta." });
        }
        await updateUserFields(input.id, {
          name: input.name,
          email: input.email === "" ? null : input.email,
          role: input.role,
          active: input.active,
        });
        return { success: true } as const;
      }),

    excluir: adminProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .mutation(async ({ input, ctx }) => {
        if (input.id === ctx.user.id) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Você não pode excluir a própria conta." });
        }
        await deleteUser(input.id);
        return { success: true } as const;
      }),
  }),

  // ===== CNPJ =====
  cnpj: router({
    buscar: publicProcedure
      .input(z.object({ cnpj: z.string() }))
      .query(async ({ input }) => {
        return await buscarCNPJ(input.cnpj);
      }),
  }),

  // ===== SEFAZ: cadastro de contribuintes do ICMS (certificado A1 da empresa) =====
  sefaz: router({
    certificado: protectedProcedure.query(() => ({ ...statusCertificado(), ufsAtendidas: UFS_ATENDIDAS })),

    // Mutation para não ser agrupada nem reaproveitada do cache: cada consulta vai à SEFAZ
    consultarCadastro: protectedProcedure
      .input(z.object({ cnpj: z.string(), uf: z.string().length(2).default("PE") }))
      .mutation(async ({ input }) => {
        try {
          return await consultarCadastroSefaz(input.cnpj, input.uf);
        } catch (e) {
          if (e instanceof ErroSefaz) {
            const code = e.tipo === "nao_configurado" || e.tipo === "certificado" ? "PRECONDITION_FAILED"
              : e.tipo === "uf" ? "BAD_REQUEST" : "BAD_GATEWAY";
            throw new TRPCError({ code, message: e.message });
          }
          throw e;
        }
      }),
  }),

  // ===== MINHA CONTA: empresas do usuário logado =====
  // Todas as operações usam ctx.user.id: ninguém lê nem altera vínculos de outro usuário.
  conta: router({
    empresas: protectedProcedure.query(({ ctx }) => listarEmpresasDoUsuario(ctx.user.id)),

    vincularEmpresa: protectedProcedure
      .input(z.object({ importadorId: z.number().int().positive() }))
      .mutation(async ({ input, ctx }) => {
        await vincularEmpresa(ctx.user.id, input.importadorId);
        return { success: true } as const;
      }),

    desvincularEmpresa: protectedProcedure
      .input(z.object({ importadorId: z.number().int().positive() }))
      .mutation(async ({ input, ctx }) => {
        await desvincularEmpresa(ctx.user.id, input.importadorId);
        return { success: true } as const;
      }),
  }),

  // ===== IMPORTADORES =====
  importadores: router({
    listar: protectedProcedure.query(async () => {
      return await getImportadores();
    }),

    buscar: protectedProcedure
      .input(z.object({ query: z.string() }))
      .query(async ({ input }) => {
        return await searchImportadores(input.query);
      }),

    salvar: protectedProcedure
      .input(z.object({
        cnpj: z.string(),
        /** Chave de acesso do Portal Único da empresa (opcional; só é gravada se informada). */
        chavePortal: z.object({
          clientId: z.string().trim().min(8, "Client-Id inválido").max(255),
          clientSecret: z.string().trim().min(8, "Client-Secret inválido").max(2000),
        }).optional(),
        razaoSocial: z.string(),
        nomeFantasia: z.string().optional(),
        inscricaoEstadual: z.string().optional(),
        cnae: z.string().optional(),
        endereco: z.string().optional(),
        bairro: z.string().optional(),
        cep: z.string().optional(),
        municipio: z.string().optional(),
        uf: z.string().optional(),
        telefone: z.string().optional(),
        email: z.string().optional(),
        editalDBF: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { chavePortal, ...dados } = input;
        if (chavePortal && !criptografiaDisponivel()) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "O servidor não tem a chave de criptografia configurada (CHAVE_CRIPTOGRAFIA). Nada foi salvo.",
          });
        }
        const existente = await getImportadorByCnpj(dados.cnpj);
        if (chavePortal && existente) await exigirPermissaoChave(ctx.user, existente.id);

        const salvo = await upsertImportador(dados);
        const id = salvo && "id" in salvo && typeof salvo.id === "number" ? salvo.id : undefined;
        // Quem cria o cadastro passa a tê-lo em "minhas empresas" (pode desvincular depois)
        if (id !== undefined && !existente) await vincularEmpresa(ctx.user.id, id);
        if (id !== undefined && chavePortal) {
          await salvarChavePortalEmpresa(id, chavePortal.clientId, cifrar(chavePortal.clientSecret), ctx.user.id);
        }
        return salvo;
      }),

    /** Situação da chave da empresa: só o fim do Client-Id; o Client-Secret nunca sai do servidor. */
    chavePortal: protectedProcedure
      .input(z.object({ importadorId: z.number().int().positive() }))
      .query(async ({ input, ctx }) => {
        const chave = await getChavePortalEmpresa(input.importadorId);
        const podeAlterar = ctx.user.role === "admin" || !chave
          || await usuarioVinculadoAEmpresa(ctx.user.id, input.importadorId);
        return {
          configurada: Boolean(chave),
          clientId: chave ? mascarar(chave.clientId) : null,
          atualizadaEm: chave?.updatedAt ?? null,
          podeAlterar,
          criptografiaDisponivel: criptografiaDisponivel(),
        };
      }),

    removerChavePortal: protectedProcedure
      .input(z.object({ importadorId: z.number().int().positive() }))
      .mutation(async ({ input, ctx }) => {
        await exigirPermissaoChave(ctx.user, input.importadorId);
        await removerChavePortalEmpresa(input.importadorId);
        return { success: true } as const;
      }),

    buscarPorCNPJ: protectedProcedure
      .input(z.object({ cnpj: z.string() }))
      .query(async ({ input }) => {
        return await getImportadorByCnpj(input.cnpj);
      }),

    excluir: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await deleteImportador(input.id);
        return { success: true };
      }),
  }),

  // ===== RECINTOS =====
  recintos: router({
    listar: protectedProcedure
      .input(z.object({ tipo: z.string().optional() }).optional())
      .query(async ({ input }) => {
        await seedRecintos();
        return await getRecintos(input?.tipo);
      }),
  }),

  // ===== IMPORTAÇÃO DE DI =====
  di: router({
    parsearXML: protectedProcedure
      .input(z.object({ xmlContent: z.string() }))
      .mutation(async ({ input }) => {
        return await parseDIXML(input.xmlContent);
      }),
  }),

  // ===== IMPORTAÇÃO DE DUIMP =====
  duimp: router({
    // Parsear o texto do extrato DUIMP (extraído do PDF no navegador)
    parsearPDF: protectedProcedure
      .input(z.object({ texto: z.string() }))
      .mutation(async ({ input }) => {
        try {
          const resultado = parsearDuimpPDF(input.texto);
          return { sucesso: true, dados: resultado };
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          return { sucesso: false, erro: `Erro ao processar PDF: ${msg}`, dados: null };
        }
      }),

    // Consultar DUIMP via API do Portal Único (proxy)
    consultarAPI: protectedProcedure
      .input(z.object({
        numeroDuimp: z.string(),
        versaoDuimp: z.string().default("0"),
        clientId: z.string(),
        clientSecret: z.string(),
      }))
      .mutation(async ({ input }) => {
        try {
          const BASE_URL = "https://portalunico.siscomex.gov.br";

          // Passo 1: Autenticar com clientId + clientSecret
          const authResp = await axios.post(
            `${BASE_URL}/portal/api/autenticar`,
            { clientId: input.clientId, clientSecret: input.clientSecret },
            {
              headers: { "Content-Type": "application/json" },
              timeout: 15000,
            }
          );

          const token = authResp.data?.token || authResp.data?.access_token;
          if (!token) {
            return { sucesso: false, erro: "Autenticação falhou: token não retornado", dados: null };
          }

          // Passo 2: Consultar dados da DUIMP
          const versao = input.versaoDuimp.padStart(4, "0");
          const duimpResp = await axios.get(
            `${BASE_URL}/duimp-api/api/ext/duimp/${input.numeroDuimp}/${versao}`,
            {
              headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
              },
              timeout: 15000,
            }
          );

          const duimpData = duimpResp.data;

          // Mapear campos da API para o formato do formulário GLME
          const dados = mapearDuimpAPIParaGLME(duimpData as Record<string, unknown>);
          return { sucesso: true, dados, dadosBrutos: duimpData };
        } catch (err: unknown) {
          if (axios.isAxiosError(err)) {
            const status = err.response?.status;
            const msg = err.response?.data?.message || err.message;
            if (status === 401 || status === 403) {
              return { sucesso: false, erro: "Credenciais inválidas ou sem permissão de acesso", dados: null };
            }
            if (status === 404) {
              return { sucesso: false, erro: "DUIMP não encontrada. Verifique o número informado.", dados: null };
            }
            return { sucesso: false, erro: `Erro na API: ${msg}`, dados: null };
          }
          const msg = err instanceof Error ? err.message : String(err);
          return { sucesso: false, erro: `Erro de conexão: ${msg}`, dados: null };
        }
      }),
  }),
});

export type AppRouter = typeof appRouter;
