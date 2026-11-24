import { AlertTriangle, Building2, FileBadge, Loader2, ShieldCheck } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Empresas delegadas ao usuário pelo administrador ("minhas empresas"), só para consulta. */
export function MinhaContaDialog({ open, onOpenChange }: Props) {
  const empresas = trpc.conta.empresas.useQuery(undefined, { enabled: open });
  // Certificado A1 do servidor para as consultas à SEFAZ: só titular e validade, nunca o arquivo
  const certificado = trpc.sefaz.certificado.useQuery(undefined, { enabled: open });

  const vinculadas = empresas.data ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-brand-navy">Minha conta</DialogTitle>
          <DialogDescription>Empresas que o administrador delegou a você e o certificado usado nas consultas à SEFAZ.</DialogDescription>
        </DialogHeader>

        {/* ===== Minhas empresas ===== */}
        <section className="space-y-3">
          <h3 className="flex items-center gap-2 font-semibold text-brand-navy">
            <Building2 className="size-4" /> Minhas empresas
          </h3>
          {empresas.isLoading ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Carregando…</p>
          ) : vinculadas.length === 0 ? (
            <p className="rounded-xl bg-secondary/60 px-4 py-3 text-sm text-muted-foreground">
              Nenhuma empresa delegada a você. O administrador cadastra as empresas e escolhe quem responde por cada uma.
            </p>
          ) : (
            <ul className="divide-y rounded-xl border">
              {vinculadas.map((e) => (
                <li key={e.id} className="px-3 py-2.5 text-sm">
                  <p className="truncate font-medium">{e.razaoSocial}</p>
                  <p className="tabular-nums text-xs text-muted-foreground">{e.cnpj}{e.uf ? ` · ${e.uf}` : ""}</p>
                </li>
              ))}
            </ul>
          )}

        </section>

        {/* ===== Certificado digital (consultas à SEFAZ) ===== */}
        <section className="space-y-3 border-t pt-5">
          <h3 className="flex items-center gap-2 font-semibold text-brand-navy">
            <FileBadge className="size-4" /> Certificado digital (consultas à SEFAZ)
          </h3>
          {certificado.isLoading ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Carregando…</p>
          ) : !certificado.data?.configurado ? (
            <p className="rounded-xl bg-secondary/60 px-4 py-3 text-sm text-muted-foreground">
              Nenhum certificado configurado no servidor. Sem ele, a inscrição estadual não é consultada automaticamente
              e a tela indica o site da SEFAZ. O administrador configura o e-CNPJ A1 nas variáveis do servidor.
            </p>
          ) : certificado.data.erro ? (
            <p className="flex gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" /> {certificado.data.erro}
            </p>
          ) : (
            <div
              className={
                certificado.data.expirado
                  ? "flex gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm"
                  : "flex gap-2 rounded-xl border border-brand-teal/30 bg-brand-teal-soft/60 px-4 py-3 text-sm"
              }
            >
              {certificado.data.expirado
                ? <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
                : <ShieldCheck className="mt-0.5 size-4 shrink-0 text-[#00707d]" />}
              <div className="min-w-0">
                <p className="break-words font-medium">{certificado.data.titular}</p>
                <p className="text-muted-foreground">
                  {certificado.data.expirado ? "Vencido em " : "Válido até "}
                  {certificado.data.validoAte ? new Date(certificado.data.validoAte).toLocaleDateString("pt-BR") : "?"}
                  {certificado.data.emissor && ` · ${certificado.data.emissor}`}
                </p>
              </div>
            </div>
          )}
        </section>
      </DialogContent>
    </Dialog>
  );
}
