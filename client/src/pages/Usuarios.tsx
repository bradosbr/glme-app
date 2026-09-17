import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  ArrowLeft,
  Plus,
  KeyRound,
  Trash2,
  Loader2,
  UserPlus,
  ShieldCheck,
  ShieldOff,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import { TRPCClientError } from "@trpc/client";

type UsuarioRow = {
  id: number;
  username: string | null;
  name: string | null;
  email: string | null;
  role: "user" | "admin";
  active: boolean;
  resetRequested: boolean;
  lastSignedIn: Date;
};

export default function Usuarios() {
  const [, navigate] = useLocation();
  const { user: currentUser } = useAuth();
  const utils = trpc.useUtils();
  const usuariosQuery = trpc.usuarios.listar.useQuery();

  const [showCriar, setShowCriar] = useState(false);
  const [resetTarget, setResetTarget] = useState<UsuarioRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<UsuarioRow | null>(null);

  // ----- Criar usuário -----
  const [novo, setNovo] = useState({ username: "", name: "", email: "", password: "", role: "user" as "user" | "admin" });
  const criarMutation = trpc.usuarios.criar.useMutation({
    onSuccess: () => {
      toast.success("Usuário criado.");
      setShowCriar(false);
      setNovo({ username: "", name: "", email: "", password: "", role: "user" });
      utils.usuarios.listar.invalidate();
    },
    onError: err => toast.error(err instanceof TRPCClientError ? err.message : "Erro ao criar usuário"),
  });

  // ----- Redefinir senha -----
  const [novaSenha, setNovaSenha] = useState("");
  const resetMutation = trpc.usuarios.redefinirSenha.useMutation({
    onSuccess: () => {
      toast.success("Senha redefinida.");
      setResetTarget(null);
      setNovaSenha("");
      utils.usuarios.listar.invalidate();
    },
    onError: err => toast.error(err instanceof TRPCClientError ? err.message : "Erro ao redefinir senha"),
  });

  const atualizarMutation = trpc.usuarios.atualizar.useMutation({
    onSuccess: () => utils.usuarios.listar.invalidate(),
    onError: err => toast.error(err instanceof TRPCClientError ? err.message : "Erro ao atualizar"),
  });

  const excluirMutation = trpc.usuarios.excluir.useMutation({
    onSuccess: () => {
      toast.success("Usuário excluído.");
      setDeleteTarget(null);
      utils.usuarios.listar.invalidate();
    },
    onError: err => toast.error(err instanceof TRPCClientError ? err.message : "Erro ao excluir"),
  });

  const usuarios = (usuariosQuery.data ?? []) as UsuarioRow[];

  const handleCriar = (e: React.FormEvent) => {
    e.preventDefault();
    if (!novo.username.trim() || novo.password.length < 6) {
      toast.error("Usuário obrigatório e senha com ao menos 6 caracteres.");
      return;
    }
    criarMutation.mutate({
      username: novo.username.trim(),
      password: novo.password,
      name: novo.name.trim() || undefined,
      email: novo.email.trim() || undefined,
      role: novo.role,
    });
  };

  return (
    <div className="min-h-screen bg-background p-4 md:p-6">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
          <div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" className="gap-1 -ml-2" onClick={() => navigate("/")}>
                <ArrowLeft className="w-4 h-4" />
                Voltar
              </Button>
            </div>
            <h1 className="text-2xl font-bold text-brand-navy mt-1">Usuários</h1>
            <p className="text-muted-foreground text-sm">Gerencie o acesso ao sistema</p>
          </div>
          <Button className="gap-2" onClick={() => setShowCriar(true)}>
            <UserPlus className="w-4 h-4" />
            Novo usuário
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base text-foreground">
              {usuariosQuery.isLoading ? "Carregando..." : `${usuarios.length} usuário(s)`}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Usuário</TableHead>
                    <TableHead>Nome</TableHead>
                    <TableHead>E-mail</TableHead>
                    <TableHead>Papel</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {usuarios.map(u => {
                    const isSelf = currentUser?.id === u.id;
                    return (
                      <TableRow key={u.id}>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            {u.username}
                            {isSelf && <Badge variant="secondary" className="text-[10px]">você</Badge>}
                            {u.resetRequested && (
                              <Badge variant="destructive" className="gap-1 text-[10px]">
                                <AlertCircle className="w-3 h-3" />
                                pediu reset
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{u.name}</TableCell>
                        <TableCell className="text-muted-foreground">{u.email || "—"}</TableCell>
                        <TableCell>
                          <Badge variant={u.role === "admin" ? "default" : "outline"}>
                            {u.role === "admin" ? "Admin" : "Usuário"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={u.active ? "secondary" : "outline"} className={u.active ? "text-green-700" : "text-muted-foreground"}>
                            {u.active ? "Ativo" : "Inativo"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              title="Redefinir senha"
                              onClick={() => { setResetTarget(u); setNovaSenha(""); }}
                            >
                              <KeyRound className="w-4 h-4" />
                            </Button>
                            {!isSelf && (
                              <Button
                                variant="ghost"
                                size="sm"
                                title={u.role === "admin" ? "Rebaixar para usuário" : "Promover a admin"}
                                onClick={() => atualizarMutation.mutate({ id: u.id, role: u.role === "admin" ? "user" : "admin" })}
                              >
                                {u.role === "admin" ? <ShieldOff className="w-4 h-4" /> : <ShieldCheck className="w-4 h-4" />}
                              </Button>
                            )}
                            {!isSelf && (
                              <Button
                                variant="ghost"
                                size="sm"
                                title={u.active ? "Desativar" : "Ativar"}
                                onClick={() => atualizarMutation.mutate({ id: u.id, active: !u.active })}
                              >
                                <span className={`text-xs ${u.active ? "text-amber-600" : "text-green-600"}`}>
                                  {u.active ? "Desativar" : "Ativar"}
                                </span>
                              </Button>
                            )}
                            {!isSelf && (
                              <Button
                                variant="ghost"
                                size="sm"
                                title="Excluir"
                                className="text-red-600 hover:text-red-700"
                                onClick={() => setDeleteTarget(u)}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {!usuariosQuery.isLoading && usuarios.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                        Nenhum usuário cadastrado.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Dialog: criar usuário */}
      <Dialog open={showCriar} onOpenChange={setShowCriar}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo usuário</DialogTitle>
            <DialogDescription>Cadastre um novo acesso ao sistema.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCriar} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="n-username">Usuário *</Label>
              <Input id="n-username" value={novo.username} onChange={e => setNovo({ ...novo, username: e.target.value })} placeholder="joao.silva" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="n-name">Nome</Label>
              <Input id="n-name" value={novo.name} onChange={e => setNovo({ ...novo, name: e.target.value })} placeholder="João Silva" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="n-email">E-mail</Label>
              <Input id="n-email" type="email" value={novo.email} onChange={e => setNovo({ ...novo, email: e.target.value })} placeholder="joao@empresa.com" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="n-password">Senha *</Label>
                <Input id="n-password" type="text" value={novo.password} onChange={e => setNovo({ ...novo, password: e.target.value })} placeholder="mín. 6 caracteres" />
              </div>
              <div className="space-y-1.5">
                <Label>Papel</Label>
                <Select value={novo.role} onValueChange={(v: "user" | "admin") => setNovo({ ...novo, role: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="user">Usuário</SelectItem>
                    <SelectItem value="admin">Administrador</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowCriar(false)}>Cancelar</Button>
              <Button type="submit" className="gap-2" disabled={criarMutation.isPending}>
                {criarMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                Criar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog: redefinir senha */}
      <Dialog open={!!resetTarget} onOpenChange={o => !o && setResetTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Redefinir senha</DialogTitle>
            <DialogDescription>
              Defina uma nova senha para <strong>{resetTarget?.username}</strong> e informe ao usuário.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="reset-pass">Nova senha</Label>
            <Input id="reset-pass" type="text" value={novaSenha} onChange={e => setNovaSenha(e.target.value)} placeholder="mín. 6 caracteres" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetTarget(null)}>Cancelar</Button>
            <Button
              className="gap-2"
              disabled={resetMutation.isPending || novaSenha.length < 6}
              onClick={() => resetTarget && resetMutation.mutate({ id: resetTarget.id, password: novaSenha })}
            >
              {resetMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
              Salvar senha
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Alert: excluir */}
      <AlertDialog open={!!deleteTarget} onOpenChange={o => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir usuário</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir <strong>{deleteTarget?.username}</strong>? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => deleteTarget && excluirMutation.mutate({ id: deleteTarget.id })}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
