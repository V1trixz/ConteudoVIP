import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { startLogin } from "@/const";
import { ArrowRight, LockKeyhole, ShieldCheck } from "lucide-react";
import { Link } from "wouter";

export default function Home() {
  const { user, loading } = useAuth();
  return (
    <main className="relative flex min-h-screen overflow-hidden bg-background px-6 py-10">
      <div className="pointer-events-none absolute -left-24 top-16 h-80 w-80 rounded-full bg-primary/20 blur-3xl" />
      <div className="pointer-events-none absolute -right-24 bottom-0 h-96 w-96 rounded-full bg-fuchsia-500/10 blur-3xl" />
      <section className="relative m-auto grid w-full max-w-5xl overflow-hidden rounded-[2rem] border border-border/70 bg-card/75 shadow-2xl shadow-black/35 lg:grid-cols-[1.1fr_.9fr]">
        <div className="p-8 sm:p-12">
          <p className="text-xs font-bold uppercase tracking-[.24em] text-primary">VIP Access Manager</p>
          <h1 className="mt-5 max-w-lg text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">A operação segura para acessos exclusivos.</h1>
          <p className="mt-5 max-w-lg text-base leading-7 text-muted-foreground">Gerencie planos, PIX, convites individuais e o ciclo completo de assinaturas do seu grupo VIP no Telegram.</p>
          <div className="mt-8 flex flex-wrap gap-3">
            {user?.role === "admin" ? (
              <Link href="/admin"><Button size="lg">Abrir painel <ArrowRight className="ml-2 h-4 w-4" /></Button></Link>
            ) : (
              <Button size="lg" disabled={loading} onClick={() => startLogin()}>Entrar com segurança <LockKeyhole className="ml-2 h-4 w-4" /></Button>
            )}
          </div>
          <p className="mt-5 text-xs text-muted-foreground">O conteúdo e o acesso são destinados somente a maiores de 18 anos.</p>
        </div>
        <aside className="border-t border-border/70 bg-muted/25 p-8 sm:p-12 lg:border-l lg:border-t-0">
          <div className="rounded-2xl border border-border/80 bg-background/45 p-5">
            <ShieldCheck className="h-7 w-7 text-emerald-300" />
            <h2 className="mt-5 text-lg font-semibold">Fluxo controlado</h2>
            <ul className="mt-5 space-y-4 text-sm leading-6 text-muted-foreground">
              <li><span className="mr-2 text-primary">01</span>Confirmação explícita de maioridade.</li>
              <li><span className="mr-2 text-primary">02</span>Cobrança PIX e confirmação por webhook.</li>
              <li><span className="mr-2 text-primary">03</span>Convite de uso único e expiração automática.</li>
            </ul>
          </div>
        </aside>
      </section>
    </main>
  );
}
