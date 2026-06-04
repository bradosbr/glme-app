import jsPDF from "jspdf";

export interface GLMEFormData {
  secretariaUF: string;
  importador: {
    nome: string;
    inscricaoEstadual: string;
    cnpj: string;
    cnae: string;
    endereco: string;
    bairro: string;
    cep: string;
    municipio: string;
    uf: string;
    telefone: string;
  };
  adquirente?: {
    nome?: string;
    inscricaoEstadual?: string;
    cnpj?: string;
    cnae?: string;
    endereco?: string;
    bairro?: string;
    cep?: string;
    municipio?: string;
    uf?: string;
    telefone?: string;
  };
  documento: {
    tipo: string[];
    numero: string;
    dataRegistro: string;
    valorCIF: string;
    nomeRecinto: string;
    codRecinto: string;
    ufDesembaraco: string;
  };
  produtos: Array<{
    adicao: string;
    classeTarifaria: string;
    ncm: string;
    tratamento: string;
    fundamentoLegal: string;
    valor: string;
  }>;
  icmsCalculo: {
    editalDBF: string;
    valorCIF: string;
    impostos: string;
    vt: string;
    vti: string;
    vf: string;
    textoAdicional?: string;
  };
  assinatura?: {
    nome: string;
    cargo?: string;
    data?: string;
    cpf?: string;
    endereco?: string;
    telefone?: string;
    email?: string;
    assinaturaImagem?: string;
  };
}

const BK = [0, 0, 0] as [number, number, number];
const WH = [255, 255, 255] as [number, number, number];

function fmt(v: string | number): string {
  const n = parseFloat(String(v) || "0");
  return isNaN(n) ? "0,00" : n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(d: string): string {
  if (!d) return "";
  try { const [y, m, day] = d.split("-"); return `${day}/${m}/${y}`; } catch { return d; }
}

function box(doc: jsPDF, x: number, y: number, w: number, h: number) {
  doc.setDrawColor(...BK);
  doc.setLineWidth(0.2);
  doc.setFillColor(...WH);
  doc.rect(x, y, w, h, "FD");
}

function label(doc: jsPDF, text: string, x: number, y: number, size = 5.5) {
  doc.setFont("helvetica", "normal");
  doc.setFontSize(size);
  doc.setTextColor(...BK);
  doc.text(text, x, y);
}

function value(doc: jsPDF, text: string, x: number, y: number, size = 7, bold = false) {
  doc.setFont("helvetica", bold ? "bold" : "normal");
  doc.setFontSize(size);
  doc.setTextColor(...BK);
  doc.text(text, x, y);
}

function headerBox(doc: jsPDF, x: number, y: number, w: number, h: number, text: string, size = 5.5) {
  box(doc, x, y, w, h);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(size);
  doc.setTextColor(...BK);
  const lines = doc.splitTextToSize(text, w - 1.5);
  doc.text(lines, x + 0.8, y + 2.2);
}

function cell(
  doc: jsPDF,
  x: number, y: number, w: number, h: number,
  lbl: string, val: string,
  lblSize = 5.5, valSize = 7
) {
  box(doc, x, y, w, h);
  label(doc, lbl, x + 0.8, y + 2.2, lblSize);
  if (val) value(doc, val, x + 0.8, y + h - 1.8, valSize);
}

// ============================================================
export async function gerarGLMEPDF(formData: GLMEFormData): Promise<void> {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });

  page1(doc, formData);
  doc.addPage("a4", "landscape");
  page2(doc, formData);

  const dt = new Date().toISOString().slice(0, 10);
  doc.save(`GLME_${(formData.importador.nome || "formulario").replace(/\s+/g, "_")}_${dt}.pdf`);
}

// ============================================================
// PÁGINA 1
// ============================================================
function page1(doc: jsPDF, fd: GLMEFormData) {
  const ML = 10, MR = 10, MT = 12;
  const PW = 297;
  const CW = PW - ML - MR;
  let y = MT;

  // Título
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...BK);
  doc.text("ANEXO ÚNICO CONVÊNIO ICMS 85/2009", PW / 2, y, { align: "center" });
  y += 5;

  // Linha 1: Título GLME + Secretaria
  const secW = 65;
  const titW = CW - secW;
  box(doc, ML, y, titW, 8);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.5);
  doc.setTextColor(...BK);
  doc.text(
    "GUIA PARA LIBERAÇÃO DE MERCADORIA ESTRANGEIRA SEM COMPROVAÇÃO DO RECOLHIMENTO DO ICMS - GLME",
    ML + 1.5, y + 5
  );
  cell(doc, ML + titW, y, secW, 8, "1 - SECRETARIA DA FAZENDA OU DE FINANÇAS DE:", fd.secretariaUF || "");
  y += 8;

  // Espaço em branco
  box(doc, ML, y, CW, 2);
  y += 2;

  // Linha 2: 2-IMPORTADOR | 3-ADQUIRENTE
  const halfW = CW / 2;
  box(doc, ML, y, halfW, 4);
  doc.setFont("helvetica", "bold"); doc.setFontSize(6); doc.setTextColor(...BK);
  doc.text("2 – IMPORTADOR", ML + 1, y + 2.8);
  box(doc, ML + halfW, y, halfW, 4);
  doc.text("3 – ADQUIRENTE*", ML + halfW + 1, y + 2.8);
  y += 4;

  // Linha 3: 2.1 Nome | 3.1 Nome
  cell(doc, ML, y, halfW, 7, "2.1 – NOME/RAZÃO SOCIAL", fd.importador.nome || "");
  cell(doc, ML + halfW, y, halfW, 7, "3.1 – NOME/RAZÃO SOCIAL", fd.adquirente?.nome || "");
  y += 7;

  // Linha 4: IE | CNPJ | CNAE (ambos lados)
  const ie1W = 34, cnpj1W = 44, cnae1W = halfW - ie1W - cnpj1W;
  cell(doc, ML, y, ie1W, 7, "2.2 - INSCRIÇÃO ESTADUAL", fd.importador.inscricaoEstadual || "");
  cell(doc, ML + ie1W, y, cnpj1W, 7, "2.3 - CNPJ/CPF", fd.importador.cnpj || "");
  cell(doc, ML + ie1W + cnpj1W, y, cnae1W, 7, "2.4 CNAE", fd.importador.cnae || "");

  const x2 = ML + halfW;
  const ie2W = 34, cnpj2W = 44, cnae2W = halfW - ie2W - cnpj2W;
  cell(doc, x2, y, ie2W, 7, "3.2 - INSCRIÇÃO ESTADUAL", fd.adquirente?.inscricaoEstadual || "");
  cell(doc, x2 + ie2W, y, cnpj2W, 7, "3.3 - CNPJ/CPF", fd.adquirente?.cnpj || "");
  cell(doc, x2 + ie2W + cnpj2W, y, cnae2W, 7, "3.4 CNAE", fd.adquirente?.cnae || "");
  y += 7;

  // Linha 5: Endereço | Bairro
  const end1W = halfW * 0.62, bai1W = halfW - end1W;
  cell(doc, ML, y, end1W, 7, "2.5 – ENDEREÇO", fd.importador.endereco || "");
  cell(doc, ML + end1W, y, bai1W, 7, "2.6 - BAIRRO OU DISTRITO", fd.importador.bairro || "");

  const end2W = halfW * 0.62, bai2W = halfW - end2W;
  cell(doc, x2, y, end2W, 7, "3.5 – ENDEREÇO", fd.adquirente?.endereco || "");
  cell(doc, x2 + end2W, y, bai2W, 7, "3.6 - BAIRRO OU DISTRITO", fd.adquirente?.bairro || "");
  y += 7;

  // Linha 6: CEP | Município | UF | Tel
  const cep1W = 19, mun1W = 48, uf1W = 11, tel1W = halfW - cep1W - mun1W - uf1W;
  cell(doc, ML, y, cep1W, 7, "2.7 – CEP", fd.importador.cep || "");
  cell(doc, ML + cep1W, y, mun1W, 7, "2.8 – MUNICÍPIO", fd.importador.municipio || "");
  cell(doc, ML + cep1W + mun1W, y, uf1W, 7, "2.9 – UF", fd.importador.uf || "");
  cell(doc, ML + cep1W + mun1W + uf1W, y, tel1W, 7, "2.10 – TELEFONE", fd.importador.telefone || "");

  const cep2W = 19, mun2W = 48, uf2W = 11, tel2W = halfW - cep2W - mun2W - uf2W;
  cell(doc, x2, y, cep2W, 7, "3.7 – CEP", fd.adquirente?.cep || "");
  cell(doc, x2 + cep2W, y, mun2W, 7, "3.8 – MUNICÍPIO", fd.adquirente?.municipio || "");
  cell(doc, x2 + cep2W + mun2W, y, uf2W, 7, "3.9 - UF", fd.adquirente?.uf || "");
  cell(doc, x2 + cep2W + mun2W + uf2W, y, tel2W, 7, "3.10 – TELEFONE", fd.adquirente?.telefone || "");
  y += 7;

  // Linha 7: Documento de Importação
  box(doc, ML, y, CW, 5);
  const tipos = fd.documento.tipo || [];
  const di = tipos.includes("DI") ? "X" : " ";
  const dsi = tipos.includes("DSI") ? "X" : " ";
  const da = tipos.includes("DA") ? "X" : " ";
  doc.setFont("helvetica", "bold"); doc.setFontSize(6.5); doc.setTextColor(...BK);
  doc.text(`4. DOCUMENTO DE IMPORTAÇÃO:  DI ( ${di} )   DSI ( ${dsi} )   DA ( ${da} )`, ML + 1.5, y + 3.3);
  y += 5;

  // Linha 8: 4.1 | 4.2 | 4.3 | 4.4 | 4.5 | 4.6
  const n1 = 32, n2 = 32, n3 = 38, n4 = 62, n5 = 48, n6 = CW - n1 - n2 - n3 - n4 - n5;
  cell(doc, ML, y, n1, 7, "4.1 NÚMERO", fd.documento.numero || "");
  cell(doc, ML + n1, y, n2, 7, "4.2 DATA DO REGISTRO", fmtDate(fd.documento.dataRegistro));
  cell(doc, ML + n1 + n2, y, n3, 7, "4.3 VALOR CIF(VMLD) EM R$", fd.documento.valorCIF ? fmt(fd.documento.valorCIF) : "");
  cell(doc, ML + n1 + n2 + n3, y, n4, 7, "4.4 NOME RECINTO ALFANDEGADO", fd.documento.nomeRecinto || "");
  cell(doc, ML + n1 + n2 + n3 + n4, y, n5, 7, "4.5 CÓD. RECINTO ALFANDEGADO", fd.documento.codRecinto || "");
  cell(doc, ML + n1 + n2 + n3 + n4 + n5, y, n6, 7, "4.6 UF DESEMBARAÇO", fd.documento.ufDesembaraco || "");
  y += 7;

  // Seção 5 header
  box(doc, ML, y, CW, 5);
  doc.setFont("helvetica", "bold"); doc.setFontSize(6.5); doc.setTextColor(...BK);
  doc.text("5 - PRODUTOS SEM RECOLHIMENTO DO ICMS", ML + 1.5, y + 3.3);
  y += 5;

  // Texto solicitação
  box(doc, ML, y, CW, 4.5);
  doc.setFont("helvetica", "normal"); doc.setFontSize(5); doc.setTextColor(...BK);
  doc.text(
    "Solicitamos a liberação das mercadorias ou bens abaixo descritos, sem a comprovação do recolhimento do ICMS. Estamos cientes de que o tratamento tributário está sujeito à reexame e confirmação.",
    ML + 1, y + 3
  );
  y += 4.5;

  // Cabeçalho tabela produtos
  const c1 = 20, c2 = 26, c3 = 20, c5 = 26, c4 = CW - c1 - c2 - c3 - c5;
  const hh = 10;
  headerBox(doc, ML, y, c1, hh, "5.1 ADIÇÃO Nº");
  headerBox(doc, ML + c1, y, c2, hh, "5.2 CLASSE TARIFÁRIA\n(NCM)");
  headerBox(doc, ML + c1 + c2, y, c3, hh, "5.3\nTRATAMENTO\nTRIBUTÁRIO\nDO ICMS**");
  headerBox(doc, ML + c1 + c2 + c3, y, c4, hh, "5.4 FUNDAMENTO LEGAL (Lei, Lei Complementar, Convênio, Decreto, Processo, Ato Concessório, etc.)");
  headerBox(doc, ML + c1 + c2 + c3 + c4, y, c5, hh, "5.5 VALOR\nADUANEIRO DA\nADIÇÃO EM R$");
  y += hh;

  // Dados do campo 5.4 - fundamento legal e cálculos
  const edital = fd.icmsCalculo?.editalDBF || "XXX/XXXX";
  const textoAd = (fd.icmsCalculo as any)?.textoAdicional || "";
  const cifVal = fmt(fd.icmsCalculo?.valorCIF || "0");
  const impVal = fmt(fd.icmsCalculo?.impostos || "0");
  const vtVal  = fmt(fd.icmsCalculo?.vt  || "0");
  const vtiVal = fmt(fd.icmsCalculo?.vti || "0");
  const vfVal  = fmt(fd.icmsCalculo?.vf  || "0");

  // Blocos de texto do campo 5.4 — fonte +3pt (7.2 para texto legal, 7.5 para cálculos)
  const fund54Blocks: Array<{ text: string; bold?: boolean; size?: number }> = [
    {
      text: `ICMS diferido nos termos da Lei nº 13.942/2009, art. 2º-A, I; § 1º; Decreto 44.650/2017, Anexo 8, art. 49, Anexo 27, art. 1º, II; Credenciamento de estímulo à atividade portuária – Edital DBF nº. ${edital}; Mercadoria não prevista na Lista de produtos impedidos para utilização do Programa de Estímulo à Atividade Portuária - PEAP - Anexo 27 do Decreto nº 44.650/2017.`,
      size: 7.2, // +3pt em relação ao original 4.2
    },
    ...(textoAd ? [{ text: textoAd, size: 7.2 }] : []),
    { text: "", size: 3 }, // espaço
    { text: `CÁLCULO: (VALOR CIF) R$${cifVal} + IMPOSTOS R$${impVal} = (VT) R$${vtVal}`, bold: true, size: 7.5 },
    { text: `BASE DE CÁLCULO PARA ICMS: (VT) R$${vtVal} / 0,795 = (VTI) R$${vtiVal}`, bold: true, size: 7.5 },
    { text: `CÁLCULO ICMS: (VTI) R$${vtiVal} × 20,5% = (VF) R$${vfVal}`, bold: true, size: 7.5 },
  ];

  // Calcula a altura total necessária para renderizar todos os blocos com um fator de escala
  function calcHeight54(cw: number, scale: number): number {
    let h = 2.5; // padding top
    for (const blk of fund54Blocks) {
      const sz = (blk.size ?? 7.2) * scale;
      if (!blk.text) { h += sz * 0.3; continue; }
      doc.setFont("helvetica", blk.bold ? "bold" : "normal");
      doc.setFontSize(sz);
      const lines = doc.splitTextToSize(blk.text, cw - 2);
      h += lines.length * sz * 0.52;
    }
    h += 0.5; // padding bottom
    return h;
  }

  // Renderiza o campo 5.4 com auto-shrink: reduz a fonte até todo o texto caber na célula
  function render54(cx: number, cy: number, cw: number, ch: number) {
    // Determinar fator de escala: começa em 1.0 e reduz em passos de 0.05 até caber
    let scale = 1.0;
    const MIN_SCALE = 0.4;
    while (scale > MIN_SCALE && calcHeight54(cw, scale) > ch) {
      scale = Math.round((scale - 0.05) * 100) / 100;
    }

    let ty = cy + 2.5;
    for (const blk of fund54Blocks) {
      const sz = (blk.size ?? 7.2) * scale;
      doc.setFont("helvetica", blk.bold ? "bold" : "normal");
      doc.setFontSize(sz);
      doc.setTextColor(...BK);
      if (!blk.text) { ty += sz * 0.3; continue; }
      const wrapped = doc.splitTextToSize(blk.text, cw - 2);
      for (const ln of wrapped) {
        if (ty + sz * 0.4 > cy + ch - 0.5) break; // guarda de segurança
        doc.text(ln, cx + cw / 2, ty + sz * 0.35, { align: "center" });
        ty += sz * 0.52;
      }
    }
  }

  // Linhas de produtos — ALTURA FIXA (layout não muda)
  // Frente: 3 linhas com altura fixa de 10mm cada
  // Células 5.4 e 5.5 são MESCLADAS verticalmente (abrangem todas as 3 linhas)
  const prods = fd.produtos || [];
  const ph = 10; // altura fixa para todas as linhas
  const totalProdH = 3 * ph; // altura total das 3 linhas mescladas

  // Desenhar bordas das células 5.1, 5.2, 5.3 por linha (não mescladas)
  for (let i = 0; i < 3; i++) {
    const ry = y + i * ph;
    box(doc, ML, ry, c1, ph);
    box(doc, ML + c1, ry, c2, ph);
    box(doc, ML + c1 + c2, ry, c3, ph);
    const p = prods[i];
    if (p) {
      const midY = ry + ph / 2 + 1;
      doc.setFont("helvetica", "normal"); doc.setFontSize(6.5); doc.setTextColor(...BK);
      doc.text(p.adicao || "", ML + c1 / 2, midY, { align: "center" });
      doc.text(p.classeTarifaria || p.ncm || "", ML + c1 + c2 / 2, midY, { align: "center" });
      doc.text(p.tratamento || "", ML + c1 + c2 + c3 / 2, midY, { align: "center" });
    }
  }

  // Célula 5.4 MESCLADA: uma única célula cobrindo as 3 linhas
  box(doc, ML + c1 + c2 + c3, y, c4, totalProdH);
  render54(ML + c1 + c2 + c3, y, c4, totalProdH);

  // Célula 5.5 MESCLADA: uma única célula cobrindo as 3 linhas
  // Valor 5.5 = valor CIF do item 4.3 (campo icmsCalculo.valorCIF ou documento.valorCIF)
  box(doc, ML + c1 + c2 + c3 + c4, y, c5, totalProdH);
  const val55 = fd.icmsCalculo?.valorCIF || fd.documento?.valorCIF || "";
  if (val55) {
    doc.setFont("helvetica", "normal"); doc.setFontSize(6.5); doc.setTextColor(...BK);
    doc.text(fmt(val55), ML + c1 + c2 + c3 + c4 + c5 / 2, y + totalProdH / 2 + 1, { align: "center" });
  }

  y += totalProdH;

  // Campo 6 e 7
  const c6W = CW * 0.55, c7W = CW - c6W;
  const c67H = 28;
  box(doc, ML, y, c6W, c67H);
  doc.setFont("helvetica", "bold"); doc.setFontSize(5.5); doc.setTextColor(...BK);
  doc.text("6 REPRESENTANTE LEGAL OU PROCURADOR (Nome, CPF, Endereço, CEP, Telefone, E-mail e Assinatura)", ML + 1, y + 2.5);

  if (fd.assinatura) {
    const s = fd.assinatura;
    doc.setFont("helvetica", "normal"); doc.setFontSize(6.5);
    let sy = y + 5.5;
    if (s.nome) { doc.text(s.nome, ML + 2, sy); sy += 3.5; }
    if (s.cpf) { doc.text(`CPF: ${s.cpf}`, ML + 2, sy); sy += 3.5; }
    if (s.endereco) { doc.text(s.endereco, ML + 2, sy); sy += 3.5; }
    if (s.telefone) { doc.text(`Tel: ${s.telefone}`, ML + 2, sy); sy += 3.5; }
    if (s.email) { doc.text(s.email, ML + 2, sy); sy += 3.5; }
  }

  // Imagem de assinatura
  if (fd.assinatura?.assinaturaImagem) {
    try {
      doc.addImage(fd.assinatura.assinaturaImagem, "PNG", ML + 15, y + c67H - 18, c6W - 30, 8);
    } catch (_) { /* ignora */ }
  }

  const sigY = y + c67H - 8;
  doc.setLineWidth(0.3); doc.setDrawColor(...BK);
  doc.line(ML + 15, sigY, ML + c6W - 15, sigY);
  doc.setFont("helvetica", "normal"); doc.setFontSize(5.5);
  doc.text("ASSINATURA", ML + c6W / 2, sigY + 3, { align: "center" });

  box(doc, ML + c6W, y, c7W, c67H);
  doc.setFont("helvetica", "bold"); doc.setFontSize(5.5);
  doc.text("7. VISTO DO FISCO DA UNIDADE FEDERADA DO IMPORTADOR", ML + c6W + 1, y + 2.5);
  const defY = y + c67H - 8;
  doc.setLineWidth(0.3);
  doc.line(ML + c6W + 10, defY, ML + c6W + c7W - 10, defY);
  doc.setFont("helvetica", "normal"); doc.setFontSize(5.5);
  doc.text("DEFERIDA A SOLICITAÇÃO - DATA E CARIMBO", ML + c6W + c7W / 2, defY + 3, { align: "center" });
  y += c67H;

  // Campo 8 e 9
  const c8W = CW * 0.55, c9W = CW - c8W;
  const c89H = 22;
  box(doc, ML, y, c8W, c89H);
  doc.setFont("helvetica", "bold"); doc.setFontSize(5.5);
  doc.text("8. REGISTRO DA ENTREGA DA(S) MERCADORIA(S) PELO DEPOSITÁRIO DO RECINTO ALFANDEGADO", ML + 1, y + 2.5);
  const entY = y + c89H - 8;
  doc.setLineWidth(0.3);
  doc.line(ML + 15, entY, ML + c8W - 15, entY);
  doc.setFont("helvetica", "normal"); doc.setFontSize(5.5);
  doc.text("NOME/CPF/DATA", ML + c8W / 2, entY + 3, { align: "center" });

  box(doc, ML + c8W, y, c9W, c89H);
  doc.setFont("helvetica", "bold"); doc.setFontSize(5.5);
  doc.text("9. OBSERVAÇÕES DO FISCO", ML + c8W + 1, y + 2.5);
  y += c89H;

  // Notas
  box(doc, ML, y, CW, 4);
  doc.setFont("helvetica", "normal"); doc.setFontSize(5);
  doc.text("* Preencher caso seja diverso do importador", ML + 1, y + 2.8);
  y += 4;

  box(doc, ML, y, CW, 4);
  doc.text(
    "** TRATAMENTO TRIBUTÁRIO = preencher com: 1- drawback; 2- regime especial, 3- diferimento, 4- isenção, 5- não-incidência/imunidade, 6- outros (especificar no campo Fundamento Legal)",
    ML + 1, y + 2.8
  );
}

// ============================================================
// PÁGINA 2 - VERSO
// ============================================================
function page2(doc: jsPDF, fd: GLMEFormData) {
  const ML = 10, MT = 12;
  const PW = 297;
  const CW = PW - ML - 10;
  let y = MT;

  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(...BK);
  doc.text("VERSO DA GLME", PW / 2, y, { align: "center" });
  y += 5;

  box(doc, ML, y, CW, 5);
  doc.setFont("helvetica", "bold"); doc.setFontSize(6.5);
  doc.text("5 - PRODUTOS SEM RECOLHIMENTO DO ICMS - CONTINUAÇÃO", ML + 1.5, y + 3.3);
  y += 5;

  box(doc, ML, y, CW, 4.5);
  doc.setFont("helvetica", "normal"); doc.setFontSize(5);
  doc.text(
    "Solicitamos a liberação das mercadorias ou bens abaixo descritos, sem a comprovação do recolhimento do ICMS. Estamos cientes de que o tratamento tributário está sujeito à reexame e confirmação.",
    ML + 1, y + 3
  );
  y += 4.5;

  const c1 = 20, c2 = 26, c3 = 20, c5 = 26, c4 = CW - c1 - c2 - c3 - c5;
  const hh = 10;
  headerBox(doc, ML, y, c1, hh, "5.1 ADIÇÃO Nº");
  headerBox(doc, ML + c1, y, c2, hh, "5.2 CLASSE\nTARIFÁRIA\n(NCM)");
  headerBox(doc, ML + c1 + c2, y, c3, hh, "5.3\nTRATAMENTO\nTRIBUTÁRIO\nDO ICMS**");
  headerBox(doc, ML + c1 + c2 + c3, y, c4, hh, "5.4 FUNDAMENTO LEGAL (Lei, Lei Complementar, Convênio, Decreto, Processo, Ato Concessório, etc.)");
  headerBox(doc, ML + c1 + c2 + c3 + c4, y, c5, hh, "5.5 VALOR\nADUANEIRO DA\nADIÇÃO EM R$");
  y += hh;

  const prods = fd.produtos || [];
  const ph = 10;
  const maxBack = 12; // máximo de linhas no verso
  const totalBackH = maxBack * ph; // altura total das linhas do verso

  // Desenhar bordas das células 5.1, 5.2, 5.3 por linha (não mescladas)
  for (let i = 0; i < maxBack; i++) {
    const p = prods[i + 3]; // adições a partir da 4ª continuam no verso
    const ry = y + i * ph;
    box(doc, ML, ry, c1, ph);
    box(doc, ML + c1, ry, c2, ph);
    box(doc, ML + c1 + c2, ry, c3, ph);
    if (p) {
      const midY = ry + ph / 2 + 1;
      doc.setFont("helvetica", "normal"); doc.setFontSize(6.5); doc.setTextColor(...BK);
      doc.text(p.adicao || "", ML + c1 / 2, midY, { align: "center" });
      doc.text(p.classeTarifaria || p.ncm || "", ML + c1 + c2 / 2, midY, { align: "center" });
      doc.text(p.tratamento || "", ML + c1 + c2 + c3 / 2, midY, { align: "center" });
    }
  }

  // Célula 5.4 MESCLADA no verso: uma única célula cobrindo todas as linhas do verso
  box(doc, ML + c1 + c2 + c3, y, c4, totalBackH);
  // No verso, o campo 5.4 exibe o mesmo texto do fundamento legal (compacto)
  {
    const edital = fd.icmsCalculo?.editalDBF || "XXX/XXXX";
    const textoAd = (fd.icmsCalculo as any)?.textoAdicional || "";
    const cifVal = fmt(fd.icmsCalculo?.valorCIF || "0");
    const impVal = fmt(fd.icmsCalculo?.impostos || "0");
    const vtVal  = fmt(fd.icmsCalculo?.vt  || "0");
    const vtiVal = fmt(fd.icmsCalculo?.vti || "0");
    const vfVal  = fmt(fd.icmsCalculo?.vf  || "0");
    const blocks: Array<{ text: string; bold?: boolean; size?: number }> = [
      { text: `ICMS diferido nos termos da Lei nº 13.942/2009, art. 2º-A, I; § 1º; Decreto 44.650/2017, Anexo 8, art. 49, Anexo 27, art. 1º, II; Credenciamento de estímulo à atividade portuária – Edital DBF nº. ${edital}; Mercadoria não prevista na Lista de produtos impedidos para utilização do Programa de Estímulo à Atividade Portuária - PEAP - Anexo 27 do Decreto nº 44.650/2017.`, size: 7.2 },
      ...(textoAd ? [{ text: textoAd, size: 7.2 }] : []),
      { text: "", size: 3 },
      { text: `CÁLCULO: (VALOR CIF) R$${cifVal} + IMPOSTOS R$${impVal} = (VT) R$${vtVal}`, bold: true, size: 7.5 },
      { text: `BASE DE CÁLCULO PARA ICMS: (VT) R$${vtVal} / 0,795 = (VTI) R$${vtiVal}`, bold: true, size: 7.5 },
      { text: `CÁLCULO ICMS: (VTI) R$${vtiVal} × 20,5% = (VF) R$${vfVal}`, bold: true, size: 7.5 },
    ];
    let ty = y + 2.5;
    for (const blk of blocks) {
      const sz = blk.size ?? 7.2;
      doc.setFont("helvetica", blk.bold ? "bold" : "normal");
      doc.setFontSize(sz);
      doc.setTextColor(...BK);
      if (!blk.text) { ty += sz * 0.3; continue; }
      const wrapped = doc.splitTextToSize(blk.text, c4 - 2);
      for (const ln of wrapped) {
        if (ty + sz * 0.4 > y + totalBackH - 0.5) break;
        doc.text(ln, ML + c1 + c2 + c3 + c4 / 2, ty + sz * 0.35, { align: "center" });
        ty += sz * 0.52;
      }
    }
  }

  // Célula 5.5 MESCLADA no verso: uma única célula cobrindo todas as linhas
  box(doc, ML + c1 + c2 + c3 + c4, y, c5, totalBackH);
  const val55back = fd.icmsCalculo?.valorCIF || fd.documento?.valorCIF || "";
  if (val55back) {
    doc.setFont("helvetica", "normal"); doc.setFontSize(6.5); doc.setTextColor(...BK);
    doc.text(fmt(val55back), ML + c1 + c2 + c3 + c4 + c5 / 2, y + totalBackH / 2 + 1, { align: "center" });
  }

  y += totalBackH;

  box(doc, ML, y, CW, 4);
  doc.setFont("helvetica", "normal"); doc.setFontSize(5);
  doc.text(
    "** TRATAMENTO TRIBUTÁRIO = preencher com: 1- drawback; 2- regime especial, 3- diferimento, 4- isenção, 5- não-incidência/imunidade, 6- outros (especificar no campo Fundamento Legal)",
    ML + 1, y + 2.8
  );
}
