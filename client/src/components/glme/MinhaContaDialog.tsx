import { useState } from "react";
import { AlertTriangle, Building2, KeyRound, Loader2, Plus, ShieldCheck, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

const dataBR = (d: Date | string | null | undefined) => (d ? new Date(d).toLocaleDateString("pt-BR") : "");

/** Chave de acesso do Portal Único e empresas pelas quais o usuário responde. */
export function MinhaContaDialog({ open, onOpenChange, importadores }: Props) {
  const utils = trpc.useUtils();
  const chave = trpc.conta.chavePortal.useQuery(undefined, { enabled: open });
  const empresas = trpc.conta.empresas.useQuery(undefined, { enabled: open });

  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [confirmarRemocao, setConfirmarRemocao] = useState(false);
  const [empresaEscolhida, setEmpresaEscolhida] = useState("");

  const salvar = trpc.conta.salvarChavePortal.useMutation({
    onSuccess: () => {
      toast.success("Chave de acesso salva.");
      setClientId("");
      setClientSecret("");
      utils.conta.chavePortal.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const remover = trpc.conta.removerChavePortal.useMutation({
    onSuccess: () => {
      toast.success("Chave de acesso removida.");
      setConfirmarRemocao(false);
      utils.conta.chavePortal.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
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
  const status = chave.data;

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) setConfirmarRemocao(false); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-brand-navy">Minha conta</DialogTitle>
          <DialogDescription>Chave de acesso do Portal Único e empresas pelas quais você responde.</DialogDescription>
        </DialogHeader>

        {/* ===== Chave de acesso ===== */}
        <section className="space-y-3">
          <h3 className="flex items-center gap-2 font-semibold text-brand-navy">
            <KeyRound className="size-4" /> Chave de acesso do Portal Único
          </h3>
          <p className="text-sm text-muted-foreground">
            Gere a chave no Portal Único (Perfil do usuário › Chaves de acesso), entrando com o seu e-CPF. É preciso ter
            representação da empresa no perfil de importador. O Client-Secret fica cifrado no servidor e não é exibido de novo.
          </p>

          {chave.isLoading ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Carregando…</p>
          ) : status?.configurada ? (
            <div className="flex flex-col gap-2 rounded-xl border border-brand-teal/30 bg-brand-teal-soft/60 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
              <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <ShieldCheck className="size-4 shrink-0 text-[#00707d]" />
                <span className="font-medium">Chave salva</span>
                <span className="whitespace-nowrap tabular-nums">Client-Id {status.clientId}</span>
                {status.atualizadaEm && <span className="whitespace-nowrap text-muted-foreground">atualizada em {dataBR(status.atualizadaEm)}</span>}
              </span>
              {confirmarRemocao ? (
                <span className="flex gap-2">
                  <Button size="sm" variant="destructive" disabled={remover.isPending} onClick={() => remover.mutate()}>
                    {remover.isPending ? <Loader2 className="animate-spin" /> : <Trash2 />} Confirmar remoção
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setConfirmarRemocao(false)}>Cancelar</Button>
                </span>
              ) : (
                <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setConfirmarRemocao(true)}>
                  <Trash2 /> Remover
                </Button>
              )}
            </div>
          ) : (
            <p className="rounded-xl bg-secondary/60 px-4 py-3 text-sm text-muted-foreground">Nenhuma chave salva.</p>
          )}

          {status && !status.criptografiaDisponivel && (
            <p className="flex gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              O servidor ainda não tem a chave de criptografia configurada (CHAVE_CRIPTOGRAFIA). Não é possível salvar a chave de acesso.
            </p>
          )}

          <form
            className="grid gap-3 sm:grid-cols-2"
            autoComplete="off"
            onSubmit={(e) => {
              e.preventDefault();
              salvar.mutate({ clientId, clientSecret });
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="conta-client-id" className="text-[13px] font-medium text-muted-foreground">Client-Id</Label>
              <Input id="conta-client-id" autoComplete="off" spellCheck={false} value={clientId} onChange={(e) => setClientId(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="conta-client-secret" className="text-[13px] font-medium text-muted-foreground">Client-Secret</Label>
              <Input id="conta-client-secret" type="password" autoComplete="new-password" value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <Button type="submit" disabled={!clientId.trim() || !clientSecret.trim() || salvar.isPending || status?.criptografiaDisponivel === false}>
                {salvar.isPending ? <Loader2 className="animate-spin" /> : <KeyRound />}
                {status?.configurada ? "Substituir chave" : "Salvar chave"}
              </Button>
            </div>
          </form>
        </section>

        {/* ===== Minhas empresas ===== */}
        <section className="space-y-3 border-t pt-5">
          <h3 className="flex items-center gap-2 font-semibold text-brand-navy">
            <Building2 className="size-4" /> Minhas empresas
          </h3>
          {empresas.isLoading ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Carregando…</p>
          ) : vinculadas.length === 0 ? (
            <p className="rounded-xl bg-secondary/60 px-4 py-3 text-sm text-muted-foreground">
              Nenhuma empresa vinculada. Ao cadastrar um importador, ele entra aqui automaticamente.
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
      </DialogContent>
    </Dialog>
  );
}
