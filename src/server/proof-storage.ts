import { createServiceSupabaseClient } from "@/lib/supabase";

export const PROOF_BUCKET = "trade-proofs";
const MAX_PROOF_BYTES = 5 * 1024 * 1024;
const ALLOWED_PROOF_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

function getStorageClientOrThrow() {
  const supabase = createServiceSupabaseClient();

  if (!supabase) {
    throw new Error("Supabase service client is not configured.");
  }

  return supabase;
}

export function isProofStoragePath(value: string) {
  return value.startsWith(`${PROOF_BUCKET}/`);
}

export function normalizeProofStoragePath(value: string) {
  return value.replace(new RegExp(`^${PROOF_BUCKET}/`), "");
}

export async function uploadTradeProofImage({
  tradeId,
  userId,
  purpose,
  file,
}: {
  tradeId: string;
  userId: string;
  purpose: "seller-delivery" | "buyer-receipt";
  file: File | null;
}) {
  if (!file || file.size === 0) {
    return "";
  }

  if (!ALLOWED_PROOF_TYPES.has(file.type)) {
    throw new Error("Proof image must be a JPEG, PNG, or WebP file.");
  }

  if (file.size > MAX_PROOF_BYTES) {
    throw new Error("Proof image must be 5 MB or smaller.");
  }

  const supabase = getStorageClientOrThrow();
  const extension = EXTENSIONS[file.type];
  const path = `${tradeId}/${purpose}/${Date.now()}-${userId}.${extension}`;
  const { error } = await supabase.storage
    .from(PROOF_BUCKET)
    .upload(path, file, {
      cacheControl: "3600",
      contentType: file.type,
      upsert: false,
    });

  if (error) {
    throw new Error(error.message);
  }

  return `${PROOF_BUCKET}/${path}`;
}

export async function signProofUrl(value?: string) {
  if (!value || !isProofStoragePath(value)) {
    return value;
  }

  const supabase = getStorageClientOrThrow();
  const { data, error } = await supabase.storage
    .from(PROOF_BUCKET)
    .createSignedUrl(normalizeProofStoragePath(value), 60 * 20, {
      transform: {
        width: 1200,
        quality: 80,
      },
    });

  if (error) {
    return undefined;
  }

  return data.signedUrl;
}
