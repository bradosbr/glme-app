/**
 * Parser do Extrato PDF da DUIMP (Declaração Única de Importação)
 *
 * Suporta todos os formatos gerados pelo Portal Único SISCOMEX:
 *  - "Extrato Original" : Extrato da Duimp ... / Versão X  (multi-páginas com itens, bloco RECOLHIMENTO)
 *  - "Extrato Simples"  : Extrato da Duimp ... / Versão X  (2 páginas, sem itens, recinto com ●)
 *  - "Extrato Completo" : Extrato DUIMP: ... / Versão X    (itens separados por "Item N\n", contém débitos ao final)
 *  - "Débitos"          : Demonstrativo dos Débitos da Duimp (apenas tabela de impostos e data)
 *
 * NCMs duplicadas são consolidadas automaticamente em uma única adição.
 */

export interface DuimpParsedData {
  numeroDuimp?: string;
  versaoDuimp?: string;
  dataRegistro?: string;          // DD/MM/YYYY
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
  // Recinto
  recintoNome?: string;
  recintoCodigoRaw?: string;
  recintoCodigoFormatado?: string;
  // Valores financeiros
  valorAduaneiro?: string;
  valorFOBReais?: string;
  valorFOBDolar?: string;
  valorFreteReais?: string;
  taxaCambio?: string;
  // Impostos globais (soma do recolhimento)
  ii?: string;
  ipi?: string;
  pis?: string;
  cofins?: string;
  taxaSiscomex?: string;
  impostosTotal?: string;
  // Adições consolidadas por NCM
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

type FormatoDocumento = "extrato_original" | "extrato_completo" | "extrato_simples" | "debitos";

// ---------------------------------------------------------------------------
// Utilitários
// ---------------------------------------------------------------------------

function normalizar(texto: string): string {
  return texto.replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/[ \t]+/g, " ").trim();
}

function parseMoeda(s: string): string {
  return s.replace(/\./g, "").replace(",", ".");
}

function formatarCodRecinto(raw: string): string {
  if (/^\d{7}$/.test(raw)) {
    return `${raw[0]}.${raw.slice(1, 3)}.${raw.slice(3, 5)}.${raw.slice(5, 7)}`;
  }
  return raw;
}

// ---------------------------------------------------------------------------
// Detecção de formato
// ---------------------------------------------------------------------------

function detectarFormato(texto: string): FormatoDocumento {
  // Extrato Completo verificado ANTES de Débitos — ele inclui a seção de débitos ao final
  if (/Extrato DUIMP:/i.test(texto)) return "extrato_completo";
  // Débitos puro: sem extrato de itens
  if (/Demonstrativo dos D[eé]bitos da Duimp/i.test(texto)) return "debitos";
  // Extrato Original: tem separadores "Extrato da Duimp...: Item NNNNN"
  if (/Extrato da Duimp[^\n]+:\s*Item\s+\d+/i.test(texto)) return "extrato_original";
  return "extrato_simples";
}

// ---------------------------------------------------------------------------
// Extração de campos genéricos
// ---------------------------------------------------------------------------

/**
 * Extrai valor na linha seguinte ao label, suportando campos que quebram em 2 linhas.
 * Para quando o valor continua na linha seguinte (ex: nome e endereço do importador).
 */
function extrairMultiLinha(texto: string, label: string, maxLinhas = 2): string | undefined {
  const idx = texto.indexOf(label);
  if (idx === -1) return undefined;

  const depois = texto.substring(idx + label.length).replace(/^[\s:●]*/, "");
  const linhas = depois.split("\n").map(l => l.trim()).filter(l => l);

  // Labels que indicam início de novo campo — parar ao encontrá-los
  // Inclui "Infomações" (typo no PDF do Extrato Completo) além de "Informações"
  const novoLabel = /^(CNPJ |Nome |Tipo |Endereço|Bairro|Informa[çc][oõ]es|Infoma[çc][oõ]es|Dados |Carga|Identificação|Situação|Unidade|Recinto|País|Peso|Embalagem|Histórico|Controle|Data\/hora|Item\s+\d|Código|NCM:|Versão:|Fabricante|Tributação|Tributo|Atributos|Extrato)/i;

  const partes: string[] = [];
  for (const linha of linhas) {
    if (novoLabel.test(linha)) break;
    partes.push(linha);
    if (partes.length >= maxLinhas) break;
  }
  return partes.join(" ").trim() || undefined;
}

/**
 * Extrai e decompoẽ o endereço no formato "LOGRADOURO - CIDADE - CEP - UF".
 * Suporta endereços que quebram em 2 linhas (ex: "... - RECIFE -\n52010075 - PE").
 */
function extrairEndereco(texto: string): { endereco?: string; municipio?: string; cep?: string; uf?: string } {
  const raw = extrairMultiLinha(texto, "Endereço do importador:", 3);
  if (!raw) return {};

  // Remove " -" no final se o endereço estava quebrado entre linhas
  const endCompleto = raw.replace(/\s*-\s*$/, "").trim();
  const partes = endCompleto.split(/\s+-\s+/);

  if (partes.length >= 3) {
    const uf = partes[partes.length - 1].trim();
    const cepRaw = partes[partes.length - 2].trim();
    const municipio = partes[partes.length - 3].trim();
    const endereco = partes.slice(0, partes.length - 3).join(" - ").trim();
    return {
      endereco: endereco || undefined,
      municipio: municipio || undefined,
      cep: cepRaw.replace(/\D/g, "") || undefined,
      uf: /^[A-Z]{2}$/.test(uf) ? uf : undefined,
    };
  }
  return { endereco: endCompleto };
}

/**
 * Extrai o recinto alfandegado (código 7 dígitos + nome).
 * Suporta "Recinto: ●\n7921302 - NOME" e "Recinto:\n7921302 - NOME".
 */
function extrairRecinto(texto: string): { nome?: string; codigoRaw?: string } {
  // Recinto seguido por qualquer char não-dígito opcional (bullet, espaço) e valor na próxima linha
  const m = texto.match(/Recinto[^:\n]*:[^\n]*\n\s*(\d{7})\s*-\s*([^\n]+)/i);
  if (m) return { codigoRaw: m[1].trim(), nome: m[2].trim() };
  // Fallback: recinto na mesma linha
  const m2 = texto.match(/Recinto[^:\n]*:\s*(\d{7})\s*-\s*([^\n]+)/i);
  if (m2) return { codigoRaw: m2[1].trim(), nome: m2[2].trim() };
  return {};
}

// ---------------------------------------------------------------------------
// Extração de impostos
// ---------------------------------------------------------------------------

/**
 * Bloco RECOLHIMENTO do Extrato Original:
 * "RECOLHIMENTO\nII: R$ X\nIPI: R$ X\n..."
 */
function impostosDoRecolhimento(texto: string): Partial<DuimpParsedData> {
  const m = texto.match(/RECOLHIMENTO\s*\n([\s\S]*?)(?=Carga|Unidade de despacho|$)/i);
  if (!m) return {};
  const b = m[1];
  const r: Partial<DuimpParsedData> = {};
  const iiM = b.match(/^II:\s*R\$\s*([\d.,]+)/im);
  if (iiM) r.ii = parseMoeda(iiM[1]);
  const ipiM = b.match(/^IPI:\s*R\$\s*([\d.,]+)/im);
  if (ipiM) r.ipi = parseMoeda(ipiM[1]);
  const pisM = b.match(/^PIS:\s*R\$\s*([\d.,]+)/im);
  if (pisM) r.pis = parseMoeda(pisM[1]);
  const cofM = b.match(/^COFINS:\s*R\$\s*([\d.,]+)/im);
  if (cofM) r.cofins = parseMoeda(cofM[1]);
  const sisM = b.match(/TAXA SISCOMEX:\s*R\$\s*([\d.,]+)/im);
  if (sisM) r.taxaSiscomex = parseMoeda(sisM[1]);
  return r;
}

/**
 * Tabela de Débitos (Demonstrativo ou seção final do Extrato Completo):
 * "II R$ 22.038,90 R$ ..."
 * "Taxa de Utilização R$ 462,72 ..."
 */
function impostosDosDébitos(texto: string): Partial<DuimpParsedData> {
  const r: Partial<DuimpParsedData> = {};
  const iiM = texto.match(/^II\s+R\$\s*([\d.,]+)/im);
  if (iiM) r.ii = parseMoeda(iiM[1]);
  const ipiM = texto.match(/^IPI\s+R\$\s*([\d.,]+)/im);
  if (ipiM) r.ipi = parseMoeda(ipiM[1]);
  const pisM = texto.match(/^PIS\s+R\$\s*([\d.,]+)/im);
  if (pisM) r.pis = parseMoeda(pisM[1]);
  const cofM = texto.match(/^Cofins\s+R\$\s*([\d.,]+)/im);
  if (cofM) r.cofins = parseMoeda(cofM[1]);
  const sisM = texto.match(/Taxa de Utiliza[çc][ãa]o\s+R\$\s*([\d.,]+)/im);
  if (sisM) r.taxaSiscomex = parseMoeda(sisM[1]);
  return r;
}

// ---------------------------------------------------------------------------
// Extração de itens / adições
// ---------------------------------------------------------------------------

/**
 * Extrato Original: items separados por "Extrato da Duimp ... : Item NNNNN"
 */
function itensDoExtratoOriginal(texto: string): DuimpAdicao[] {
  const lista: DuimpAdicao[] = [];
  const partes = texto.split(/Extrato da Duimp[^\n]+:\s*Item\s+(\d{5})/i);
  for (let i = 1; i < partes.length; i += 2) {
    const num = partes[i].trim();
    const bloco = partes[i + 1] || "";
    const ncmM = bloco.match(/NCM:\s*\n([\d.]+)\s*-/);
    if (!ncmM) continue;
    const ncm = ncmM[1].replace(/\./g, "");
    let desc = "";
    const dM = bloco.match(/C[oó]digo do produto:\s*\n\d+\s*-\s*([^\n]+)/i);
    if (dM) desc = dM[1].replace(/\.{3,}$/, "").trim();
    lista.push({ numero: num.replace(/^0+/, "") || String(Math.ceil(i / 2)), ncm, descricao: desc });
  }
  return lista;
}

/**
 * Extrato Completo: items separados por "Item N\n" simples.
 */
function itensDoExtratoCompleto(texto: string): DuimpAdicao[] {
  const lista: DuimpAdicao[] = [];
  // Usar \s* para tolerar espaços residuais antes do \n (artefatos do PDF)
  const partes = texto.split(/\nItem\s+(\d+)\s*\n/);
  for (let i = 1; i < partes.length; i += 2) {
    const num = partes[i].trim();
    const bloco = partes[i + 1] || "";
    const ncmM = bloco.match(/NCM:\s*\n([\d.]+)\s*-/);
    if (!ncmM) continue;
    const ncm = ncmM[1].replace(/\./g, "");
    let desc = "";
    // Preferir "Código do Produto:\nN - <nome>" — pode quebrar em 2 linhas
    const dM = bloco.match(/C[oó]digo do Produto:\s*\n\d+\s*-\s*([^\n]+)/i);
    if (dM) desc = dM[1].replace(/\.{3,}$/, "").trim();
    lista.push({ numero: num, ncm, descricao: desc });
  }
  return lista;
}

/**
 * Consolida NCMs duplicadas em uma única adição, renumerando sequencialmente.
 * Descrições de NCMs repetidas são unidas com " / ".
 */
function consolidarPorNCM(lista: DuimpAdicao[]): DuimpAdicao[] {
  const mapa = new Map<string, DuimpAdicao>();
  let seq = 1;
  for (const item of lista) {
    if (mapa.has(item.ncm)) {
      const ex = mapa.get(item.ncm)!;
      if (item.descricao && !ex.descricao.includes(item.descricao)) {
        ex.descricao += ` / ${item.descricao}`;
      }
    } else {
      mapa.set(item.ncm, { ...item, numero: String(seq++) });
    }
  }
  return Array.from(mapa.values());
}

// ---------------------------------------------------------------------------
// Função principal
// ---------------------------------------------------------------------------

export function parsearDuimpPDF(textoPDF: string): DuimpParsedData {
  const texto = normalizar(textoPDF);
  const formato = detectarFormato(texto);
  const r: DuimpParsedData = {};

  // === NÚMERO E VERSÃO ===
  // Débitos:          "Duimp: 26BR... Versão: 0001"
  // Extrato Completo: "Extrato DUIMP: 26BR... / Versão 0001"
  // Extrato Orig/Sim: "Extrato da Duimp 26BR... / Versão 0001"
  const numM =
    texto.match(/Duimp:\s*(\d{2}BR[\d]+-\d)\s+Vers[aã]o:\s*(\d+)/i) ||
    texto.match(/Extrato DUIMP:\s*(\d{2}BR[\d]+-\d)\s*\/\s*Vers[aã]o\s+(\d+)/i) ||
    texto.match(/Extrato da Duimp\s+(\d{2}BR[\d]+-\d)\s*\/\s*Vers[aã]o\s+(\d+)/i);
  if (numM) {
    r.numeroDuimp = numM[1].toUpperCase();
    r.versaoDuimp = String(parseInt(numM[2], 10));
  }

  // === DATA DE REGISTRO ===
  // Débitos/Completo: "Data de Registro: 03/06/2026"
  const drM = texto.match(/Data de Registro:\s*(\d{2}\/\d{2}\/\d{4})/i);
  if (drM) {
    r.dataRegistro = drM[1];
  } else {
    // Histórico do Extrato: "03/06/2026,\n17:15\nDeclaração registrada"
    const dhM = texto.match(/(\d{2}\/\d{2}\/\d{4})[,\s]*\n[\d:]+\s*\n\s*Declara[çc][ãa]o registrada/i);
    if (dhM) r.dataRegistro = dhM[1];
  }

  // === IMPORTADOR ===
  r.importadorCnpj = extrairMultiLinha(texto, "CNPJ do importador:", 1);
  r.importadorNome = extrairMultiLinha(texto, "Nome do importador:", 2);

  const end = extrairEndereco(texto);
  r.importadorEndereco = end.endereco;
  r.importadorMunicipio = end.municipio;
  r.importadorCep = end.cep;
  r.importadorUf = end.uf;

  // === RECINTO ===
  const rec = extrairRecinto(texto);
  r.recintoCodigoRaw = rec.codigoRaw;
  r.recintoNome = rec.nome;
  if (r.recintoCodigoRaw) r.recintoCodigoFormatado = formatarCodRecinto(r.recintoCodigoRaw);

  // === VALOR ADUANEIRO (CIF) ===
  // "VALOR ADUANEIRO: R$328.870,41" ou "VALOR ADUANEIRO: R$ 135.255,74"
  const vaM = texto.match(/VALOR ADUANEIRO[:\s]*R\$\s*([\d.,]+)/i);
  if (vaM) r.valorAduaneiro = parseMoeda(vaM[1]);

  // === FOB / FRETE ===
  // Extrato Simples/Completo: "MERCADORIA: US$ X R$ Y"
  const mercM = texto.match(/MERCADORIA[:\s]*US\$\s*([\d.,]+)\s+R\$\s*([\d.,]+)/i);
  if (mercM) { r.valorFOBDolar = parseMoeda(mercM[1]); r.valorFOBReais = parseMoeda(mercM[2]); }
  // Extrato Original: "VALOR FOB: R$X"
  if (!r.valorFOBReais) {
    const fobM = texto.match(/VALOR FOB[:\s]*R\$\s*([\d.,]+)/i);
    if (fobM) r.valorFOBReais = parseMoeda(fobM[1]);
  }
  // Frete: "FRETE: US$ X R$ Y" ou "VALOR FRETE: R$X"
  const freteM = texto.match(/^FRETE[:\s]*US\$\s*[\d.,]+\s+R\$\s*([\d.,]+)/im) ||
                 texto.match(/VALOR FRETE[:\s]*R\$\s*([\d.,]+)/i);
  if (freteM) r.valorFreteReais = parseMoeda(freteM[1]);

  // === TAXA DE CÂMBIO ===
  // "TAXA DOLAR: R$5,0160" ou "US$: 5,016 DE 03/06/2026"
  const tcM = texto.match(/TAXA DOLAR[:\s]*R\$\s*([\d.,]+)/i) ||
              texto.match(/US\$:\s*([\d.,]+)\s+DE\s+\d/i);
  if (tcM) r.taxaCambio = tcM[1].replace(",", ".");

  // === IMPOSTOS ===
  let imp: Partial<DuimpParsedData> = {};
  if (formato === "extrato_original") {
    imp = impostosDoRecolhimento(texto);
  } else {
    // Extrato Completo, Simples e Débitos: tentar tabela de débitos
    imp = impostosDosDébitos(texto);
    // Fallback para bloco RECOLHIMENTO (se existir no texto)
    if (!imp.ii) imp = impostosDoRecolhimento(texto);
  }
  Object.assign(r, imp);

  const totalImp =
    parseFloat(r.ii || "0") + parseFloat(r.ipi || "0") +
    parseFloat(r.pis || "0") + parseFloat(r.cofins || "0") +
    parseFloat(r.taxaSiscomex || "0");
  if (totalImp > 0) r.impostosTotal = totalImp.toFixed(2);

  // === ADIÇÕES / ITENS ===
  if (formato === "extrato_original") {
    r.adicoes = consolidarPorNCM(itensDoExtratoOriginal(texto));
  } else if (formato === "extrato_completo") {
    r.adicoes = consolidarPorNCM(itensDoExtratoCompleto(texto));
  }
  // Extrato Simples e Débitos: sem itens

  return r;
}
