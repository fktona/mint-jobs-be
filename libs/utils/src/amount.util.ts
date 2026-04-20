/**
 * Convert amount to smallest unit (e.g., SOL to lamports, USDC to micro-USDC)
 */
export function toSmallestUnit(amount: number, decimals: number = 9): bigint {
  return BigInt(Math.floor(amount * Math.pow(10, decimals)));
}

/**
 * Convert from smallest unit to human-readable amount
 */
export function fromSmallestUnit(
  amount: bigint | string,
  decimals: number = 9,
): number {
  const bigIntAmount = typeof amount === 'string' ? BigInt(amount) : amount;
  return Number(bigIntAmount) / Math.pow(10, decimals);
}

/**
 * Format amount with decimals
 */
export function formatAmount(amount: number, decimals: number = 2): string {
  return amount.toFixed(decimals);
}

/**
 * Parse amount string to number
 */
export function parseAmount(amount: string): number {
  return parseFloat(amount);
}

/**
 * Validate amount is positive
 */
export function isValidAmount(amount: number): boolean {
  return amount > 0 && isFinite(amount);
}
