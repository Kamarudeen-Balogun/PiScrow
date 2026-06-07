export const platformFeeBps = Number(
  process.env.NEXT_PUBLIC_PISCROW_PLATFORM_FEE_BPS ?? "200",
);

const minimumPlatformFeeTestPi = 0.01;

function roundTestPi(amount: number) {
  return Math.round((amount + Number.EPSILON) * 10000) / 10000;
}

export function calculatePlatformFee(amountTestPi: number) {
  if (!Number.isFinite(amountTestPi) || amountTestPi <= 0) {
    return 0;
  }

  return roundTestPi(
    Math.max((amountTestPi * platformFeeBps) / 10000, minimumPlatformFeeTestPi),
  );
}

export function calculateSellerReceivable(amountTestPi: number) {
  return roundTestPi(amountTestPi);
}

export function calculateBuyerTotal(amountTestPi: number) {
  return roundTestPi(amountTestPi + calculatePlatformFee(amountTestPi));
}

export function feePercentLabel() {
  return `${platformFeeBps / 100}%`;
}
