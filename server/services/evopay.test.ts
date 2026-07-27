import { describe, expect, it } from "vitest";
import { getPixChargeExpiry, isCompletedDepositForPayment, type LofyPayPixCharge } from "./lofypay";

const payment = {
  providerTransactionId: "pix_123",
  externalReference: "pay_internal_123",
  amountCents: 2990,
};

const completedCharge: LofyPayPixCharge = {
  id: "pix_123",
  type: "DEPOSIT",
  status: "COMPLETED",
  amount: 29.9,
  clientReference: "pay_internal_123",
};

describe("isCompletedDepositForPayment", () => {
  it("aceita apenas a liquidação PIX exatamente vinculada ao pagamento local", () => {
    expect(isCompletedDepositForPayment(completedCharge, payment)).toBe(true);
  });

  it("rejeita valores, referências e estados divergentes", () => {
    expect(isCompletedDepositForPayment({ ...completedCharge, amount: 30 }, payment)).toBe(false);
    expect(isCompletedDepositForPayment({ ...completedCharge, clientReference: "outra_referencia" }, payment)).toBe(false);
    expect(isCompletedDepositForPayment({ ...completedCharge, status: "PENDING" }, payment)).toBe(false);
    expect(isCompletedDepositForPayment({ ...completedCharge, type: "WITHDRAW" }, payment)).toBe(false);
  });
});

describe("getPixChargeExpiry", () => {
  it("normaliza a data de expiração informada pela LofyPay", () => {
    const result = getPixChargeExpiry({ ...completedCharge, expiresAt: "2026-08-20T12:30:00.000Z" });
    expect(result?.toISOString()).toBe("2026-08-20T12:30:00.000Z");
  });

  it("retorna nulo quando a LofyPay não informa validade da cobrança", () => {
    expect(getPixChargeExpiry(completedCharge)).toBeNull();
  });
});
