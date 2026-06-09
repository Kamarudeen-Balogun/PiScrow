import type { PiPaymentDTO, PiUser } from "@/types/pi";

const piApiBase =
  process.env.PI_PLATFORM_API_BASE?.replace(/\/$/, "") ?? "https://api.minepi.com";

export function hasPiNetworkApiKey() {
  return Boolean(process.env.PI_NETWORK_API_KEY);
}

export function hasPiWalletPrivateSeed() {
  return Boolean(process.env.PI_WALLET_PRIVATE_SEED);
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
