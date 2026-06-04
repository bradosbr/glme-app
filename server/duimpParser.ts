/**
 * Parser do Extrato PDF da DUIMP (Declaração Única de Importação)
 * Suporta o formato real do extrato gerado pelo Portal Único SISCOMEX.
 * NCMs duplicadas são automaticamente consolidadas em uma única adição.
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
  // Adquirente (se diferente do importador)
  adquirenteNome?: string;
  adquirenteCnpj?: string;
  // Recinto
  recintoNome?: string;
  recintoCodigoRaw?: string;
  recintoCodigoFormatado?: string;
  // Valores
  valorAduaneiro?: string;
  valorFOBReais?: string;
  taxaCambio?: string;
  taxaSiscomex?: string;
  // Impostos globais (recolhimento total)
  ii?: string;
  ipi?: string;
  pis?: string;
  cofins?: string;
  impostosTotal?: string;
  // Adições (já consolidadas por NCM)
  adicoes?: DuimpAdicao[];
}

export interface DuimpAdicao {
  numero: string;
  ncm: string;
  descricao: string;
  baseCalculo?: string;
  ii?: string;
  ipi?: string;
  pis?: string;
  cofins?: string;
  icms?: string;
}

function normalizar(texto: string): string {
  return texto.replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/[ \t]+/g, " ").trim();
}

/**
 * Extrai o valor na LINHA SEGUINTE a uma label.
 * Ex: "Nome do importador:\nINTERCOMEX..." → "INTERCOMEX..."
 */
function aposLabel(texto: string, label: string): string | undefined {
  const re = new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*\\n([^\\n]+)", "i");
  const m = texto.match(re);
  return m ? m[1].trim() : undefined;
}

/**
 * Extrai valor monetário: "R$328.870,41" ou "R$ 89.318,78" → "328870.41"
 */
function parseMoeda(s: string): string {
  return s.replace(/\./g, "").replace(",", ".");
}

/**
 * Formata código de recinto de 7 dígitos: "7921302" → "7.92.13.02"
 */
function formatarCodRecinto(raw: string): string {
  if (/^\d{7}$/.test(raw)) {
    return `${raw[0]}.${raw.slice(1, 3)}.${raw.slice(3, 5)}.${raw.slice(5, 7)}`;
  }
  return raw;
}

/**
 * Extrai todos os itens do PDF de extrato DUIMP.
 * Cada item começa com "Extrato da Duimp ... : Item XXXXX"
 */
function extrairItens(texto: string): DuimpAdicao[] {
  const itens: DuimpAdicao[] = [];

  // Split pelo cabeçalho de cada item: "Extrato da Duimp <num> / Versão <v> : Item 00001"
  const partes = texto.split(/Extrato da Duimp[^\n]+:\s*Item\s+(\d{5})/i);
  // partes[0] = cabeçalho geral, partes[1]="00001", partes[2]=conteúdo item 1, ...

  for (let i = 1; i < partes.length; i += 2) {
    const numItem = partes[i].trim();
    const conteudo = partes[i + 1] || "";

    // NCM: linha após "NCM:"
    const ncmMatch = conteudo.match(/NCM:\s*\n([\d.]+)\s*-/);
    if (!ncmMatch) continue;
    const ncm = ncmMatch[1].replace(/\./g, "");

    // Descrição: pegar nome do produto após "Código do produto:\n<num> - <desc>"
    // Remove trailing "..." que indica truncamento
    let descricao = "";
    const prodMatch = conteudo.match(/C[oó]digo do produto:\s*\n\d+\s*-\s*([^\n]+)/i);
    if (prodMatch) {
      descricao = prodMatch[1].replace(/\.\.\.$/, "").replace(/\.\.\.\s*$/, "").trim();
    }

    itens.push({ numero: numItem.replace(/^0+/, "") || String(Math.ceil(i / 2)), ncm, descricao });
  }

  return itens;
}

/**
 * Consolida itens com a mesma NCM em uma única adição, renumerando sequencialmente.
 * Descrições são concatenadas com " / " quando diferentes.
 */
function consolidarPorNCM(itens: DuimpAdicao[]): DuimpAdicao[] {
  const mapa = new Map<string, DuimpAdicao>();
  let seq = 1;

  for (const item of itens) {
    if (mapa.has(item.ncm)) {
      const existente = mapa.get(item.ncm)!;
      if (item.descricao && item.descricao !== existente.descricao && !existente.descricao.includes(item.descricao)) {
        existente.descricao += ` / ${item.descricao}`;
      }
    } else {
      mapa.set(item.ncm, { ...item, numero: String(seq++) });
    }
  }

  return Array.from(mapa.values());
}

/**
 * Função principal: parseia o texto extraído do PDF do Extrato DUIMP.
 */
export function parsearDuimpPDF(textoPDF: string): DuimpParsedData {
  const texto = normalizar(textoPDF);
  const r: DuimpParsedData = {};

  // === NÚMERO E VERSÃO DA DUIMP ===
  // Título: "Extrato da Duimp 26BR0000680227-4 / Versão 0001"
  const cabecalho = texto.match(/Extrato\s+da\s+Duimp\s+(\d{2}BR[\d]+-\d)\s*\/\s*Vers[aã]o\s+(\d+)/i);
  if (cabecalho) {
    r.numeroDuimp = cabecalho[1].toUpperCase();
    r.versaoDuimp = String(parseInt(cabecalho[2], 10)); // remove zeros à esquerda
  } else {
    const numM = texto.match(/(\d{2}BR\d{9,11}-\d)/i);
    if (numM) r.numeroDuimp = numM[1].toUpperCase();
    const verM = texto.match(/Vers[aã]o\s+(\d+)/i);
    if (verM) r.versaoDuimp = String(parseInt(verM[1], 10));
  }

  // === IMPORTADOR ===
  // Campos com valor na linha seguinte ao label
  r.importadorCnpj = aposLabel(texto, "CNPJ do importador:");
  r.importadorNome = aposLabel(texto, "Nome do importador:");

  // Endereço: "LOGRADOURO, NUM COMPLEMENTO - CIDADE - CEP - UF"
  const endRaw = aposLabel(texto, "Endereço do importador:");
  if (endRaw) {
    const partes = endRaw.split(" - ");
    if (partes.length >= 3) {
      r.importadorUf = partes[partes.length - 1].trim();
      const cepRaw = partes[partes.length - 2].trim();
      r.importadorCep = cepRaw.replace(/\D/g, "");
      r.importadorMunicipio = partes[partes.length - 3].trim();
      r.importadorEndereco = partes.slice(0, partes.length - 3).join(" - ").trim();
    } else {
      r.importadorEndereco = endRaw;
    }
  }

  // === RECINTO ===
  // "Recinto:\n7921302 - ICTSI RIO BRASIL TERMINAL 1 SA"
  const recintoM = texto.match(/Recinto:\s*\n(\d{7})\s*-\s*([^\n]+)/i);
  if (recintoM) {
    r.recintoCodigoRaw = recintoM[1].trim();
    r.recintoNome = recintoM[2].trim();
    r.recintoCodigoFormatado = formatarCodRecinto(r.recintoCodigoRaw);
  }

  // === VALORES ===
  // "VALOR ADUANEIRO: R$328.870,41"
  const vaM = texto.match(/VALOR ADUANEIRO:\s*R\$\s*([\d.,]+)/i);
  if (vaM) r.valorAduaneiro = parseMoeda(vaM[1]);

  // "VALOR FOB: R$315.327,26"
  const fobM = texto.match(/VALOR FOB:\s*R\$\s*([\d.,]+)/i);
  if (fobM) r.valorFOBReais = parseMoeda(fobM[1]);

  // "TAXA DOLAR: R$5,0160"
  const taxaM = texto.match(/TAXA DOLAR:\s*R\$\s*([\d.,]+)/i);
  if (taxaM) r.taxaCambio = taxaM[1].replace(",", ".");

  // === RECOLHIMENTO (impostos globais) ===
  // Bloco: "RECOLHIMENTO\nII: R$ 89.318,78\nIPI: R$ 21.734,34\n..."
  const recolhM = texto.match(/RECOLHIMENTO\s*\n([\s\S]*?)(?=Carga\s+Valor\s+Atual|Unidade\s+de\s+despacho|$)/i);
  if (recolhM) {
    const bloco = recolhM[1];
    const iiM = bloco.match(/^II:\s*R\$\s*([\d.,]+)/im);
    if (iiM) r.ii = parseMoeda(iiM[1]);
    const ipiM = bloco.match(/^IPI:\s*R\$\s*([\d.,]+)/im);
    if (ipiM) r.ipi = parseMoeda(ipiM[1]);
    const pisM = bloco.match(/^PIS:\s*R\$\s*([\d.,]+)/im);
    if (pisM) r.pis = parseMoeda(pisM[1]);
    const cofinsM = bloco.match(/^COFINS:\s*R\$\s*([\d.,]+)/im);
    if (cofinsM) r.cofins = parseMoeda(cofinsM[1]);
    const sisM = bloco.match(/TAXA SISCOMEX:\s*R\$\s*([\d.,]+)/im);
    if (sisM) r.taxaSiscomex = parseMoeda(sisM[1]);
  }

  // Total dos impostos = II + IPI + PIS + COFINS + TAXA SISCOMEX
  const totalImpostos =
    parseFloat(r.ii || "0") +
    parseFloat(r.ipi || "0") +
    parseFloat(r.pis || "0") +
    parseFloat(r.cofins || "0") +
    parseFloat(r.taxaSiscomex || "0");
  if (totalImpostos > 0) r.impostosTotal = totalImpostos.toFixed(2);

  // === ADIÇÕES (itens consolidados por NCM) ===
  const itens = extrairItens(texto);
  r.adicoes = consolidarPorNCM(itens);

  return r;
}
