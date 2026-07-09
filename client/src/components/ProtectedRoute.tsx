import { useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { Loader2 } from "lucide-react";

type ProtectedRouteProps = {
  children: React.ReactNode;
  /** Se true, exige papel de administrador. */
  requireAdmin?: boolean;
};

function FullScreenLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <Loader2 className="w-8 h-8 animate-spin text-blue-700" />
    </div>
  );
}

export default function ProtectedRoute({ children, requireAdmin = false }: ProtectedRouteProps) {
  const { user, loading, isAdmin } = useAuth();
  const [, navigate] = useLocation();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      navigate("/login", { replace: true });
    } else if (requireAdmin && !isAdmin) {
      navigate("/", { replace: true });
    }
  }, [loading, user, isAdmin, requireAdmin, navigate]);

  if (loading) return <FullScreenLoader />;
  if (!user) return <FullScreenLoader />;
  if (requireAdmin && !isAdmin) return <FullScreenLoader />;

  return <>{children}</>;
}
