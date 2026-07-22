import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import type { ReactNode } from "react";

export function PageHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <header className="mb-8 flex flex-col gap-5 border-b border-border/70 pb-7 lg:flex-row lg:items-end lg:justify-between">
      <div className="max-w-2xl">
        <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-primary">{eyebrow}</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground">{title}</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
  );
}

export function RefreshButton({ onClick, loading = false }: { onClick: () => void; loading?: boolean }) {
  return (
    <Button variant="outline" size="sm" onClick={onClick} disabled={loading} className="bg-background/40">
      <RefreshCw className={`mr-2 h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
      Atualizar
    </Button>
  );
}

export function StatusBadge({ value }: { value: string | null | undefined }) {
  const normalized = value ?? "indefinido";
  const config: Record<string, { label: string; className: string }> = {
    active: { label: "Ativa", className: "border-emerald-400/20 bg-emerald-400/10 text-emerald-300" },
    completed: { label: "Confirmado", className: "border-emerald-400/20 bg-emerald-400/10 text-emerald-300" },
    pending: { label: "Pendente", className: "border-amber-400/20 bg-amber-400/10 text-amber-200" },
    expired: { label: "Vencida", className: "border-orange-400/20 bg-orange-400/10 text-orange-200" },
    revoked: { label: "Revogada", className: "border-rose-400/20 bg-rose-400/10 text-rose-200" },
    canceled: { label: "Cancelada", className: "border-slate-400/20 bg-slate-400/10 text-slate-200" },
    refunded: { label: "Estornada", className: "border-sky-400/20 bg-sky-400/10 text-sky-200" },
    failed: { label: "Falhou", className: "border-rose-400/20 bg-rose-400/10 text-rose-200" },
    success: { label: "Sucesso", className: "border-emerald-400/20 bg-emerald-400/10 text-emerald-300" },
    warning: { label: "Atenção", className: "border-amber-400/20 bg-amber-400/10 text-amber-200" },
    error: { label: "Erro", className: "border-rose-400/20 bg-rose-400/10 text-rose-200" },
  };
  const detail = config[normalized] ?? { label: normalized, className: "border-border bg-muted text-muted-foreground" };
  return <Badge variant="outline" className={`font-medium ${detail.className}`}>{detail.label}</Badge>;
}

export function formatCurrency(cents: number | null | undefined) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format((cents ?? 0) / 100);
}

export function formatDate(value: Date | string | null | undefined, includeTime = false) {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "medium",
    ...(includeTime ? { timeStyle: "short" } : {}),
    timeZone: "America/Sao_Paulo",
  }).format(date);
}
