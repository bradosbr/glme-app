import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

interface SecaoProps {
  id: string;
  icone: LucideIcon;
  titulo: string;
  descricao?: string;
  acoes?: ReactNode;
  children: ReactNode;
}

/** Bloco de conteúdo da página única, com âncora para a navegação. */
export function Secao({ id, icone: Icone, titulo, descricao, acoes, children }: SecaoProps) {
  return (
    <section id={id} className="scroll-mt-[var(--deslocamento-ancora,10rem)] rounded-2xl border bg-card p-5 shadow-[0_1px_2px_rgba(16,50,98,0.04)] sm:p-6">
      <header className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand-sky-soft text-brand-navy">
            <Icone className="size-[18px]" strokeWidth={2} />
          </span>
          <div>
            <h2 className="text-base font-semibold tracking-tight text-brand-navy sm:text-lg">{titulo}</h2>
            {descricao && <p className="mt-0.5 text-sm text-muted-foreground">{descricao}</p>}
          </div>
        </div>
        {acoes && <div className="flex flex-wrap gap-2 sm:justify-end">{acoes}</div>}
      </header>
      {children}
    </section>
  );
}
