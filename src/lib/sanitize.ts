const MAX_SANITIZED_DEPTH = 8;

export function sanitizeText(value: string) {
  return value
    .replace(/\u0000/g, "")
    .replace(/[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(
      /<\s*\/?\s*(script|iframe|object|embed|link|meta|style|svg|math)[^>]*>/gi,
      "",
    )
    .replace(/\son[a-z]+\s*=\s*(['"]).*?\1/gi, "")
    .replace(/\s(href|src)\s*=\s*(['"])\s*javascript:.*?\2/gi, "")
    .trim();
}

export function sanitizeInput(value: unknown, depth = 0): unknown {
  if (depth > MAX_SANITIZED_DEPTH) {
    return "";
  }

  if (typeof value === "string") {
    return sanitizeText(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeInput(item, depth + 1));
  }

  if (value && typeof value === "object") {
    if (typeof File !== "undefined" && value instanceof File) {
      return value;
    }

    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        sanitizeText(key),
        sanitizeInput(item, depth + 1),
      ]),
    );
  }

  return value;
}

export function sanitizeFormFields(formData: FormData) {
  return Object.fromEntries(
    [...formData.entries()].map(([key, value]) => [
      sanitizeText(key),
      typeof value === "string" ? sanitizeText(value) : value,
    ]),
  );
}
