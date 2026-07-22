import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { nanoid } from "nanoid";

export function createEntityId(prefix: string): string {
  return `${prefix}_${nanoid(18)}`;
}

export function createOpaqueToken(): string {
  return randomBytes(24).toString("base64url");
}

export function hashSecret(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function matchesSecret(expectedHash: string, suppliedValue: string | undefined): boolean {
  if (!suppliedValue) return false;
  const actualHash = hashSecret(suppliedValue);
  const expected = Buffer.from(expectedHash, "utf8");
  const actual = Buffer.from(actualHash, "utf8");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function serializeSafe(value: unknown): string {
  return JSON.stringify(value, (_key, nested) => {
    if (nested instanceof Date) return nested.toISOString();
    return nested;
  });
}

export function parseJson<T>(value: string | null | undefined): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}
