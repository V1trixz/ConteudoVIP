import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { ShieldAlert } from "lucide-react";
import { startLogin } from "@/const";

export default function AdminFrame({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) return null;
  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-6">
        <section className="w-full max-w-md rounded-3xl border border-border bg-card p-8 text-center shadow-2xl shadow-black/30">
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-primary">VIP Access</p>
          <h1 className="text-2xl font-semibold">Autenticação necessária</h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">Faça login para abrir o ambiente administrativo.</p>
          <Button className="mt-7 w-full" onClick={() => startLogin()}>Entrar no painel</Button>
        </section>
      </main>
    );
  }

  return (
    <DashboardLayout>
      {user.role !== "admin" ? (
        <section className="mx-auto mt-16 max-w-xl rounded-3xl border border-destructive/30 bg-destructive/10 p-8 text-center">
          <ShieldAlert className="mx-auto h-9 w-9 text-destructive" />
          <h1 className="mt-4 text-xl font-semibold">Acesso administrativo restrito</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">Esta conta não possui permissão para operar assinantes, pagamentos ou acessos.</p>
        </section>
      ) : children}
    </DashboardLayout>
  );
}
