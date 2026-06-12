import type { PiAuthResult, PiBrowserSDK, PiUser } from "@/types/pi";

const piInitErrorMarkers = ["not initialized", "call init"];
const piUnavailableMarkers = [
  "sdk was not available",
  "sdk is not available",
  "not in pi browser",
  "open this app inside pi browser",
  "pi browser required",
];
const piTimeoutMarkers = ["timed out", "did not complete"];

export const piSdkWaitMs = 7000;
export const piAuthTimeoutMs = 10_000;
const piAuthScopes = ["username", "payments", "wallet_address"] as const;

export function wait(milliseconds: number) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, milliseconds);
  });
}

export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  timeoutMessage: string,
) {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      reject(new Error(timeoutMessage));
    }, timeoutMs);

    promise.then(resolve, reject).finally(() => window.clearTimeout(timer));
  });
}

export async function waitForPiSdk(timeoutMs = piSdkWaitMs) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (window.Pi) {
      return window.Pi;
    }

    await wait(120);
  }

  throw new Error(
    "Pi Browser required. The Pi SDK was not available on this page.",
  );
}

export async function initializePiSdk(
  pi: PiBrowserSDK,
  sandbox: boolean,
) {
  await Promise.resolve(pi.init({ version: "2.0", sandbox }));
  await wait(350);
}

export function isPiInitErrorMessage(message: string) {
  return piInitErrorMarkers.some((marker) => message.includes(marker));
}

function isPiUnavailableMessage(message: string) {
  return (
    isPiInitErrorMessage(message) ||
    piUnavailableMarkers.some((marker) => message.includes(marker))
  );
}

function isPiTimeoutMessage(message: string) {
  return piTimeoutMarkers.some((marker) => message.includes(marker));
}

function isPiAccessTokenMessage(message: string) {
  return message.includes("access token");
}

export function resolvePiAuthMessage(
  error: unknown,
  authCopy: {
    piSdkUnavailable: string;
    loginTimeout: string;
    accessTokenMissing: string;
  },
) {
  const message =
    error instanceof Error ? error.message : "Pi account connection failed.";
  const lowerMessage = message.toLowerCase();

  if (isPiUnavailableMessage(lowerMessage)) {
    return authCopy.piSdkUnavailable;
  }

  if (isPiTimeoutMessage(lowerMessage)) {
    return authCopy.loginTimeout;
  }

  if (isPiAccessTokenMessage(lowerMessage)) {
    return authCopy.accessTokenMissing;
  }

  return message;
}

export function shouldRetryPiAuthentication(
  attempt: number,
  error: unknown,
) {
  if (attempt !== 0) {
    return false;
  }

  if (!(error instanceof Error)) {
    return false;
  }

  return isPiInitErrorMessage(error.message.toLowerCase());
}

export async function authenticateWithPiBrowser(
  pi: PiBrowserSDK,
  sandbox: boolean,
  onIncompletePaymentFound: Parameters<PiBrowserSDK["authenticate"]>[1],
): Promise<PiAuthResult | PiUser> {
  let lastError: unknown;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await initializePiSdk(pi, sandbox);
      await wait(attempt === 0 ? 0 : 450);

      return await withTimeout<PiAuthResult | PiUser>(
        pi.authenticate([...piAuthScopes], onIncompletePaymentFound),
        piAuthTimeoutMs,
        "Pi Browser authentication timed out before it completed.",
      );
    } catch (error) {
      lastError = error;

      if (shouldRetryPiAuthentication(attempt, error)) {
        await wait(350);
        continue;
      }

      throw error;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Pi authentication did not complete.");
}
