/**
 * Extração de texto de PDF no navegador (extrato DUIMP).
 *
 * Reproduz exatamente o `getText()` do pdf-parse 2.4.5 com os parâmetros padrão,
 * que era usado no servidor. O parser `server/duimpParser.ts` depende das quebras
 * de linha desse texto, então a montagem precisa ser idêntica:
 *  - quebra de linha quando o item tem `hasEOL` ou quando o Y muda além do limiar;
 *  - `\t` entre itens da mesma linha separados horizontalmente;
 *  - cada página termina com `\n-- N of T --\n\n`.
 *
 * `pdfjs-dist` fica fixado na mesma versão que o pdf-parse usava (5.4.296).
 */

// Mesmos valores de setDefaultParseParameters() do pdf-parse
const LINE_THRESHOLD = 4.6;
const CELL_THRESHOLD = 7;
const CELL_SEPARATOR = "\t";
const PAGE_JOINER = "\n-- page_number of total_number --";

type PdfjsLib = {
  getDocument: (params: { data: Uint8Array; verbosity?: number }) => { promise: Promise<any> };
  VerbosityLevel: { ERRORS: number };
};

async function extrairTextoPagina(page: any): Promise<string> {
  const viewport = page.getViewport({ scale: 1 });
  const textContent = await page.getTextContent({
    includeMarkedContent: false,
    disableNormalization: false,
  });

  const strBuf: string[] = [];
  let lastX: number | undefined;
  let lastY: number | undefined;
  let lineHeight = 0;

  for (const item of textContent.items) {
    if (!("str" in item)) continue;
    const [x, y] = viewport.convertToViewportPoint(item.transform[4], item.transform[5]);
    let str: string = item.str;

    if (lastY !== undefined && Math.abs(lastY - y) > LINE_THRESHOLD) {
      const lastItem = strBuf.length ? strBuf[strBuf.length - 1] : undefined;
      const itemTemQuebra = str.startsWith("\n") || (str.trim() === "" && item.hasEOL);
      if (lastItem?.endsWith("\n") === false && !itemTemQuebra) {
        if (Math.abs(lastY - y) - 1 > lineHeight) {
          strBuf.push("\n");
          lineHeight = 0;
        }
      }
    }

    if (lastY !== undefined && Math.abs(lastY - y) < LINE_THRESHOLD) {
      if (lastX !== undefined && Math.abs(lastX - x) > CELL_THRESHOLD) {
        str = `${CELL_SEPARATOR}${str}`;
      }
    }

    strBuf.push(str);
    lastX = x + item.width;
    lastY = y;
    lineHeight = Math.max(lineHeight, item.height);
    if (item.hasEOL) strBuf.push("\n");
    if (item.hasEOL || str.endsWith("\n")) lineHeight = 0;
  }

  return strBuf.join("");
}

/** Núcleo independente de ambiente: recebe a biblioteca pdfjs já carregada. */
export async function extrairTextoComPdfjs(pdfjs: PdfjsLib, data: Uint8Array): Promise<string> {
  const doc = await pdfjs.getDocument({ data, verbosity: pdfjs.VerbosityLevel.ERRORS }).promise;
  try {
    const total: number = doc.numPages;
    let texto = "";
    for (let num = 1; num <= total; num++) {
      const page = await doc.getPage(num);
      const textoPagina = await extrairTextoPagina(page);
      page.cleanup();
      const rodape = PAGE_JOINER.replace("page_number", `${num}`).replace("total_number", `${total}`);
      texto += `${textoPagina}\n${rodape}\n\n`;
    }
    return texto;
  } finally {
    await doc.destroy();
  }
}

/**
 * Extrai o texto de um arquivo PDF no navegador.
 * O pdfjs (~1 MB) só é baixado quando o usuário importa uma DUIMP.
 */
export async function extrairTextoPDF(arquivo: File): Promise<string> {
  const [pdfjs, { default: workerUrl }] = await Promise.all([
    import("pdfjs-dist"),
    import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
  ]);
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  const data = new Uint8Array(await arquivo.arrayBuffer());
  return extrairTextoComPdfjs(pdfjs as unknown as PdfjsLib, data);
}
