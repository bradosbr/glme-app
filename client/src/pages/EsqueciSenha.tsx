import { useState } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, ArrowLeft, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

export default function EsqueciSenha() {
  const [username, setUsername] = useState("");
  const [enviado, setEnviado] = useState(false);
  const forgot = trpc.auth.forgotPassword.useMutation();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) {
      toast.error("Informe seu usuário.");
      return;
    }
    try {
      await forgot.mutateAsync({ username: username.trim() });
      setEnviado(true);
    } catch {
      // Mesmo em erro, não revelamos detalhes
      setEnviado(true);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-slate-900">GLME</h1>
          <p className="text-slate-500 text-sm">Redefinição de senha</p>
        </div>

        <Card className="shadow-lg border-slate-200">
          <CardHeader>
            <CardTitle className="text-lg text-slate-800">Esqueci minha senha</CardTitle>
          </CardHeader>
          <CardContent>
            {enviado ? (
              <div className="text-center space-y-4 py-2">
                <CheckCircle2 className="w-12 h-12 text-green-600 mx-auto" />
                <p className="text-sm text-slate-600">
                  Sua solicitação foi registrada. O administrador irá redefinir sua
                  senha e informar a nova senha de acesso.
                </p>
                <Link href="/login">
                  <Button variant="outline" className="gap-2">
                    <ArrowLeft className="w-4 h-4" />
                    Voltar ao login
                  </Button>
                </Link>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <p className="text-sm text-slate-500">
                  Informe seu usuário. O administrador será avisado para redefinir
                  sua senha.
                </p>
                <div className="space-y-1.5">
                  <Label htmlFor="username">Usuário</Label>
                  <Input
                    id="username"
                    autoFocus
                    value={username}
                    onChange={e => setUsername(e.target.value)}
                    placeholder="seu.usuario"
                  />
                </div>
                <Button
                  type="submit"
                  className="w-full gap-2 bg-blue-700 hover:bg-blue-800"
                  disabled={forgot.isPending}
                >
                  {forgot.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                  Enviar solicitação
                </Button>
                <div className="text-center">
                  <Link href="/login" className="text-sm text-blue-700 hover:underline">
                    Voltar ao login
                  </Link>
                </div>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
