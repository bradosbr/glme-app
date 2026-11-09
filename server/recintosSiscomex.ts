/**
 * Leitor da tabela "Recinto Aduaneiro" exportada do Portal Único Siscomex.
 *
 * O arquivo vem em CSV (ISO-8859-1), com uma linha de data, o cabeçalho e as colunas
 * Código, Descrição, Início de Vigência e Fim de Vigência. O código tem 7 dígitos
 * (os de 6 perderam o zero à esquerda na exportação) e **não traz o dígito verificador**.
 *
 * A tabela também lista códigos fictícios, repetidos em centenas de linhas
 * (estabelecimento exportador, entrada/saída ficta, ponto virtual de fronteira):
 * não são recintos e ficam de fora.
 */

export interface RecintoSiscomex {
  /** Código no formato da guia: D.DD.DD.DD (sem o dígito verificador, que a tabela não traz). */
  codigo: string;
  nome: string;
  tipo: "porto" | "porto_seco" | "aeroporto" | "fronteira" | "outro";
  cidade: string | null;
  uf: string | null;
}

/** Códigos que valem para vários lugares ao mesmo tempo: não identificam um recinto. */
const CODIGOS_FICTICIOS = new Set(["8888888", "2222222", "5555555"]);

const UFS = new Set([
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG",
  "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
]);

/**
 * Dígitos 4 e 5 do código dizem o tipo de recinto. A correspondência foi tirada da
 * própria tabela oficial, pelas descrições de cada grupo (o cadastro antigo não serve
 * de referência: metade dos códigos dele não existe no Siscomex).
 *
 * Os grupos que não entram aqui ficam como "outro": 21 remessa expressa, 27 REDEX,
 * 33 estação ferroviária, 35 base militar, 52/98/99 unidades da Receita, 61/77 loja
 * franca, 71 DEA e 72 DAF.
 */
const TIPO_POR_DIGITOS: Record<string, RecintoSiscomex["tipo"]> = {
  "11": "aeroporto", // aeroporto alfandegado
  "12": "aeroporto", // terminal de cargas (TECA)
  "13": "porto",     // instalação portuária marítima de uso público
  "14": "porto",     // instalação portuária marítima de uso privativo
  "15": "porto",     // porto fluvial
  "16": "porto",     // instalação portuária fluvial
  "17": "porto",     // porto lacustre
  "19": "fronteira", // ponto de fronteira alfandegado
  "22": "porto",     // instalação portuária (granéis, silos e tanques)
  "30": "porto_seco", // CLIA
  "31": "porto_seco",
  "32": "porto_seco", // porto seco / EADI
};

const semAcento = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();

/** Tipo pela descrição, quando os dígitos do código não resolvem. */
function tipoPelaDescricao(nome: string): RecintoSiscomex["tipo"] {
  const t = semAcento(nome);
  if (/PORTO SECO|EADI|ESTACAO ADUANEIRA|CLIA\b/.test(t)) return "porto_seco";
  if (/AEROPORTO|TECA|AEREO|\bAER\.|\bAER\b/.test(t)) return "aeroporto";
  if (/FRONTEIRA|PONTE INTERNACIONAL/.test(t)) return "fronteira";
  if (/PORTO|PORT\.|MARIT|\bMAR\.|FLUVIAL|FLUV\.|LACUSTRE|TERMINAL MARIT/.test(t)) return "porto";
  return "outro";
}

/** Uma linha de CSV, respeitando as aspas (a descrição pode ter vírgula). */
function colunas(linha: string): string[] {
  const campos: string[] = [];
  let atual = "";
  let entreAspas = false;
  for (let i = 0; i < linha.length; i++) {
    const c = linha[i];
    if (c === '"') {
      if (entreAspas && linha[i + 1] === '"') { atual += '"'; i++; } else entreAspas = !entreAspas;
    } else if (c === "," && !entreAspas) {
      campos.push(atual);
      atual = "";
    } else {
      atual += c;
    }
  }
  campos.push(atual);
  return campos;
}

/**
 * Limpa a descrição: espaços repetidos, sobras de pontuação e a quebra de linha do
 * relatório, que parte palavras ("SANTANA DO LI- VRAMENTO" → "SANTANA DO LIVRAMENTO").
 */
function limparNome(bruto: string): string {
  return bruto
    .replace(/\s+/g, " ")
    .replace(/([A-ZÀ-Ú])- ([A-ZÀ-Ú])/g, "$1$2")
    .replace(/[\s\-.,]+$/, "")
    .trim();
}

/** Cidade e UF, quando a descrição termina em "CIDADE/UF" (ex.: "IPOJUCA/PE"). */
function localidade(nome: string): { cidade: string | null; uf: string | null } {
  const comBarra = nome.match(/([^\-/.,]{2,40})\/([A-Z]{2})\.?$/);
  if (comBarra && UFS.has(comBarra[2])) {
    const cidade = comBarra[1].trim();
    return { cidade: /\d/.test(cidade) ? null : cidade, uf: comBarra[2] };
  }
  const soUF = nome.match(/[\-/\s]([A-Z]{2})\.?$/);
  if (soUF && UFS.has(soUF[1])) return { cidade: null, uf: soUF[1] };
  return { cidade: null, uf: null };
}

const dataBR = (t: string) => {
  const m = t.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1])) : null;
};

/**
 * Converte o CSV da tabela oficial em recintos, sem repetições e só com os vigentes.
 * Em código repetido, vence a primeira linha (a tabela vem ordenada por código).
 */
export function parsearRecintosSiscomex(texto: string, hoje = new Date()): RecintoSiscomex[] {
  const porCodigo = new Map<string, RecintoSiscomex>();

  for (const linha of texto.split(/\r?\n/)) {
    if (!linha.trim()) continue;
    const [codigoBruto, descricao, _inicio, fim] = colunas(linha);
    const digitos = (codigoBruto || "").trim();
    if (!/^\d{6,7}$/.test(digitos)) continue; // data do relatório e cabeçalho

    const codigo = digitos.padStart(7, "0");
    if (CODIGOS_FICTICIOS.has(codigo) || porCodigo.has(codigo)) continue;

    const fimVigencia = dataBR((fim || "").trim());
    if (fimVigencia && fimVigencia < hoje) continue;

    const nome = limparNome(descricao || "");
    if (!nome) continue;

    const { cidade, uf } = localidade(nome);
    porCodigo.set(codigo, {
      codigo: `${codigo.slice(0, 1)}.${codigo.slice(1, 3)}.${codigo.slice(3, 5)}.${codigo.slice(5, 7)}`,
      nome: nome.slice(0, 255),
      tipo: TIPO_POR_DIGITOS[codigo.slice(3, 5)] ?? tipoPelaDescricao(nome),
      cidade: cidade ? cidade.slice(0, 100) : null,
      uf,
    });
  }

  return Array.from(porCodigo.values()).sort((a, b) => a.codigo.localeCompare(b.codigo));
}
