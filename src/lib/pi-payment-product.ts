export const piscrowPaymentProduct = "PiScrow escrow funding";

export function piEscrowMemo(tradeId?: string) {
  void tradeId;
  return "PiScrow escrow funding";
}

export function piEscrowLegacyMemo(tradeId: string) {
  return `PiScrow escrow payment for trade ${tradeId}`;
}
