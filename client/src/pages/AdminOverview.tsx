import AdminFrame from "@/components/AdminFrame";
import { PageHeading, RefreshButton, StatusBadge, formatCurrency, formatDate } from "@/components/AdminUi";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import { ArrowDownRight, ArrowUpRight, Clock3, CreditCard, ShieldCheck, Users } from "lucide-react";
import { Link } from "wouter";

const metrics = [
  { key: "activeSubscribers", label: "Assinaturas ativas", icon: Users, accent: "text-emerald-300", detail: "Acessos atualmente elegíveis" },
  { key: "completedRevenueCents", label: "Receita confirmada", icon: CreditCard, accent: "text-primary", detail: "Somatório de PIX liquidados" },
  { key: "pendingPayments", label: "PIX pendentes", icon: Clock3, accent: "text-amber-200", detail: "Aguardando confirmação" },
  { key: "renewalsDue", label: "Renovações em 3 dias", icon: ShieldCheck, accent: "text-fuchsia-200", detail: "Lembretes programados" },
] as const;

export default function AdminOverview() {
  const utils = trpc.useUtils();
  const overview = trpc.admin.overview.useQuery();
  const subscriptions = trpc.admin.subscriptions.useQuery({ limit: 6 });
  const payments = trpc.admin.payments.useQuery({ limit: 5 });
  const automation = trpc.admin.automation.status.useQuery();
  const loading = overview.isLoading || subscriptions.isLoading || payments.isLoading;

  const refresh = () => Promise.all([
    utils.admin.overview.invalidate(),
    utils.admin.subscriptions.invalidate(),
    utils.admin.payments.invalidate(),
    utils.admin.automation.status.invalidate(),
  ]);

  return (
    <AdminFrame>
      <PageHeading
        eyebrow="Central de controle"
        title="Operação VIP em tempo real"
        description="Monitore receita PIX, acesso ao grupo e os pontos de atenção do ciclo de assinatura em um único ambiente."
        action={<RefreshButton onClick={refresh} loading={loading} />}
      />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map(metric => {
          const Icon = metric.icon;
          const raw = overview.data?.[metric.key] ?? 0;
          const display = metric.key === "completedRevenueCents" ? formatCurrency(Number(raw)) : Number(raw).toLocaleString("pt-BR");
          return (
            <Card key={metric.key} className="overflow-hidden border-border/70 bg-card/80 shadow-lg shadow-black/10">
              <CardContent className="relative p-5">
                <div className="absolute -right-5 -top-5 h-20 w-20 rounded-full bg-primary/10 blur-2xl" />
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">{metric.label}</p>
                    {overview.isLoading ? <Skeleton className="mt-3 h-8 w-24" /> : <p className="mt-2 text-2xl font-semibold tracking-tight">{display}</p>}
                  </div>
                  <div className={`rounded-xl bg-muted p-2.5 ${metric.accent}`}><Icon className="h-5 w-5" /></div>
                </div>
                <p className="mt-4 text-xs text-muted-foreground">{metric.detail}</p>
              </CardContent>
            </Card>
          );
        })}
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-[1.5fr_1fr]">
        <Card className="border-border/70 bg-card/80">
          <CardContent className="p-0">
            <div className="flex items-center justify-between px-5 py-4">
              <div>
                <h2 className="font-semibold">Assinaturas recentes</h2>
                <p className="mt-1 text-xs text-muted-foreground">Últimas concessões e renovações de acesso.</p>
              </div>
              <Link href="/admin/assinantes" className="text-xs font-semibold text-primary hover:underline">Ver todos</Link>
            </div>
            <div className="overflow-x-auto border-t border-border/70">
              <table className="w-full min-w-[600px] text-left text-sm">
                <thead className="bg-muted/30 text-[11px] uppercase tracking-wider text-muted-foreground"><tr><th className="px-5 py-3 font-medium">Assinante</th><th className="px-5 py-3 font-medium">Plano</th><th className="px-5 py-3 font-medium">Vencimento</th><th className="px-5 py-3 font-medium">Status</th></tr></thead>
                <tbody className="divide-y divide-border/60">
                  {subscriptions.data?.map(({ subscription, telegramUser, plan }) => <tr key={subscription.id} className="transition-colors hover:bg-muted/20"><td className="px-5 py-3.5"><p className="font-medium">{telegramUser.firstName ?? telegramUser.username ?? "Usuário Telegram"}</p><p className="text-xs text-muted-foreground">{telegramUser.username ? `@${telegramUser.username}` : telegramUser.telegramUserId}</p></td><td className="px-5 py-3.5">{plan.name}</td><td className="px-5 py-3.5 text-muted-foreground">{formatDate(subscription.expiresAt)}</td><td className="px-5 py-3.5"><StatusBadge value={subscription.status} /></td></tr>)}
                  {!subscriptions.isLoading && subscriptions.data?.length === 0 ? <tr><td colSpan={4} className="px-5 py-10 text-center text-sm text-muted-foreground">Nenhuma assinatura registrada ainda.</td></tr> : null}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="border-primary/20 bg-gradient-to-br from-primary/15 via-card to-card">
            <CardContent className="p-5">
              <div className="flex items-center gap-3"><div className="rounded-xl bg-primary/15 p-2 text-primary"><ActivityIcon /></div><div><p className="font-semibold">Automação de ciclo</p><p className="text-xs text-muted-foreground">Vencimentos e renovação</p></div></div>
              <div className="mt-5 flex items-center justify-between rounded-xl border border-border/70 bg-background/35 px-3.5 py-3"><div><p className="text-sm font-medium">{automation.data?.job?.isEnabled ? "Ativa" : "Aguardando ativação"}</p><p className="mt-0.5 text-xs text-muted-foreground">{automation.data?.job?.lastRunAt ? `Última execução: ${formatDate(automation.data.job.lastRunAt, true)}` : "Nenhuma execução registrada"}</p></div><span className={`h-2.5 w-2.5 rounded-full ${automation.data?.job?.isEnabled ? "bg-emerald-400 shadow-[0_0_14px_rgba(52,211,153,.7)]" : "bg-amber-300"}`} /></div>
              <Link href="/admin/operacao" className="mt-4 flex items-center text-sm font-semibold text-primary hover:underline">Gerenciar automação <ArrowUpRight className="ml-1 h-3.5 w-3.5" /></Link>
            </CardContent>
          </Card>
          <Card className="border-border/70 bg-card/80"><CardContent className="p-5"><div className="flex items-center justify-between"><div><h2 className="font-semibold">PIX recentes</h2><p className="mt-1 text-xs text-muted-foreground">Últimas transações geradas.</p></div><Link href="/admin/pagamentos" className="text-xs font-semibold text-primary hover:underline">Conferir</Link></div><div className="mt-4 space-y-3">{payments.data?.map(({ payment, telegramUser }) => <div key={payment.id} className="flex items-center justify-between gap-3 rounded-xl bg-muted/35 px-3 py-2.5"><div className="min-w-0"><p className="truncate text-sm font-medium">{telegramUser.firstName ?? telegramUser.username ?? "Usuário Telegram"}</p><p className="mt-0.5 text-xs text-muted-foreground">{formatDate(payment.createdAt, true)}</p></div><div className="text-right"><p className="text-sm font-semibold">{formatCurrency(payment.amountCents)}</p><StatusBadge value={payment.status} /></div></div>)}{!payments.isLoading && payments.data?.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">Nenhum PIX gerado.</p> : null}</div></CardContent></Card>
        </div>
      </section>
    </AdminFrame>
  );
}

function ActivityIcon() { return <ArrowDownRight className="h-5 w-5" />; }
