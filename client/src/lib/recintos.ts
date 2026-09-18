/** Busca no cadastro de recintos alfandegados (lista vinda do banco). */

export interface Recinto {
  id: number;
  codigo: string;
  nome: string;
  tipo: string;
  cidade?: string | null;
  uf?: string | null;
}

export const TIPOS_RECINTO: Record<string, string> = { porto: "Porto", porto_seco: "Porto seco", aeroporto: "Aeroporto", fronteira: "Fronteira" };

/** Minúsculas e sem acentos, para buscar "galeao" e achar "Galeão". */
const normalizar = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/** Recintos cujo nome, código, cidade ou UF contêm todas as palavras digitadas. */
export function filtrarRecintos(recintos: Recinto[], busca: string): Recinto[] {
  const palavras = normalizar(busca).split(/\s+/).filter(Boolean);
  if (palavras.length === 0) return [];
  return recintos.filter((r) => {
    const alvo = normalizar(`${r.nome} ${r.codigo} ${r.codigo.replace(/\D/g, "")} ${r.cidade ?? ""} ${r.uf ?? ""} ${TIPOS_RECINTO[r.tipo] ?? ""}`);
    return palavras.every((p) => alvo.includes(p));
  });
}

/** Recinto do cadastro pelo código de 7 dígitos (DI/DUIMP), com ou sem o dígito verificador. */
export function recintoPorCodigo(recintos: Recinto[], codigo: string | number | undefined | null): Recinto | undefined {
  const digitos = String(codigo ?? "").replace(/\D/g, "");
  if (digitos.length < 7) return undefined;
  return recintos.find((r) => r.codigo.replace(/\D/g, "").startsWith(digitos.slice(0, 7)));
}
