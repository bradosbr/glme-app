import { Loader2, type LucideIcon } from "lucide-react";
import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

interface BlocoAcaoProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icone: LucideIcon;
  titulo: string;
  /** Rótulo usado na barra compacta do celular; sem ele, usa o título. */
  rotuloCurto?: string;
  subtitulo?: string;
  variante?: "principal" | "padrao" | "perigo";
  carregando?: boolean;
}

const estilos = {
  principal: "bg-brand-navy text-white border-brand-navy hover:bg-brand-navy-hover [&_.bloco-icone]:bg-white/12 [&_.bloco-sub]:text-white/70",
  padrao: "bg-card text-brand-navy border-border hover:border-brand-sky/50 hover:bg-brand-sky-soft/60 [&_.bloco-icone]:bg-brand-sky-soft [&_.bloco-icone]:text-brand-navy [&_.bloco-sub]:text-muted-foreground",
  perigo: "bg-card text-destructive border-border hover:border-destructive/40 hover:bg-destructive/5 [&_.bloco-icone]:bg-destructive/10 [&_.bloco-sub]:text-muted-foreground",
};

/** Botão em bloco com ícone, usado na barra de ações principal. */
export const BlocoAcao = forwardRef<HTMLButtonElement, BlocoAcaoProps>(function BlocoAcao(
  { icone: Icone, titulo, rotuloCurto, subtitulo, variante = "padrao", carregando, className, disabled, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      disabled={disabled || carregando}
      className={cn(
        "group flex w-full items-center rounded-2xl border transition-colors",
        // Barra fixa: ícone acima do rótulo no celular, lado a lado a partir de sm
        "flex-col justify-center gap-1 p-2 text-center",
        "sm:flex-row sm:justify-start sm:gap-2.5 sm:px-3 sm:py-2.5 sm:text-left",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        "disabled:cursor-not-allowed disabled:opacity-60",
        estilos[variante],
        className,
      )}
      {...props}
    >
      <span className="bloco-icone flex size-8 items-center justify-center rounded-xl sm:size-9">
        {carregando ? <Loader2 className="size-[18px] animate-spin" /> : <Icone className="size-[18px]" strokeWidth={2} />}
      </span>
      <span className="min-w-0">
        <span className="block text-[11px] font-semibold leading-tight sm:hidden">{rotuloCurto ?? titulo}</span>
        <span className="hidden text-sm font-semibold leading-tight sm:block">{titulo}</span>
        {subtitulo && <span className="bloco-sub mt-0.5 hidden text-xs leading-snug sm:block">{subtitulo}</span>}
      </span>
    </button>
  );
});
