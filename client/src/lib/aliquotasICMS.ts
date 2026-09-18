/**
 * Tabela de NCMs sujeitas a tributação normal (FECEP) - Anexo I
 * Lei 18.305/2023 – efeitos a partir de 1º.01.2024
 * Produto relacionado na Lei nº 12.523/2003 – FECEP (inciso I do art. 18-A)
 *
 * Estrutura: { ncmPrefix: aliquota }
 * A NCM pode ser prefixo (ex: "2402" cobre 2402.10.00, 2402.20.00, etc.)
 */

export interface AliquotaNCM {
  ncm: string;        // código NCM ou prefixo
  descricao: string;  // descrição do produto
  aliquota: number;   // alíquota em % (ex: 29)
  item: string;       // item do anexo (ex: "1.1")
  /**
   * De onde vem a regra: Anexo 1 da Lei 15.730/2016 (padrão) ou alíquota aplicada pelo e-Fisco
   * da SEFAZ-PE em DMI real, quando não há previsão expressa no Anexo 1 nem na Lei 12.523/2003.
   */
  fonte?: "anexo1" | "efisco";
}

/**
 * Lista de NCMs com tributação normal (FECEP) conforme Anexo I
 * Alíquotas:
 * - Grupo 1 (armas, tabaco, munições): 29%
 * - Grupo 2 (artigos de luxo, bebidas alcoólicas, embarcações, motos, joias): 27%
 * - Grupo 3 (álcool etílico hidratado combustível - AEHC): 15,52%
 * - Grupo 4 (refrigerantes, água mineral, isotônicos, plásticos descartáveis, explosivos): 22,5%
 * - Grupo 5 (cerveja em embalagem retornável com fécula de mandioca): 18%
 */
export const ALIQUOTAS_ICMS_PE: AliquotaNCM[] = [
  // Grupo 1 - Alíquota 29%
  { item: "1.1", ncm: "2402", descricao: "Charutos, cigarrilhas e cigarros, de tabaco ou dos seus sucedâneos", aliquota: 29 },
  { item: "1.2", ncm: "9302", descricao: "Armas (revólveres e pistolas)", aliquota: 29 },
  { item: "1.2", ncm: "9303", descricao: "Armas (outras armas de fogo)", aliquota: 29 },
  { item: "1.2", ncm: "9304", descricao: "Armas (outras armas)", aliquota: 29 },
  { item: "1.3", ncm: "9305", descricao: "Partes e acessórios de revólveres e pistolas", aliquota: 29 },
  { item: "1.4", ncm: "9306", descricao: "Bombas, granadas, torpedos, minas, mísseis, cartuchos e outras munições", aliquota: 29 },

  // Grupo 2 - Alíquota 27%
  { item: "2.1", ncm: "2203", descricao: "Bebidas alcoólicas - cerveja", aliquota: 27 },
  { item: "2.1", ncm: "2204", descricao: "Bebidas alcoólicas - vinhos", aliquota: 27 },
  { item: "2.1", ncm: "2205", descricao: "Bebidas alcoólicas - vermutes", aliquota: 27 },
  { item: "2.1", ncm: "2206", descricao: "Bebidas alcoólicas - outras bebidas fermentadas", aliquota: 27 },
  { item: "2.1", ncm: "2207", descricao: "Bebidas alcoólicas - álcool etílico não desnaturado", aliquota: 27 },
  { item: "2.1", ncm: "2208", descricao: "Bebidas alcoólicas - aguardentes, licores e outras bebidas", aliquota: 27 },
  { item: "2.2", ncm: "8801", descricao: "Balões, dirigíveis, planadores, asas voadoras e outros veículos aéreos sem motor", aliquota: 27 },
  { item: "2.3", ncm: "8802", descricao: "Veículo aéreo para propulsão com motor, do tipo ultraleve", aliquota: 27 },
  { item: "2.4", ncm: "8903", descricao: "Iates e outros barcos e embarcações de recreio ou de esporte, barcos a remo, canoas e jet-skis", aliquota: 27 },
  { item: "2.5", ncm: "8711", descricao: "Motocicletas com motor de pistão alternativo de cilindrada superior a 250 cm³", aliquota: 27 },
  { item: "2.6", ncm: "7113", descricao: "Artefatos de joalheria e suas partes, de metais preciosos ou folheados", aliquota: 27 },
  { item: "2.7", ncm: "7114", descricao: "Artefatos de ourivesaria e suas partes, de metais preciosos ou folheados", aliquota: 27 },
  { item: "2.8", ncm: "7116", descricao: "Obras de pérolas naturais ou cultivadas, de pedras preciosas ou semipreciosas", aliquota: 27 },
  { item: "2.9", ncm: "7117", descricao: "Bijuterias", aliquota: 27 },

  // Grupo 3 - Alíquota 15,52%
  { item: "3", ncm: "2207", descricao: "Álcool Etílico Hidratado Combustível - AEHC", aliquota: 15.52 },

  // Grupo 4 - Alíquota 22,5%
  { item: "4.1", ncm: "2202.10.00", descricao: "Refrigerante", aliquota: 22.5 },
  { item: "4.2", ncm: "2106.90.10", descricao: "Extrato concentrado para a elaboração de refrigerante", aliquota: 22.5 },
  { item: "4.3", ncm: "2201.10.00", descricao: "Água mineral em embalagem descartável", aliquota: 22.5 },
  { item: "4.4", ncm: "2202.99.00", descricao: "Bebidas hidroeletrolíticas (isotônicas)", aliquota: 22.5 },
  { item: "4.5", ncm: "2208.40.00", descricao: "Aguardente de cana-de-açúcar ou de melaço", aliquota: 22.5 },
  { item: "4.6", ncm: "3923.2", descricao: "Saco plástico", aliquota: 22.5 },
  { item: "4.7", ncm: "3924.10.00", descricao: "Copo descartável plástico", aliquota: 22.5 },
  { item: "4.8", ncm: "3917.32.29", descricao: "Canudo descartável plástico", aliquota: 22.5 },
  { item: "4.9", ncm: "3602.00.00", descricao: "Explosivos preparados", aliquota: 22.5 },

  // Alíquota aplicada pelo e-Fisco (DMI da DUIMP 26BR00015748228, set/2026: NCM 3923.30.90 a 22,5%,
  // "Tributação normal - genérica"). O Anexo 1 e a Lei do FECEP só listam saco plástico (3923.2),
  // copo (3924.10.00) e canudo (3917.32.29); mantida para a guia bater com a DMI/DAE.
  { item: "e-Fisco", ncm: "3923.30", descricao: "Garrafões, garrafas, frascos e artigos semelhantes, de plástico", aliquota: 22.5, fonte: "efisco" },

  // Grupo 5 - Alíquota 18%
  { item: "5", ncm: "2203.00.00", descricao: "Cerveja acondicionada em embalagem retornável com no mínimo 20% de fécula de mandioca", aliquota: 18 },
];

/** Alíquota aplicada quando a NCM não tem regra no Anexo I. */
export const ALIQUOTA_PADRAO = 20.5;

export type NivelNCM = "ncm" | "subitem" | "subposicao" | "posicao" | "capitulo";

export interface ConsultaAliquota {
  /** Alíquota a considerar, em % (regra mais específica ou a padrão). */
  aliquota: number;
  /** "anexo" quando há regra no Anexo I; "padrao" quando não há. */
  origem: "anexo" | "padrao";
  /** Regra aplicada (a mais específica), quando houver. */
  regra: AliquotaNCM | null;
  /** Nível em que a regra casou (capítulo, posição, ..., NCM completa). */
  nivel: NivelNCM | null;
  /**
   * Outras regras igualmente específicas com alíquota diferente
   * (ex.: 2207 = bebidas 27% ou AEHC 15,52%): a alíquota depende da mercadoria.
   */
  alternativas: AliquotaNCM[];
}

function nivelPorDigitos(digitos: number): NivelNCM {
  if (digitos >= 8) return "ncm";
  if (digitos === 7) return "subitem";
  if (digitos >= 5) return "subposicao";
  if (digitos >= 4) return "posicao";
  return "capitulo";
}

/**
 * Consulta a alíquota de ICMS de uma NCM no Anexo I, sempre pela NCM completa.
 *
 * Uma regra casa quando a NCM COMEÇA com o código da regra (capítulo "22",
 * posição "2208", subposição "3923.2", NCM completa "2208.40.00"...).
 * Entre as regras que casam, vence a MAIS ESPECÍFICA (mais dígitos): assim
 * 2208.40.00 (aguardente) fica com 22,5% e não com os 27% da posição 2208.
 */
export function consultarAliquotaNCM(ncm: string): ConsultaAliquota {
  const padrao: ConsultaAliquota = {
    aliquota: ALIQUOTA_PADRAO, origem: "padrao", regra: null, nivel: null, alternativas: [],
  };
  const ncmLimpo = (ncm || "").replace(/\D/g, "");
  if (ncmLimpo.length < 2) return padrao;

  const candidatas = ALIQUOTAS_ICMS_PE
    .map((regra) => ({ regra, codigo: regra.ncm.replace(/\D/g, "") }))
    .filter(({ codigo }) => codigo.length >= 2 && ncmLimpo.startsWith(codigo));
  if (candidatas.length === 0) return padrao;

  const maisDigitos = Math.max(...candidatas.map((c) => c.codigo.length));
  const maisEspecificas = candidatas.filter((c) => c.codigo.length === maisDigitos).map((c) => c.regra);
  const [regra, ...demais] = maisEspecificas;

  return {
    aliquota: regra.aliquota,
    origem: "anexo",
    regra,
    nivel: nivelPorDigitos(maisDigitos),
    alternativas: demais.filter((r) => r.aliquota !== regra.aliquota),
  };
}

/**
 * Compatibilidade: devolve a regra do Anexo I aplicável à NCM, ou null.
 * Prefira consultarAliquotaNCM, que informa origem, nível e alternativas.
 */
export function verificarAliquotaNCM(ncm: string): AliquotaNCM | null {
  return consultarAliquotaNCM(ncm).regra;
}

/**
 * Formata o valor monetário em reais
 */
export function formatarMoeda(valor: number): string {
  return valor.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
