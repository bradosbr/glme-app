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

  // Grupo 5 - Alíquota 18%
  { item: "5", ncm: "2203.00.00", descricao: "Cerveja acondicionada em embalagem retornável com no mínimo 20% de fécula de mandioca", aliquota: 18 },
];

/**
 * Verifica se uma NCM está na lista de tributação normal (FECEP)
 * Retorna a alíquota correspondente ou null se não estiver na lista
 */
export function verificarAliquotaNCM(ncm: string): AliquotaNCM | null {
  if (!ncm) return null;

  // Normalizar NCM removendo pontos e zeros à esquerda
  const ncmLimpo = ncm.replace(/\./g, "").trim();

  for (const item of ALIQUOTAS_ICMS_PE) {
    const itemNcmLimpo = item.ncm.replace(/\./g, "").trim();

    // Verificação exata
    if (ncmLimpo === itemNcmLimpo) return item;

    // Verificação por prefixo (ex: "2402" cobre "24021000", "24022000", etc.)
    if (ncmLimpo.startsWith(itemNcmLimpo) || itemNcmLimpo.startsWith(ncmLimpo)) {
      // Só aceitar prefixo se o prefixo tiver pelo menos 4 dígitos
      if (itemNcmLimpo.length >= 4) return item;
    }
  }

  return null;
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
