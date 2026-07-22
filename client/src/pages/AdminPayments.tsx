import AdminFrame from "@/components/AdminFrame";
import { PageHeading, RefreshButton, StatusBadge, formatCurrency, formatDate } from "@/components/AdminUi";
import { Card, CardContent } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";

function maskIdentifier(value: string | null | undefined) {
  if (!value) return "—";
  if (value.length <= 8) return "••••••••";
  return `${value.slice(0, 4)}••••${value.slice(-4)}`;
}

export default function AdminPayments() {
  const utils = trpc.useUtils();
  const query = trpc.admin.payments.useQuery({ limit: 250 });
  return <AdminFrame><PageHeading eyebrow="Conciliação PIX" title="Pagamentos" description="Acompanhe cobranças EVO Pay, confirmações e referências de transação." action={<RefreshButton onClick={() => utils.admin.payments.invalidate()} loading={query.isFetching} />} />
    <Card className="border-border/70 bg-card/80"><CardContent className="p-0"><div className="overflow-x-auto"><table className="w-full min-w-[1080px] text-left text-sm"><thead className="bg-muted/30 text-[11px] uppercase tracking-wider text-muted-foreground"><tr><th className="px-5 py-3 font-medium">Cliente</th><th className="px-5 py-3 font-medium">Plano</th><th className="px-5 py-3 font-medium">Valor</th><th className="px-5 py-3 font-medium">Estado</th><th className="px-5 py-3 font-medium">Criado em</th><th className="px-5 py-3 font-medium">Validade PIX</th><th className="px-5 py-3 font-medium">Transação</th></tr></thead><tbody className="divide-y divide-border/60">{query.data?.map(({ payment, telegramUser, plan }) => <tr key={payment.id} className="hover:bg-muted/20"><td className="px-5 py-4"><p className="font-medium">{telegramUser.firstName ?? telegramUser.username ?? "Usuário Telegram"}</p><p className="mt-0.5 text-xs text-muted-foreground">{telegramUser.username ? `@${telegramUser.username}` : `ID ${maskIdentifier(telegramUser.telegramUserId)}`}</p></td><td className="px-5 py-4">{plan.name}</td><td className="px-5 py-4 font-semibold">{formatCurrency(payment.amountCents)}</td><td className="px-5 py-4"><StatusBadge value={payment.status} /></td><td className="px-5 py-4 text-muted-foreground">{formatDate(payment.createdAt, true)}</td><td className="px-5 py-4 text-xs text-muted-foreground">{payment.pixExpiresAt ? formatDate(payment.pixExpiresAt, true) : "Não informado"}</td><td className="px-5 py-4 font-mono text-xs text-muted-foreground">{maskIdentifier(payment.providerTransactionId ?? payment.externalReference)}</td></tr>)}{!query.isLoading && query.data?.length === 0 ? <tr><td colSpan={7} className="px-5 py-14 text-center text-muted-foreground">Nenhuma cobrança PIX foi criada.</td></tr> : null}</tbody></table></div></CardContent></Card>
  </AdminFrame>;
}
