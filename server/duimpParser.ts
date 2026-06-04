/**
 * Parser do Extrato PDF da DUIMP (Declaração Única de Importação)
 * Extrai os campos relevantes para o formulário GLME a partir do texto do PDF.
 */

export interface DuimpParsedData {
  numeroDuimp?: string;
  versaoDuimp?: string;
  // Importador
  importadorNome?: string;
  importadorCnpj?: string;
  importadorEndereco?: string;
  importadorBairro?: string;
  importadorCep?: string;
  importadorMunicipio?: string;
  importadorUf?: string;
  // Adquirente
  adquirenteNome?: string;
  adquirenteCnpj?: string;
  // Dados gerais
  dataRegistro?: string;
  recintoAduaneiro?: string;
  viaTransporte?: string;
  // Valores gerais
  valorFOBDolar?: string;
  valorFOBReais?: string;
  taxaCambio?: string;
  valorAduaneiro?: string;
  taxaSiscomex?: string;
  // Adições/Itens
  adicoes?: DuimpAdicao[];
}

export interface DuimpAdicao {
  numero?: string;
  ncm?: string;
  descricao?: string;
  quantidade?: string;
  valorFOB?: string;
  baseCalculo?: string;
  ii?: string;
  ipi?: string;
  pis?: string;
  cofins?: string;
  icms?: string;
}

/**
 * Normaliza o texto do PDF para facilitar a extração de campos.
 */
function normalizarTexto(texto: string): string {
  return texto
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .trim();
}

/**
 * Extrai um valor após uma label no texto, com suporte a múltiplos formatos.
 */
function extrairApos(texto: string, label: string, maxChars = 100): string | undefined {
  const idx = texto.indexOf(label);
  if (idx === -1) return undefined;
  const resto = texto.substring(idx + label.length).trim();
  const linhaFim = resto.indexOf("\n");
  const valor = linhaFim === -1 ? resto.substring(0, maxChars) : resto.substring(0, linhaFim);
  return valor.trim() || undefined;
}

/**
 * Extrai o número da DUIMP do texto (formato: YYBRXXXXXXXXX-D)
 */
function extrairNumeroDuimp(texto: string): string | undefined {
  const match = texto.match(/(\d{2}BR\d{9,11}-\d)/i);
  return match ? match[1].toUpperCase() : undefined;
}

/**
 * Extrai a versão da DUIMP do texto
 */
function extrairVersao(texto: string): string | undefined {
  const match = texto.match(/[Vv]ers[aã]o[:\s]+(\d+)/i) ||
                texto.match(/VERS[ÃA]O[:\s]+(\d+)/i) ||
                texto.match(/vers[aã]o\s+(\d{4})/i);
  return match ? match[1] : undefined;
}

/**
 * Extrai CNPJ do texto (formato: XX.XXX.XXX/XXXX-XX)
 */
function extrairCnpj(texto: string): string | undefined {
  const match = texto.match(/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/);
  return match ? match[0] : undefined;
}

/**
 * Extrai valor monetário em reais (R$ X.XXX,XX ou apenas X.XXX,XX)
 */
function extrairValorReais(texto: string, label: string): string | undefined {
  const idx = texto.indexOf(label);
  if (idx === -1) return undefined;
  const resto = texto.substring(idx + label.length, idx + label.length + 100);
  const match = resto.match(/R?\$?\s*([\d.,]+)/);
  return match ? match[1].replace(/\./g, "").replace(",", ".") : undefined;
}

/**
 * Extrai adições/itens do texto do extrato DUIMP.
 * O extrato simplificado pode ter formato variado dependendo da versão.
 */
function extrairAdicoes(texto: string): DuimpAdicao[] {
  const adicoes: DuimpAdicao[] = [];

  // Padrão 1: Seções marcadas com "ADC." ou "ADC.XX" ou "Item XX"
  const padraoAdc = /ADC\.?\s*(\d+)\s*\n([\s\S]*?)(?=ADC\.?\s*\d+\s*\n|$)/gi;
  let match;
  while ((match = padraoAdc.exec(texto)) !== null) {
    const numAdicao = match[1];
    const blocoAdicao = match[2];
    const adicao = parsearBlocoAdicao(numAdicao, blocoAdicao);
    if (adicao.ncm || adicao.baseCalculo) {
      adicoes.push(adicao);
    }
  }

  // Se não encontrou pelo padrão ADC, tenta padrão "Item" ou "Adição"
  if (adicoes.length === 0) {
    const padraoItem = /(?:Item|Adi[çc][aã]o)[:\s]+(\d+)\s*\n([\s\S]*?)(?=(?:Item|Adi[çc][aã]o)[:\s]+\d+\s*\n|$)/gi;
    while ((match = padraoItem.exec(texto)) !== null) {
      const numAdicao = match[1];
      const blocoAdicao = match[2];
      const adicao = parsearBlocoAdicao(numAdicao, blocoAdicao);
      if (adicao.ncm || adicao.baseCalculo) {
        adicoes.push(adicao);
      }
    }
  }

  return adicoes;
}

/**
 * Parseia um bloco de texto de uma adição individual.
 */
function parsearBlocoAdicao(numero: string, bloco: string): DuimpAdicao {
  const adicao: DuimpAdicao = { numero };

  // NCM: formato XXXXXXXX (8 dígitos)
  const ncmMatch = bloco.match(/NCM[:\s]+(\d{8})/i) ||
                   bloco.match(/\b(\d{4}\.\d{2}\.\d{2})\b/) ||
                   bloco.match(/\bNCM\s*:?\s*(\d{8})\b/i);
  if (ncmMatch) adicao.ncm = ncmMatch[1].replace(/\./g, "");

  // Descrição
  const descMatch = bloco.match(/(?:Descri[çc][aã]o|Description)[:\s]+([^\n]+)/i);
  if (descMatch) adicao.descricao = descMatch[1].trim();

  // Quantidade
  const qtdMatch = bloco.match(/(?:Quantidade|Qtd)[:\s]+([\d.,]+)/i);
  if (qtdMatch) adicao.quantidade = qtdMatch[1];

  // FOB da adição
  const fobMatch = bloco.match(/FOB[:\s]+R?\$?\s*([\d.,]+)/i);
  if (fobMatch) adicao.valorFOB = fobMatch[1].replace(/\./g, "").replace(",", ".");

  // Base de cálculo
  const bcMatch = bloco.match(/B\.\s*CALC\s*[:\s]+([\d.,]+)/i) ||
                  bloco.match(/Base\s+de\s+C[áa]lculo[:\s]+R?\$?\s*([\d.,]+)/i) ||
                  bloco.match(/B\.\s*CALC\.\s*II[:\s]+R?\$?\s*([\d.,]+)/i);
  if (bcMatch) adicao.baseCalculo = bcMatch[1].replace(/\./g, "").replace(",", ".");

  // II (Imposto de Importação)
  const iiMatch = bloco.match(/I\.?\s*I\.?[:\s]+R?\$?\s*([\d.,]+)/i) ||
                  bloco.match(/Imposto\s+de\s+Importa[çc][aã]o[:\s]+R?\$?\s*([\d.,]+)/i);
  if (iiMatch) adicao.ii = iiMatch[1].replace(/\./g, "").replace(",", ".");

  // IPI
  const ipiMatch = bloco.match(/I\.?\s*P\.?\s*I\.?[:\s]+R?\$?\s*([\d.,]+)/i);
  if (ipiMatch) adicao.ipi = ipiMatch[1].replace(/\./g, "").replace(",", ".");

  // PIS/PASEP
  const pisMatch = bloco.match(/PIS[/\s]?PASEP[:\s]+R?\$?\s*([\d.,]+)/i) ||
                   bloco.match(/PIS[:\s]+R?\$?\s*([\d.,]+)/i);
  if (pisMatch) adicao.pis = pisMatch[1].replace(/\./g, "").replace(",", ".");

  // COFINS
  const cofinsMatch = bloco.match(/COFINS[:\s]+R?\$?\s*([\d.,]+)/i);
  if (cofinsMatch) adicao.cofins = cofinsMatch[1].replace(/\./g, "").replace(",", ".");

  // ICMS
  const icmsMatch = bloco.match(/ICMS[:\s]+R?\$?\s*([\d.,]+)/i);
  if (icmsMatch) adicao.icms = icmsMatch[1].replace(/\./g, "").replace(",", ".");

  return adicao;
}

/**
 * Função principal: parseia o texto extraído do PDF da DUIMP.
 */
export function parsearDuimpPDF(textoPDF: string): DuimpParsedData {
  const texto = normalizarTexto(textoPDF);
  const resultado: DuimpParsedData = {};

  // Número e versão da DUIMP
  resultado.numeroDuimp = extrairNumeroDuimp(texto);
  resultado.versaoDuimp = extrairVersao(texto);

  // Importador
  const importadorIdx = texto.search(/IMPORTADOR|DECLARANTE/i);
  if (importadorIdx !== -1) {
    const blocoImportador = texto.substring(importadorIdx, importadorIdx + 500);
    resultado.importadorCnpj = extrairCnpj(blocoImportador);

    // Nome do importador (linha após "IMPORTADOR" ou "DECLARANTE")
    const nomeMatch = blocoImportador.match(/(?:IMPORTADOR|DECLARANTE)[:\s]*\n([^\n]+)/i);
    if (nomeMatch) resultado.importadorNome = nomeMatch[1].trim();

    // Endereço
    const endMatch = blocoImportador.match(/(?:Endere[çc]o|Logradouro)[:\s]+([^\n]+)/i);
    if (endMatch) resultado.importadorEndereco = endMatch[1].trim();

    // Bairro
    const bairroMatch = blocoImportador.match(/Bairro[:\s]+([^\n]+)/i);
    if (bairroMatch) resultado.importadorBairro = bairroMatch[1].trim();

    // CEP
    const cepMatch = blocoImportador.match(/CEP[:\s]+([\d.-]+)/i);
    if (cepMatch) resultado.importadorCep = cepMatch[1].trim();

    // Município e UF
    const munMatch = blocoImportador.match(/Munic[íi]pio[:\s]+([^\n/]+)/i);
    if (munMatch) resultado.importadorMunicipio = munMatch[1].trim();

    const ufMatch = blocoImportador.match(/UF[:\s]+([A-Z]{2})/i);
    if (ufMatch) resultado.importadorUf = ufMatch[1].trim();
  }

  // Adquirente (se diferente do importador)
  const adqIdx = texto.search(/ADQUIRENTE/i);
  if (adqIdx !== -1) {
    const blocoAdq = texto.substring(adqIdx, adqIdx + 300);
    resultado.adquirenteCnpj = extrairCnpj(blocoAdq);
    const nomeAdqMatch = blocoAdq.match(/ADQUIRENTE[:\s]*\n([^\n]+)/i);
    if (nomeAdqMatch) resultado.adquirenteNome = nomeAdqMatch[1].trim();
  }

  // Data de registro
  const dataMatch = texto.match(/(?:Data\s+de\s+Registro|Registro)[:\s]+(\d{2}\/\d{2}\/\d{4})/i);
  if (dataMatch) resultado.dataRegistro = dataMatch[1];

  // Recinto aduaneiro
  const recintoMatch = texto.match(/RECINTO[:\s]+([^\n]+)/i);
  if (recintoMatch) resultado.recintoAduaneiro = recintoMatch[1].trim();

  // Via de transporte
  const viaMatch = texto.match(/(?:Via\s+de\s+Transporte|VIA)[:\s]+([^\n]+)/i);
  if (viaMatch) resultado.viaTransporte = viaMatch[1].trim();

  // Valores globais
  // FOB em USD
  const fobUsdMatch = texto.match(/(?:TOTAL\s+)?FOB[:\s]+(?:US\$|USD)?\s*([\d.,]+)\s*USD/i) ||
                      texto.match(/FOB[:\s]+([\d.,]+)\s*USD/i);
  if (fobUsdMatch) resultado.valorFOBDolar = fobUsdMatch[1].replace(/\./g, "").replace(",", ".");

  // FOB em BRL
  const fobBrlMatch = texto.match(/(?:TOTAL\s+)?FOB[:\s]+R\$\s*([\d.,]+)/i);
  if (fobBrlMatch) resultado.valorFOBReais = fobBrlMatch[1].replace(/\./g, "").replace(",", ".");

  // Taxa de câmbio
  const taxaMatch = texto.match(/TAXA[:\s]+([\d.,]+)/i) ||
                    texto.match(/C[aâ]mbio[:\s]+([\d.,]+)/i);
  if (taxaMatch) resultado.taxaCambio = taxaMatch[1].replace(",", ".");

  // Valor aduaneiro total
  const vaMatch = texto.match(/VALOR\s+ADUANEIRO[:\s]+R?\$?\s*([\d.,]+)/i) ||
                  texto.match(/VA[:\s]+R?\$?\s*([\d.,]+)/i);
  if (vaMatch) resultado.valorAduaneiro = vaMatch[1].replace(/\./g, "").replace(",", ".");

  // Taxa SISCOMEX
  const siscomexMatch = texto.match(/TAXA\s+(?:DE\s+)?(?:UTILIZA[ÇC][ÃA]O\s+DO\s+)?SISCOMEX[:\s]+R?\$?\s*([\d.,]+)/i) ||
                        texto.match(/TAXA\s+SISCOMEX[:\s]+R?\$?\s*([\d.,]+)/i);
  if (siscomexMatch) resultado.taxaSiscomex = siscomexMatch[1].replace(/\./g, "").replace(",", ".");

  // Adições/Itens
  resultado.adicoes = extrairAdicoes(texto);

  return resultado;
}
