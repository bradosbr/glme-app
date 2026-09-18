import { useState } from "react";
import { AlertTriangle, Building2, FileBadge, Loader2, Plus, ShieldCheck, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";

interface ImportadorResumo {
  id: number;
  razaoSocial: string;
  cnpj: string;
  uf?: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Cadastro de importadores, para escolher empresas a vincular. */
  importadores: ImportadorResumo[];
}

/** Empresas pelas quais o usuário responde ("minhas empresas"). */
export function MinhaContaDialog({ open, onOpenChange, importadores }: Props) {
  const utils = trpc.useUtils();
  const empresas = trpc.conta.empresas.useQuery(undefined, { enabled: open });
  // Certificado A1 do servidor para as consultas à SEFAZ: só titular e validade, nunca o arquivo
  const certificado = trpc.sefaz.certificado.useQuery(undefined, { enabled: open });
  const [empresaEscolhida, setEmpresaEscolhida] = useState("");

  const vincular = trpc.conta.vincularEmpresa.useMutation({
    onSuccess: () => {
      setEmpresaEscolhida("");
      utils.conta.empresas.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const desvincular = trpc.conta.desvincularEmpresa.useMutation({
    onSuccess: () => utils.conta.empresas.invalidate(),
    onError: (e) => toast.error(e.message),
  });

  const vinculadas = empresas.data ?? [];
  const idsVinculados = new Set(vinculadas.map((e) => e.id));
  const disponiveis = importadores.filter((i) => !idsVinculados.has(i.id));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-brand-navy">Minha conta</DialogTitle>
          <DialogDescription>Empresas pelas quais você responde e o certificado usado nas consultas à SEFAZ.</DialogDescription>
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
              Nenhuma empresa vinculada. Ao cadastrar uma empresa na seção Importador, ela entra aqui automaticamente.
            </p>
          ) : (
            <ul className="divide-y rounded-xl border">
              {vinculadas.map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{e.razaoSocial}</p>
                    <p className="tabular-nums text-xs text-muted-foreground">{e.cnpj}{e.uf ? ` · ${e.uf}` : ""}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Desvincular ${e.razaoSocial}`}
                    title="Desvincular"
                    className="text-muted-foreground hover:text-destructive"
                    disabled={desvincular.isPending}
                    onClick={() => desvincular.mutate({ importadorId: e.id })}
                  >
                    <X />
                  </Button>
                </li>
              ))}
            </ul>
          )}

          {disponiveis.length > 0 && (
            <div className="flex flex-col gap-2 sm:flex-row">
              <Select value={empresaEscolhida} onValueChange={setEmpresaEscolhida}>
                <SelectTrigger className="w-full sm:flex-1">
                  <SelectValue placeholder="Escolher empresa do cadastro" />
                </SelectTrigger>
                <SelectContent>
                  {disponiveis.map((i) => (
                    <SelectItem key={i.id} value={String(i.id)}>{i.razaoSocial}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                disabled={!empresaEscolhida || vincular.isPending}
                onClick={() => vincular.mutate({ importadorId: Number(empresaEscolhida) })}
              >
                {vincular.isPending ? <Loader2 className="animate-spin" /> : <Plus />} Vincular
              </Button>
            </div>
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
