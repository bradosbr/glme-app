import { AlertTriangle, Package } from "lucide-react";
import type { ItemAdicao } from "@/hooks/useGLMEForm";
import { consultarAliquotaNCM, formatarMoeda, type NivelNCM } from "@/lib/aliquotasICMS";
import { formatarAliquota, formatarDivisor, type AdicaoCalculada } from "@/lib/calculoICMS";
import { ncmNaListaNegativa } from "@/lib/listaNegativa";
import { cn } from "@/lib/utils";

const NIVEL: Record<NivelNCM, string> = {
  ncm: "pela NCM completa",
  subitem: "pelo subitem",
  subposicao: "pela subposição",
  posicao: "pela posição",
  capitulo: "pelo capítulo",
};

const formatarPct = (v: number) => `${v.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;

interface AdicaoFiscalProps {
  ncm: string;
  itens?: ItemAdicao[];
  descricao?: string;
  /** true quando a adição foi lançada na GLME (diferimento). */
  naGLME: boolean;
  /** Cálculo da adição, quando há os valores de cada adição. */
  calculo?: AdicaoCalculada;
}

/**
 * Situação fiscal da adição, sempre consultada pela NCM:
 * regime (diferimento x tributação normal), alíquota de recolhimento
 * (Anexo I em qualquer nível ou padrão) e os itens da DUIMP que a compõem.
 */
export function AdicaoFiscal({ ncm, itens, descricao, naGLME, calculo }: AdicaoFiscalProps) {
  const ncmLimpo = (ncm || "").replace(/\D/g, "");
  const temNCM = ncmLimpo.length >= 4;
  const consulta = consultarAliquotaNCM(ncmLimpo);
  const listaNegativa = temNCM && ncmNaListaNegativa(ncmLimpo);
  const listaItens = itens ?? [];

  return (
    <div className="space-y-3">
      {temNCM ? (
        <div className="grid gap-3 sm:grid-cols-[auto_1fr] sm:items-center">
          <div className="rounded-xl bg-brand-sky-soft px-4 py-3 text-brand-navy sm:min-w-[150px]">
            <p className="text-[11px] font-medium uppercase tracking-wide text-brand-navy/70">Alíquota de recolhimento</p>
            <p className="tabular-nums text-2xl font-semibold leading-tight">{formatarPct(consulta.aliquota)}</p>
          </div>
          <div className="space-y-1.5 text-sm">
            <span
              className={cn(
                "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
                listaNegativa ? "bg-amber-100 text-amber-900" : "bg-brand-teal-soft text-[#00707d]",
              )}
            >
              {listaNegativa ? "Tributação normal · lista negativa" : "Diferimento (PEAP)"}
            </span>
            <p className="text-muted-foreground">
              {consulta.regra
                ? <>Anexo I, item {consulta.regra.item} {consulta.nivel && NIVEL[consulta.nivel]} — {consulta.regra.descricao}</>
                : "Alíquota padrão: NCM e capítulo sem regra específica no Anexo I"}
            </p>
            {calculo && (
              <div>
                <p className="font-medium text-foreground">
                  {naGLME ? "ICMS diferido" : "ICMS a recolher"}: R$ {formatarMoeda(calculo.icms)}
                </p>
                <p className="tabular-nums text-xs text-muted-foreground">
                  VT R$ {formatarMoeda(calculo.valorPartida)} ÷ {formatarDivisor(calculo.divisor)} = VTI R$ {formatarMoeda(calculo.baseCalculo)} × {formatarAliquota(calculo.aliquota)}
                  {calculo.despesas.total > 0 && ` · despesas rateadas R$ ${formatarMoeda(calculo.despesas.total)}`}
                </p>
              </div>
            )}
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Informe a NCM para consultar regime e alíquota.</p>
      )}

      {consulta.alternativas.length > 0 && (
        <Aviso>
          A NCM também consta no Anexo I com{" "}
          {consulta.alternativas.map((a) => `${formatarPct(a.aliquota)} (item ${a.item} — ${a.descricao})`).join("; ")}.
          Confirme a alíquota conforme a mercadoria.
        </Aviso>
      )}

      {naGLME && listaNegativa && (
        <Aviso>
          NCM na lista negativa do Edital 060/2025: tributação normal com recolhimento integral.
          Esta adição não deveria constar na GLME.
        </Aviso>
      )}

      {listaItens.length > 0 ? (
        <div>
          <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <Package className="size-3.5" /> Itens da DUIMP ({listaItens.length})
          </p>
          <ul className="divide-y rounded-xl border bg-background/60 text-sm">
            {listaItens.map((item, i) => (
              <li key={`${item.numero}-${i}`} className="flex gap-3 px-3 py-2">
                <span className="tabular-nums w-14 shrink-0 text-muted-foreground">Item {item.numero}</span>
                <span className="min-w-0 break-words">{item.descricao || "—"}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : descricao ? (
        <p className="text-sm">
          <span className="text-muted-foreground">Mercadoria: </span>
          {descricao}
        </p>
      ) : null}
    </div>
  );
}

function Aviso({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
      <span>{children}</span>
    </p>
  );
}
