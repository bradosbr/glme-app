import { AlertTriangle, BadgeCheck, CircleX, Loader2, RefreshCw, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface CadastroSefaz {
  inscricaoEstadual: string;
  habilitado: boolean;
  situacao: string;
  razaoSocial: string;
  regimeApuracao: string;
  cnae: string;
  dataSituacao: string;
  dataBaixa: string;
}

export type EstadoConsultaSefaz =
  | { estado: "inativo" }
  | { estado: "consultando"; uf: string }
  | { estado: "encontrado"; uf: string; cadastros: CadastroSefaz[] }
  | { estado: "nao_encontrado"; uf: string; mensagem: string }
  | { estado: "erro"; uf: string; mensagem: string; semCertificado?: boolean };

const dataBR = (iso: string) => {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
};

/** Resultado da consulta ao cadastro de contribuintes do ICMS (SEFAZ). */
export function SituacaoCadastral({ consulta, onRepetir }: { consulta: EstadoConsultaSefaz; onRepetir?: () => void }) {
  if (consulta.estado === "inativo") return null;

  if (consulta.estado === "consultando") {
    return (
      <p className="flex items-center gap-2 rounded-xl bg-secondary/60 px-4 py-3 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Consultando a inscrição estadual na SEFAZ-{consulta.uf}…
      </p>
    );
  }

  if (consulta.estado === "erro" || consulta.estado === "nao_encontrado") {
    const Icone = consulta.estado === "erro" && consulta.semCertificado ? ShieldAlert : AlertTriangle;
    return (
      <div className="flex items-start justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        <p className="flex gap-2">
          <Icone className="mt-0.5 size-4 shrink-0" />
          <span>
            <strong className="font-medium">SEFAZ-{consulta.uf}:</strong> {consulta.mensagem}
          </span>
        </p>
        {onRepetir && consulta.estado === "erro" && !consulta.semCertificado && (
          <Button variant="ghost" size="sm" onClick={onRepetir} className="shrink-0 text-amber-900 hover:bg-amber-100">
            <RefreshCw /> Repetir
          </Button>
        )}
      </div>
    );
  }

  return (
    <ul className="space-y-2">
      {consulta.cadastros.map((c) => (
        <li
          key={c.inscricaoEstadual}
          className={cn(
            "flex flex-col gap-1 rounded-xl border px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between",
            c.habilitado ? "border-brand-teal/30 bg-brand-teal-soft/60" : "border-destructive/30 bg-destructive/5",
          )}
        >
          <span className="flex items-center gap-2 font-medium">
            {c.habilitado ? <BadgeCheck className="size-4 text-[#00707d]" /> : <CircleX className="size-4 text-destructive" />}
            IE {c.inscricaoEstadual} · {c.situacao}
            {c.dataSituacao && <span className="font-normal text-muted-foreground">desde {dataBR(c.dataSituacao)}</span>}
          </span>
          <span className="text-muted-foreground">
            SEFAZ-{consulta.uf}
            {c.regimeApuracao && ` · ${c.regimeApuracao}`}
            {c.dataBaixa && ` · baixa em ${dataBR(c.dataBaixa)}`}
          </span>
        </li>
      ))}
    </ul>
  );
}
