import type { PiPaymentDTO, PiUser } from "@/types/pi";

const piApiBase =
  process.env.PI_PLATFORM_API_BASE?.replace(/\/$/, "") ?? "https://api.minepi.com";

function normalizePiWalletPrivateSeed(seed: string | null | undefined) {
  return (seed ?? "")
    .normalize("NFKC")
    .trim()
    .replace(/^['"]+|['"]+$/g, "")
    .replace(/[\s\u200B-\u200D\u2060\uFEFF]+/g, "")
    .toUpperCase();
}

function readPiWalletPrivateSeedDiagnostics(seed: string | null | undefined) {
  const normalizedSeed = normalizePiWalletPrivateSeed(seed);

  return {
    normalizedSeed,
    hasValue: normalizedSeed.length > 0,
    startsWithS: normalizedSeed.startsWith("S"),
    hasOnlyBase32Chars: /^[A-Z2-7]+$/.test(normalizedSeed),
    normalizedLength: normalizedSeed.length,
    isValid:
      normalizedSeed.length === 56 &&
      normalizedSeed.startsWith("S") &&
      /^[A-Z2-7]+$/.test(normalizedSeed),
  };
}

function piWalletPrivateSeedErrorMessage(seed: string | null | undefined) {
  const diagnostics = readPiWalletPrivateSeedDiagnostics(seed);

  if (!diagnostics.hasValue) {
    return (
      "PI_WALLET_PRIVATE_SEED is not configured. Add the app wallet private seed on the server before automatic Test Pi release/refund."
    );
  }

  const issues = [
    diagnostics.startsWithS ? null : "it does not start with 'S'",
    diagnostics.normalizedLength === 56
      ? null
      : `its normalized length is ${diagnostics.normalizedLength}, not 56`,
    diagnostics.hasOnlyBase32Chars
      ? null
      : "it contains characters outside the Pi/Stellar base32 alphabet",
  ].filter(Boolean);

  return `PI_WALLET_PRIVATE_SEED is invalid after trimming quotes, whitespace, and invisible characters: ${issues.join(
    "; ",
  )}.`;
}

export function hasPiNetworkApiKey() {
  return Boolean(process.env.PI_NETWORK_API_KEY);
}

export function hasPiWalletPrivateSeed() {
  return readPiWalletPrivateSeedDiagnostics(process.env.PI_WALLET_PRIVATE_SEED).isValid;
}

export function getPiWalletPrivateSeed() {
  const diagnostics = readPiWalletPrivateSeedDiagnostics(
    process.env.PI_WALLET_PRIVATE_SEED,
  );

  if (!diagnostics.isValid) {
    throw new Error(
      piWalletPrivateSeedErrorMessage(process.env.PI_WALLET_PRIVATE_SEED),
    );
  }

  return diagnostics.normalizedSeed;
}

function getPiApiKey() {
  const apiKey = process.env.PI_NETWORK_API_KEY;

  if (!apiKey) {
    throw new Error("PI_NETWORK_API_KEY is not configured.");
  }

  return apiKey;
}

async function piPlatformRequest<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(`${piApiBase}${path}`, {
    ...init,
    headers: {
      Authorization: `Key ${getPiApiKey()}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Pi Platform request failed: ${response.status} ${body}`);
  }

  return response.json() as Promise<T>;
}

export async function approvePiPayment(paymentId: string) {
  return piPlatformRequest<PiPaymentDTO>(`/v2/payments/${paymentId}/approve`, {
    method: "POST",
  });
}

export async function getPiPayment(paymentId: string) {
  return piPlatformRequest<PiPaymentDTO>(`/v2/payments/${paymentId}`, {
    method: "GET",
  });
}

export async function completePiPayment(paymentId: string, txid: string) {
  return piPlatformRequest<PiPaymentDTO>(`/v2/payments/${paymentId}/complete`, {
    method: "POST",
    body: JSON.stringify({ txid }),
  });
}

export function piTransactionLink(txid: string) {
  return `https://api.testnet.minepi.com/transactions/${encodeURIComponent(txid)}`;
}

export async function verifyPiAccessToken(accessToken: string) {
  const response = await fetch(`${piApiBase}/v2/me`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Pi access token verification failed: ${response.status} ${body}`);
  }

  return response.json() as Promise<PiUser>;
}
