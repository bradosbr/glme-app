import { AlertTriangle, BadgeCheck, CircleX, ExternalLink, Info, Loader2, RefreshCw, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { LINK_CCC, cadastroDaUF, linkConsultaIE } from "@shared/sefazUF";

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
  /** A SEFAZ da UF não oferece o webservice de consulta cadastral. */
  | { estado: "sem_servico"; uf: string }
  | { estado: "erro"; uf: string; mensagem: string; semCertificado?: boolean };

const dataBR = (iso: string) => {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
};

/** Links para consultar a inscrição estadual à mão: site da SEFAZ da UF e, como reserva, o CCC. */
function LinksConsulta({ uf }: { uf: string }) {
  const link = linkConsultaIE(uf);
  const ehCCC = link === LINK_CCC;
  return (
    <span className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
      <a href={link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-brand-sky hover:underline">
        {ehCCC ? "Consultar no Cadastro Centralizado de Contribuintes (CCC)" : `Consultar no site da SEFAZ-${uf}`}
        <ExternalLink className="size-3.5" />
      </a>
      {!ehCCC && (
        <a href={LINK_CCC} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-muted-foreground hover:text-brand-sky hover:underline">
          ou no CCC nacional (login gov.br) <ExternalLink className="size-3.5" />
        </a>
      )}
    </span>
  );
}

/** Resultado da consulta ao cadastro de contribuintes do ICMS (SEFAZ da UF do importador). */
export function SituacaoCadastral({ consulta, onRepetir }: { consulta: EstadoConsultaSefaz; onRepetir?: () => void }) {
  if (consulta.estado === "inativo") return null;

  if (consulta.estado === "consultando") {
    return (
      <p className="flex items-center gap-2 rounded-xl bg-secondary/60 px-4 py-3 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Consultando a inscrição estadual na SEFAZ-{consulta.uf}…
      </p>
    );
  }

  if (consulta.estado === "encontrado") {
    return (
      <div className="space-y-2">
        <ul className="space-y-2">
          {consulta.cadastros.map((c) => (
            <li
              key={c.inscricaoEstadual}
              className={cn(
                "flex flex-col gap-1 rounded-xl border px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between",
                c.habilitado ? "border-brand-teal/30 bg-brand-teal-soft/60" : "border-destructive/30 bg-destructive/5",
              )}
            >
              <span className="flex flex-wrap items-center gap-x-2 font-medium">
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
        <p className="text-xs">
          <a href={linkConsultaIE(consulta.uf)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-muted-foreground hover:text-brand-sky hover:underline">
            Conferir no site da SEFAZ-{consulta.uf} <ExternalLink className="size-3" />
          </a>
        </p>
      </div>
    );
  }

  const nome = cadastroDaUF(consulta.uf)?.nome ?? consulta.uf;
  const semCertificado = consulta.estado === "erro" && consulta.semCertificado;
  const Icone = consulta.estado === "sem_servico" ? Info : semCertificado ? ShieldAlert : AlertTriangle;
  const mensagem =
    consulta.estado === "sem_servico"
      ? `A SEFAZ-${consulta.uf} (${nome}) não oferece consulta automática da inscrição estadual. Consulte no site oficial:`
      : semCertificado
        ? "Consulta automática indisponível: o certificado digital A1 não está configurado no servidor. Consulte no site oficial:"
        : `${consulta.mensagem} Se preferir, consulte no site oficial:`;
  const podeRepetir = consulta.estado !== "sem_servico" && !semCertificado && onRepetir;

  return (
    <div
      className={cn(
        "flex items-start justify-between gap-3 rounded-xl border px-4 py-3 text-sm",
        consulta.estado === "sem_servico" ? "border-brand-sky/30 bg-brand-sky-soft/50 text-foreground" : "border-amber-200 bg-amber-50 text-amber-900",
      )}
    >
      <div className="flex gap-2">
        <Icone className="mt-0.5 size-4 shrink-0" />
        <div>
          {consulta.estado !== "sem_servico" && <strong className="font-medium">SEFAZ-{consulta.uf}: </strong>}
          {mensagem}
          <LinksConsulta uf={consulta.uf} />
        </div>
      </div>
      {podeRepetir && (
        <Button variant="ghost" size="sm" onClick={onRepetir} className="shrink-0">
          <RefreshCw /> Repetir
        </Button>
      )}
    </div>
  );
}
