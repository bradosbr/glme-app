import { useState } from "react";
import { Building2, Loader2, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";

interface Props {
  /** Usuário que recebe as empresas; null fecha a janela. */
  usuario: { id: number; username: string | null; name: string | null } | null;
  onOpenChange: (open: boolean) => void;
}

/**
 * Delegação de empresas (só administrador): escolhe por quais empresas do cadastro
 * o usuário responde. Sem a delegação, ele não vê a empresa nem usa a chave dela.
 */
export function EmpresasDoUsuarioDialog({ usuario, onOpenChange }: Props) {
  const utils = trpc.useUtils();
  const [escolhida, setEscolhida] = useState("");

  const delegadas = trpc.usuarios.empresas.useQuery({ userId: usuario?.id ?? 0 }, { enabled: Boolean(usuario) });
  const cadastro = trpc.importadores.listar.useQuery(undefined, { enabled: Boolean(usuario) });

  const invalidar = () => {
    utils.usuarios.empresas.invalidate();
    utils.conta.empresas.invalidate();
    utils.importadores.comChavePortal.invalidate();
  };
  const vincular = trpc.usuarios.vincularEmpresa.useMutation({
    onSuccess: () => { setEscolhida(""); invalidar(); },
    onError: (e) => toast.error(e.message),
  });
  const desvincular = trpc.usuarios.desvincularEmpresa.useMutation({
    onSuccess: invalidar,
    onError: (e) => toast.error(e.message),
  });

  const lista = delegadas.data ?? [];
  const jaTem = new Set(lista.map((e) => e.id));
  const disponiveis = (cadastro.data ?? []).filter((i) => !jaTem.has(i.id));

  return (
    <Dialog open={Boolean(usuario)} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-brand-navy">Empresas de {usuario?.name || usuario?.username}</DialogTitle>
          <DialogDescription>
            O usuário só vê, usa na guia e consulta a DUIMP das empresas delegadas a ele.
          </DialogDescription>
        </DialogHeader>

        {delegadas.isLoading ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Carregando…</p>
        ) : lista.length === 0 ? (
          <p className="flex items-center gap-2 rounded-xl bg-secondary/60 px-4 py-3 text-sm text-muted-foreground">
            <Building2 className="size-4 shrink-0" /> Nenhuma empresa delegada a este usuário.
          </p>
        ) : (
          <ul className="divide-y rounded-xl border">
            {lista.map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium">{e.razaoSocial}</p>
                  <p className="tabular-nums text-xs text-muted-foreground">{e.cnpj}{e.uf ? ` · ${e.uf}` : ""}</p>
                </div>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remover ${e.razaoSocial}`}
                  title="Tirar a empresa deste usuário"
                  className="text-muted-foreground hover:text-destructive"
                  disabled={desvincular.isPending}
                  onClick={() => usuario && desvincular.mutate({ userId: usuario.id, importadorId: e.id })}
                >
                  <X />
                </Button>
              </li>
            ))}
          </ul>
        )}

        {disponiveis.length > 0 ? (
          <div className="flex flex-col gap-2 sm:flex-row">
            <Select value={escolhida} onValueChange={setEscolhida}>
              <SelectTrigger className="w-full sm:flex-1"><SelectValue placeholder="Escolher empresa do cadastro" /></SelectTrigger>
              <SelectContent>
                {disponiveis.map((i) => (
                  <SelectItem key={i.id} value={String(i.id)}>{i.razaoSocial}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              disabled={!escolhida || vincular.isPending}
              onClick={() => usuario && vincular.mutate({ userId: usuario.id, importadorId: Number(escolhida) })}
            >
              {vincular.isPending ? <Loader2 className="animate-spin" /> : <Plus />} Delegar
            </Button>
          </div>
        ) : (
          !cadastro.isLoading && lista.length > 0 && (
            <p className="text-xs text-muted-foreground">Todas as empresas do cadastro já estão com este usuário.</p>
          )
        )}
      </DialogContent>
    </Dialog>
  );
}
