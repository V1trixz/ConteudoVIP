import AdminFrame from "@/components/AdminFrame";
import { PageHeading, RefreshButton, StatusBadge, formatDate } from "@/components/AdminUi";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { KeyRound, Search, ShieldOff } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

function maskTelegramId(value: string) {
  return value.length <= 8 ? "••••••••" : `${value.slice(0, 4)}••••${value.slice(-4)}`;
}

export default function AdminSubscribers() {
  const utils = trpc.useUtils();
  const [filter, setFilter] = useState("");
  const query = trpc.admin.subscriptions.useQuery({ limit: 250 });
  const resendInvite = trpc.admin.resendInvite.useMutation({ onSuccess: () => { toast.success("Novo convite individual enviado."); utils.admin.subscriptions.invalidate(); }, onError: error => toast.error(error.message) });
  const revoke = trpc.admin.revokeSubscription.useMutation({ onSuccess: () => { toast.success("Acesso revogado e registrado."); utils.admin.subscriptions.invalidate(); }, onError: error => toast.error(error.message) });
  const items = useMemo(() => query.data?.filter(({ telegramUser, plan }) => [telegramUser.firstName, telegramUser.username, telegramUser.telegramUserId, plan.name].filter(Boolean).join(" ").toLowerCase().includes(filter.toLowerCase())) ?? [], [query.data, filter]);
  const refresh = () => utils.admin.subscriptions.invalidate();

  const revokeAccess = (subscriptionId: string, name: string) => {
    if (!window.confirm(`Revogar o acesso de ${name}? A remoção do grupo será processada automaticamente.`)) return;
    revoke.mutate({ subscriptionId, reason: "Acesso revogado manualmente pelo administrador." });
  };

  return <AdminFrame><PageHeading eyebrow="Controle de acesso" title="Assinantes" description="Consulte o estado de cada assinatura e intervenha apenas quando necessário." action={<RefreshButton onClick={refresh} loading={query.isFetching} />} />
    <Card className="border-border/70 bg-card/80"><CardContent className="p-0"><div className="flex flex-col gap-4 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-semibold">Base de assinaturas</h2><p className="mt-1 text-xs text-muted-foreground">{items.length} registro(s) exibido(s)</p></div><div className="relative w-full sm:w-72"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={filter} onChange={event => setFilter(event.target.value)} placeholder="Buscar por usuário ou plano" className="bg-background/40 pl-9" /></div></div><div className="overflow-x-auto border-t border-border/70"><table className="w-full min-w-[960px] text-left text-sm"><thead className="bg-muted/30 text-[11px] uppercase tracking-wider text-muted-foreground"><tr><th className="px-5 py-3 font-medium">Assinante</th><th className="px-5 py-3 font-medium">Plano</th><th className="px-5 py-3 font-medium">Início</th><th className="px-5 py-3 font-medium">Vencimento</th><th className="px-5 py-3 font-medium">Status</th><th className="px-5 py-3 text-right font-medium">Ações</th></tr></thead><tbody className="divide-y divide-border/60">{items.map(({ subscription, telegramUser, plan }) => { const name = telegramUser.firstName ?? telegramUser.username ?? "Usuário Telegram"; const active = subscription.status === "active"; return <tr key={subscription.id} className="hover:bg-muted/20"><td className="px-5 py-4"><p className="font-medium">{name}</p><p className="mt-0.5 text-xs text-muted-foreground">{telegramUser.username ? `@${telegramUser.username}` : `ID ${maskTelegramId(telegramUser.telegramUserId)}`}</p></td><td className="px-5 py-4">{plan.name}</td><td className="px-5 py-4 text-muted-foreground">{formatDate(subscription.startsAt)}</td><td className="px-5 py-4 text-muted-foreground">{formatDate(subscription.expiresAt)}</td><td className="px-5 py-4"><StatusBadge value={subscription.status} /></td><td className="px-5 py-4"><div className="flex justify-end gap-2"><Button variant="outline" size="sm" className="bg-background/35" disabled={!active || resendInvite.isPending} onClick={() => resendInvite.mutate({ subscriptionId: subscription.id })}><KeyRound className="mr-1.5 h-3.5 w-3.5" />Reenviar</Button><Button variant="outline" size="sm" disabled={!active || revoke.isPending} onClick={() => revokeAccess(subscription.id, name)} className="border-destructive/30 bg-destructive/5 text-destructive hover:bg-destructive/15 hover:text-destructive"><ShieldOff className="mr-1.5 h-3.5 w-3.5" />Revogar</Button></div></td></tr>; })}{!query.isLoading && items.length === 0 ? <tr><td colSpan={6} className="px-5 py-14 text-center text-muted-foreground">Nenhuma assinatura corresponde à busca.</td></tr> : null}</tbody></table></div></CardContent></Card>
  </AdminFrame>;
}
