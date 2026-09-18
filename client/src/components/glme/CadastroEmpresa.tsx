import { useState } from "react";
import { AlertTriangle, BadgeCheck, CircleDashed, KeyRound, Loader2, Save, ShieldCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";

export interface ChavePortalInformada {
  clientId: string;
  clientSecret: string;
}

interface Props {
  /** Empresa já cadastrada com este CNPJ (ou undefined, se ainda não estiver). */
  cadastro?: { id: number; razaoSocial: string };
  editalDBF: string;
  onEditalChange: (valor: string) => void;
  /** Salva os dados da seção (Receita/SEFAZ), o edital e, se informada, a chave de acesso. */
  onSalvar: (chave?: ChavePortalInformada) => Promise<void>;
  salvando: boolean;
  onExcluir: () => Promise<void>;
  excluindo: boolean;
}

const dataBR = (d: Date | string | null | undefined) => (d ? new Date(d).toLocaleDateString("pt-BR") : "");

/**
 * Cadastro da empresa dentro da seção Importador: edital DBF e chave de acesso do
 * Portal Único ficam guardados com a empresa (o Client-Secret é cifrado no servidor).
 */
export function CadastroEmpresa({ cadastro, editalDBF, onEditalChange, onSalvar, salvando, onExcluir, excluindo }: Props) {
  const utils = trpc.useUtils();
  const chave = trpc.importadores.chavePortal.useQuery(
    { importadorId: cadastro?.id ?? 0 },
    { enabled: Boolean(cadastro) },
  );
  const removerChave = trpc.importadores.removerChavePortal.useMutation({
    onSuccess: () => {
      toast.success("Chave de acesso removida.");
      setConfirmarRemocaoChave(false);
      utils.importadores.chavePortal.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [confirmarRemocaoChave, setConfirmarRemocaoChave] = useState(false);
  const [confirmarExclusao, setConfirmarExclusao] = useState(false);

  const status = cadastro ? chave.data : undefined;
  const podeAlterarChave = !status || status.podeAlterar;

  const salvar = async () => {
    const id = clientId.trim();
    const segredo = clientSecret.trim();
    if (Boolean(id) !== Boolean(segredo)) {
      toast.error("Para salvar a chave de acesso, informe o Client-Id e o Client-Secret.");
      return;
    }
    try {
      await onSalvar(id ? { clientId: id, clientSecret: segredo } : undefined);
      setClientId("");
      setClientSecret("");
    } catch {
      // A mensagem de erro já é exibida por quem salva
    }
  };

  return (
    <div className="mt-5 space-y-4 rounded-xl border bg-background/40 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold text-brand-navy">Cadastro da empresa</h3>
        {cadastro ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-teal-soft px-2.5 py-0.5 text-xs font-medium text-[#00707d]">
            <BadgeCheck className="size-3.5" /> Cadastrada
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
            <CircleDashed className="size-3.5" /> Ainda não cadastrada
          </span>
        )}
      </div>
      <p className="text-sm text-muted-foreground">
        Os dados acima, vindos da Receita Federal e da SEFAZ, são salvos no cadastro junto com o edital DBF e a chave de acesso
        do Portal Único da empresa.
      </p>

      <div className="max-w-xs space-y-1.5">
        <Label htmlFor="cadastro-edital" className="text-[13px] font-medium text-muted-foreground">Edital DBF (credenciamento PEAP)</Label>
        <Input id="cadastro-edital" value={editalDBF} onChange={(e) => onEditalChange(e.target.value)} placeholder="Ex.: 001/2024" />
      </div>

      {/* ===== Chave de acesso do Portal Único ===== */}
      <div className="space-y-3">
        <div>
          <p className="flex items-center gap-2 text-[13px] font-medium text-muted-foreground">
            <KeyRound className="size-3.5" /> Chave de acesso do Portal Único
          </p>
          <p className="text-xs text-muted-foreground">
            Gerada no Portal Único (Perfil do usuário › Chaves de acesso) por quem representa a empresa como importador. O
            Client-Secret fica cifrado no servidor e não é exibido de novo.
          </p>
        </div>

        {cadastro && chave.isLoading && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Carregando…</p>
        )}

        {status?.configurada && (
          <div className="flex flex-col gap-2 rounded-xl border border-brand-teal/30 bg-brand-teal-soft/60 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
            <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <ShieldCheck className="size-4 shrink-0 text-[#00707d]" />
              <span className="font-medium">Chave salva</span>
              <span className="whitespace-nowrap tabular-nums">Client-Id {status.clientId}</span>
              {status.atualizadaEm && <span className="whitespace-nowrap text-muted-foreground">atualizada em {dataBR(status.atualizadaEm)}</span>}
            </span>
            {status.podeAlterar && (confirmarRemocaoChave ? (
              <span className="flex gap-2">
                <Button size="sm" variant="destructive" disabled={removerChave.isPending} onClick={() => cadastro && removerChave.mutate({ importadorId: cadastro.id })}>
                  {removerChave.isPending ? <Loader2 className="animate-spin" /> : <Trash2 />} Confirmar remoção
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirmarRemocaoChave(false)}>Cancelar</Button>
              </span>
            ) : (
              <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setConfirmarRemocaoChave(true)}>
                <Trash2 /> Remover chave
              </Button>
            ))}
          </div>
        )}

        {status && !status.criptografiaDisponivel && (
          <p className="flex gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            O servidor ainda não tem a chave de criptografia configurada (CHAVE_CRIPTOGRAFIA). Não é possível salvar a chave de acesso.
          </p>
        )}

        {podeAlterarChave ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="cadastro-client-id" className="text-xs font-medium text-muted-foreground">
                Client-Id {status?.configurada && "(para substituir)"}
              </Label>
              <Input id="cadastro-client-id" autoComplete="off" spellCheck={false} value={clientId} onChange={(e) => setClientId(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cadastro-client-secret" className="text-xs font-medium text-muted-foreground">Client-Secret</Label>
              <Input id="cadastro-client-secret" type="password" autoComplete="new-password" value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} />
            </div>
          </div>
        ) : (
          <p className="rounded-xl bg-secondary/60 px-3 py-2 text-xs text-muted-foreground">
            Só o administrador ou um usuário vinculado à empresa pode trocar a chave de acesso.
          </p>
        )}
      </div>

      <div className="flex flex-wrap gap-2 border-t pt-4">
        <Button onClick={salvar} disabled={salvando}>
          {salvando ? <Loader2 className="animate-spin" /> : <Save />}
          {cadastro ? "Atualizar cadastro" : "Salvar no cadastro"}
        </Button>
        {cadastro && (confirmarExclusao ? (
          <>
            <Button
              variant="destructive"
              disabled={excluindo}
              onClick={async () => {
                await onExcluir();
                setConfirmarExclusao(false);
              }}
            >
              {excluindo ? <Loader2 className="animate-spin" /> : <Trash2 />} Confirmar exclusão
            </Button>
            <Button variant="ghost" onClick={() => setConfirmarExclusao(false)}>Cancelar</Button>
          </>
        ) : (
          <Button variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setConfirmarExclusao(true)}>
            <Trash2 /> Excluir do cadastro
          </Button>
        ))}
      </div>
    </div>
  );
}
