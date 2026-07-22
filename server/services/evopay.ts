import { ENV } from "../_core/env";

export type EvoPayTransactionStatus =
  | "PENDING"
  | "COMPLETED"
  | "CANCELED"
  | "WAITING_FOR_REFUND"
  | "REFUNDED"
  | "EXPIRED";

export type EvoPayPixCharge = {
  id: string;
  type: "DEPOSIT" | "WITHDRAW" | "TEF";
  status: EvoPayTransactionStatus;
  amount: number;
  clientReference?: string | null;
  qrCodeText?: string | null;
  qrCodeUrl?: string | null;
  qrCodeBase64?: string | null;
  paidAt?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  endToEndId?: string | null;
  expiresAt?: string | null;
  expirationDate?: string | null;
  expiresIn?: number | null;
};

type EvoPayErrorResponse = {
  message?: string;
  error?: string;
};

function ensureEvoPayConfigured(): void {
  if (!ENV.evoPayApiKey) {
    throw new Error("A chave da EvoPay não está configurada.");
  }
}

async function evoPayFetch<T>(path: string, init: RequestInit): Promise<T> {
  ensureEvoPayConfigured();
  const response = await fetch(`${ENV.evoPayApiBaseUrl}${path}`, {
    ...init,
    headers: {
      "API-Key": ENV.evoPayApiKey,
      Accept: "application/json",
      ...init.headers,
    },
    signal: AbortSignal.timeout(12_000),
  });

  if (!response.ok) {
    const raw = await response.text().catch(() => "");
    let body: EvoPayErrorResponse | null = null;
    try {
      body = JSON.parse(raw) as EvoPayErrorResponse;
    } catch {
      // Preserve the provider response as diagnostic context without leaking credentials.
    }
    throw new Error(body?.message || body?.error || `EvoPay respondeu com HTTP ${response.status}.`);
  }

  return (await response.json()) as T;
}

export async function createPixCharge(input: {
  amountCents: number;
  externalReference: string;
  callbackUrl: string;
}): Promise<EvoPayPixCharge> {
  return evoPayFetch<EvoPayPixCharge>("/v1/pix", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      amount: Number((input.amountCents / 100).toFixed(2)),
      externalReference: input.externalReference,
      callbackUrl: input.callbackUrl,
    }),
  });
}

export async function getPixCharge(transactionId: string): Promise<EvoPayPixCharge> {
  const query = new URLSearchParams({ id: transactionId });
  return evoPayFetch<EvoPayPixCharge>(`/v1/pix?${query.toString()}`, {
    method: "GET",
  });
}

export function isCompletedDepositForPayment(
  transaction: EvoPayPixCharge,
  payment: { providerTransactionId: string | null; externalReference: string; amountCents: number }
): boolean {
  return (
    transaction.id === payment.providerTransactionId &&
    transaction.type === "DEPOSIT" &&
    transaction.status === "COMPLETED" &&
    transaction.clientReference === payment.externalReference &&
    Math.round(transaction.amount * 100) === payment.amountCents
  );
}

export function getPixChargeExpiry(transaction: EvoPayPixCharge): Date | null {
  const rawDate = transaction.expiresAt ?? transaction.expirationDate ?? null;
  if (rawDate) {
    const date = new Date(rawDate);
    if (!Number.isNaN(date.getTime())) return date;
  }
  if (typeof transaction.expiresIn === "number" && transaction.expiresIn > 0) {
    return new Date(Date.now() + transaction.expiresIn * 1000);
  }
  return null;
}
