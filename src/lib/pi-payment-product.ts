export const piscrowPaymentProduct = "PiScrow escrow funding";

export function piEscrowMemo(tradeId: string) {
  return `PiScrow escrow payment for trade ${tradeId}`;
}
