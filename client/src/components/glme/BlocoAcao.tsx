import { Loader2, type LucideIcon } from "lucide-react";
import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

interface BlocoAcaoProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icone: LucideIcon;
  titulo: string;
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
  { icone: Icone, titulo, subtitulo, variante = "padrao", carregando, className, disabled, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      disabled={disabled || carregando}
      className={cn(
        "group flex min-h-[92px] w-full flex-col items-start justify-between gap-3 rounded-2xl border p-4 text-left transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        "disabled:cursor-not-allowed disabled:opacity-60",
        estilos[variante],
        className,
      )}
      {...props}
    >
      <span className="bloco-icone flex size-9 items-center justify-center rounded-xl">
        {carregando ? <Loader2 className="size-[18px] animate-spin" /> : <Icone className="size-[18px]" strokeWidth={2} />}
      </span>
      <span>
        <span className="block text-sm font-semibold leading-tight">{titulo}</span>
        {subtitulo && <span className="bloco-sub mt-0.5 block text-xs leading-snug">{subtitulo}</span>}
      </span>
    </button>
  );
});
