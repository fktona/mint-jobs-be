import { PublicKey } from '@solana/web3.js';
import { DEVNET_PROGRAM_ID } from '@raydium-io/raydium-sdk-v2';

export type SolanaNetwork = 'mainnet' | 'devnet';

export const LAUNCHPAD_MAINNET_PLATFORM_ID = new PublicKey(
  'G9MqNREhz6gBtLtmn7gYGMJALH3TQwT4ERdYKDdUJr1w',
);

export const LAUNCHPAD_DEVNET_PLATFORM_ID = new PublicKey(
  DEVNET_PROGRAM_ID.LAUNCHPAD_PLATFORM,
);

export const LAUNCHPAD_DEVNET_PROGRAM_ID = new PublicKey(
  DEVNET_PROGRAM_ID.LAUNCHPAD_PROGRAM,
);
