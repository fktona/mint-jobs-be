/**
 * Validate Solana wallet address format
 * Solana addresses are base58 encoded and typically 32-44 characters
 */
export function isValidSolanaAddress(address: string): boolean {
  if (!address || typeof address !== 'string') {
    return false;
  }

  // Basic format check: base58 characters, 32-44 chars
  const base58Regex = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
  return base58Regex.test(address);
}

/**
 * Validate Ethereum wallet address format
 */
export function isValidEthereumAddress(address: string): boolean {
  if (!address || typeof address !== 'string') {
    return false;
  }

  // Ethereum addresses are 42 characters (0x + 40 hex chars)
  const ethRegex = /^0x[a-fA-F0-9]{40}$/;
  return ethRegex.test(address);
}

/**
 * Normalize wallet address (lowercase for Ethereum)
 */
export function normalizeWalletAddress(address: string): string {
  if (address.startsWith('0x')) {
    return address.toLowerCase();
  }
  return address;
}
