import { useState } from "react";
import { useLocation, Link } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Lock, User } from "lucide-react";
import { toast } from "sonner";
import { TRPCClientError } from "@trpc/client";

export default function Login() {
  const [, navigate] = useLocation();
  const { login, loginPending } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      toast.error("Preencha usuário e senha.");
      return;
    }
    try {
      await login(username.trim(), password);
      toast.success("Bem-vindo!");
      navigate("/");
    } catch (err) {
      const msg =
        err instanceof TRPCClientError ? err.message : "Não foi possível entrar.";
      toast.error(msg);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <img src="/logo-bigfish.png" alt="Bigfish" className="mb-4 size-16 rounded-2xl shadow-sm" />
          <h1 className="text-2xl font-semibold tracking-tight text-brand-navy">GLME</h1>
          <p className="mt-1 text-sm text-muted-foreground">Guia de Liberação de Mercadoria Estrangeira</p>
        </div>

        <div className="rounded-2xl border bg-card p-6 shadow-[0_1px_2px_rgba(16,50,98,0.04)]">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="username" className="text-[13px] font-medium text-muted-foreground">Usuário</Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="username"
                  autoFocus
                  autoComplete="username"
                  autoCapitalize="none"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  placeholder="seu.usuario"
                  className="h-10 pl-9"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-[13px] font-medium text-muted-foreground">Senha</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="h-10 pl-9"
                />
              </div>
            </div>

            <Button type="submit" size="lg" className="w-full" disabled={loginPending}>
              {loginPending && <Loader2 className="animate-spin" />}
              Entrar
            </Button>

            <div className="text-center">
              <Link href="/esqueci-senha" className="text-sm text-brand-sky hover:underline">
                Esqueci minha senha
              </Link>
            </div>
          </form>
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Acesso restrito · novos usuários são cadastrados pelo administrador
        </p>
      </div>
    </div>
  );
}
