import { useState } from "react";
import { useLocation, Link } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-slate-900">GLME</h1>
          <p className="text-slate-500 text-sm">
            Guia para Liberação de Mercadoria Estrangeira
          </p>
        </div>

        <Card className="shadow-lg border-slate-200">
          <CardHeader>
            <CardTitle className="text-lg text-slate-800">Acessar o sistema</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="username">Usuário</Label>
                <div className="relative">
                  <User className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <Input
                    id="username"
                    autoFocus
                    autoComplete="username"
                    value={username}
                    onChange={e => setUsername(e.target.value)}
                    placeholder="seu.usuario"
                    className="pl-9"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="password">Senha</Label>
                <div className="relative">
                  <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <Input
                    id="password"
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="pl-9"
                  />
                </div>
              </div>

              <Button
                type="submit"
                className="w-full gap-2 bg-blue-700 hover:bg-blue-800"
                disabled={loginPending}
              >
                {loginPending && <Loader2 className="w-4 h-4 animate-spin" />}
                Entrar
              </Button>

              <div className="text-center">
                <Link
                  href="/esqueci-senha"
                  className="text-sm text-blue-700 hover:underline"
                >
                  Esqueci minha senha
                </Link>
              </div>
            </form>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-slate-400 mt-4">
          Acesso restrito · Novos usuários são cadastrados pelo administrador
        </p>
      </div>
    </div>
  );
}
