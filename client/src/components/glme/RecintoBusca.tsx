import { useId, useMemo, useState, type KeyboardEvent } from "react";
import { MapPinned } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { filtrarRecintos, TIPOS_RECINTO, type Recinto } from "@/lib/recintos";

const MAX_RESULTADOS = 8;

export type { Recinto };

interface Props {
  id: string;
  recintos: Recinto[];
  nome: string;
  onNomeChange: (nome: string) => void;
  onSelecionar: (recinto: Recinto) => void;
}

/** Campo do recinto alfandegado com busca no cadastro enquanto se digita. */
export function RecintoBusca({ id, recintos, nome, onNomeChange, onSelecionar }: Props) {
  const idLista = useId();
  const [aberto, setAberto] = useState(false);
  const [ativo, setAtivo] = useState(0);
  const resultados = useMemo(() => filtrarRecintos(recintos, nome).slice(0, MAX_RESULTADOS), [recintos, nome]);
  const mostrar = aberto && nome.trim().length >= 2;

  const selecionar = (r: Recinto) => {
    onSelecionar(r);
    setAberto(false);
  };

  const teclas = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!mostrar || resultados.length === 0) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setAtivo((a) => (a + 1) % resultados.length); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setAtivo((a) => (a - 1 + resultados.length) % resultados.length); }
    else if (e.key === "Enter") { e.preventDefault(); selecionar(resultados[ativo]); }
    else if (e.key === "Escape") setAberto(false);
  };

  return (
    <div className="relative">
      <Input
        id={id}
        role="combobox"
        aria-expanded={mostrar}
        aria-controls={idLista}
        aria-autocomplete="list"
        autoComplete="off"
        placeholder="Digite o nome, a cidade ou o código"
        value={nome}
        onChange={(e) => { onNomeChange(e.target.value); setAberto(true); setAtivo(0); }}
        onFocus={() => setAberto(true)}
        onBlur={() => setTimeout(() => setAberto(false), 150)}
        onKeyDown={teclas}
      />
      {mostrar && (
        <ul
          id={idLista}
          role="listbox"
          className="absolute z-50 mt-1 max-h-72 w-full overflow-y-auto rounded-xl border bg-popover p-1 text-sm shadow-lg"
        >
          {resultados.length === 0 ? (
            <li className="px-3 py-2 text-muted-foreground">Nenhum recinto encontrado no cadastro.</li>
          ) : (
            resultados.map((r, i) => (
              <li
                key={r.id}
                role="option"
                aria-selected={i === ativo}
                onMouseDown={(e) => { e.preventDefault(); selecionar(r); }}
                onMouseEnter={() => setAtivo(i)}
                className={cn("flex cursor-pointer gap-2.5 rounded-lg px-3 py-2", i === ativo && "bg-brand-sky-soft")}
              >
                <MapPinned className="mt-0.5 size-4 shrink-0 text-brand-sky" />
                <span className="min-w-0">
                  <span className="block truncate font-medium text-foreground">{r.nome}</span>
                  <span className="block text-xs text-muted-foreground">
                    <span className="tabular-nums">{r.codigo}</span>
                    {r.cidade && ` · ${r.cidade}`}{r.uf && `/${r.uf}`}
                    {TIPOS_RECINTO[r.tipo] && ` · ${TIPOS_RECINTO[r.tipo]}`}
                  </span>
                </span>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
