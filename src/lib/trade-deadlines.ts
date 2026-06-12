export const DELIVERY_WINDOW_DAYS = 7;
export const DELIVERY_WINDOW_MS =
  DELIVERY_WINDOW_DAYS * 24 * 60 * 60 * 1000;

export function buildDeliveryDueAt(from = Date.now()) {
  return new Date(from + DELIVERY_WINDOW_MS).toISOString();
}
