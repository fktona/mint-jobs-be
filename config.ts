import {
  parseTokenAccountResp,
  Raydium,
  TxVersion,
} from '@raydium-io/raydium-sdk-v2';
import {
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import {
  Connection,
  PublicKey,
} from '@solana/web3.js';

// export const connection = new Connection('https://api.devnet.solana.com')
export const connection = new Connection('https://mainnet.helius-rpc.com/?api-key=5b476d89-5514-4f8c-8238-066c06008780')
export const txVersion = TxVersion.V0
// const cluster = 'mainnet'
const cluster = 'mainnet'

let raydium: Raydium | undefined
export const initSdk = async (wallet?: any, params?: { loadToken?: boolean; signAllTransactions?: any }) => {
  let base58Wallet: PublicKey | undefined
  if (wallet) {
   base58Wallet = new PublicKey(wallet)
  }
  console.log("Initializing SDK with wallet:", base58Wallet);
  console.log("Sign All Transactions:", params?.signAllTransactions);

  // Always reinitialize if signAllTransactions is provided
  if (params?.signAllTransactions) {
    raydium = await Raydium.load({
      owner: base58Wallet,
      connection,
      cluster,
      disableFeatureCheck: true,
      disableLoadToken: !params?.loadToken,
      signAllTransactions: params.signAllTransactions,
      blockhashCommitment: 'finalized',
    })

    console.log(raydium, 'raydium')
    return raydium
  }

  // Otherwise use cached instance if available
  if (raydium) return raydium

  raydium = await Raydium.load({
    owner: base58Wallet,
    connection,
    cluster,
    disableFeatureCheck: true,
    disableLoadToken: !params?.loadToken,
    blockhashCommitment: 'finalized',
  })
  return raydium
}

export const fetchTokenAccountData = async (wallet: any) => {
  const base58Wallet = new PublicKey(wallet)
  const solAccountResp = await connection.getAccountInfo(base58Wallet)
  const tokenAccountResp = await connection.getTokenAccountsByOwner(base58Wallet, { programId: TOKEN_PROGRAM_ID })
  const token2022Req = await connection.getTokenAccountsByOwner(base58Wallet, { programId: TOKEN_2022_PROGRAM_ID })
  const tokenAccountData = parseTokenAccountResp({
    owner: base58Wallet,
    solAccountResp,
    tokenAccountResp: {
      context: tokenAccountResp.context,
      value: [...tokenAccountResp.value, ...token2022Req.value],
    },
  })
  return tokenAccountData
}
