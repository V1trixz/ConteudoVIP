import { ENV } from "../_core/env";

export type LofyPayTransactionStatus =
  | "PENDING"
  | "COMPLETED"
  | "CANCELED"
  | "WAITING_FOR_REFUND"
  | "REFUNDED"
  | "EXPIRED";

export type LofyPayPixCharge = {
  id: string;
  type: "DEPOSIT" | "WITHDRAW" | "TEF";
  status: LofyPayTransactionStatus;
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

type LofyPayErrorResponse = {
  message?: string;
  error?: string;
};

function ensureLofyPayConfigured(): void {
  if (!ENV.lofyPayApiKey) {
    throw new Error("A chave da LofyPay não está configurada.");
  }
}

async function lofyPayFetch<T>(path: string, init: RequestInit): Promise<T> {
  ensureLofyPayConfigured();
  const response = await fetch(`${ENV.lofyPayApiBaseUrl}${path}`, {
    ...init,
    headers: {
      "API-Key": ENV.lofyPayApiKey,
      Accept: "application/json",
      ...init.headers,
    },
    signal: AbortSignal.timeout(12_000),
  });

  if (!response.ok) {
    const raw = await response.text().catch(() => "");
    let body: LofyPayErrorResponse | null = null;
    try {
      body = JSON.parse(raw) as LofyPayErrorResponse;
    } catch {
      // If parsing fails, keep raw text as diagnostic info.
    }
    const detail = body ? body : raw;
    // Throw a descriptive error including HTTP status and provider response body (stringified) for logs.
    const safeDetail = typeof detail === "string" ? detail : JSON.stringify(detail);
    throw new Error(`LofyPay HTTP ${response.status} ${response.statusText} - ${safeDetail}`);
  }

  return (await response.json()) as T;
}

export async function createPixCharge(input: {
  amountCents: number;
  externalReference: string;
  callbackUrl: string;
}): Promise<LofyPayPixCharge> {
  return lofyPayFetch<LofyPayPixCharge>("/v1/pix", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      amount: Number((input.amountCents / 100).toFixed(2)),
      externalReference: input.externalReference,
      callbackUrl: input.callbackUrl,
    }),
  });
}

export async function getPixCharge(transactionId: string): Promise<LofyPayPixCharge> {
  const query = new URLSearchParams({ id: transactionId });
  return lofyPayFetch<LofyPayPixCharge>(`/v1/pix?${query.toString()}`, {
    method: "GET",
  });
}

export function isCompletedDepositForPayment(
  transaction: LofyPayPixCharge,
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

export function getPixChargeExpiry(transaction: LofyPayPixCharge): Date | null {
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
