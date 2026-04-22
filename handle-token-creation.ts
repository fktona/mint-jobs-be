import BN from 'bn.js'
// moved upload to server endpoint `/api/upload-assets`
import {
  getPdaLaunchpadConfigId,
  LAUNCHPAD_PROGRAM,
  LaunchpadConfig,
  txToBase64,
  TxVersion,
} from '@raydium-io/raydium-sdk-v2'
import { NATIVE_MINT } from '@solana/spl-token'
import { Keypair, PublicKey, VersionedTransaction } from '@solana/web3.js'
import { Raydium } from '@raydium-io/raydium-sdk-v2'
import { API_CONSTANTS } from './lauchpad-constant'
import { initSdk } from './config'

interface CreateTokenRequest {
  formData: FormData
  image: File
  metadata: any
  walletPublicKey: string
}



// Vanity key retrieval moved to server route `/api/vanity-key`

export async function handleCreateToken(request: CreateTokenRequest) {
  const raydium = await initSdk(request.walletPublicKey);
  try {
const {raydium, image, metadata} = request

    const {
      name,
      symbol,
      description,
      website,
      twitter,
      telegram,
      decimals,
      buyAmount,
      slippage,
      walletPublicKey,
      signedMessage,
      signature,
      tokenCA,
      provider,
    } = metadata

    if (!walletPublicKey || !signedMessage || !signature) {
      return  { error: 'Missing wallet authentication' }
    }

    if (!image) {
      return { error: 'Missing token image' }
    }

    const message = new TextEncoder().encode(signedMessage)
    const publicKey = new PublicKey(walletPublicKey)
    const programId = LAUNCHPAD_PROGRAM

    let pair: Keypair
    let mintA: string

    if (tokenCA) {
      mintA = tokenCA
      // fetch private key bytes from server
      const resp = await fetch('/api/vanity-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: tokenCA }),
      })
      if (resp.ok) {
        const { privateKey } = await resp.json()
        if (privateKey && Array.isArray(privateKey)) {
          pair = Keypair.fromSecretKey(new Uint8Array(privateKey))
          console.log(`Using vanity address: ${mintA} with private key from server`)
        } else {
          pair = Keypair.generate()
          
        }
      } else {
        pair = Keypair.generate()
        console.warn(`Failed to fetch private key for vanity address ${tokenCA}, generated new keypair`)
      }
    } else {
      pair = Keypair.generate()
      mintA = pair.publicKey.toBase58()
      console.log(`Generated new mint address: ${mintA}`)
    }

    const configIdObj = getPdaLaunchpadConfigId(programId, NATIVE_MINT, 0, 0)
    console.log('configIdObj', configIdObj)
    const configId = configIdObj.publicKey


    const configData = await raydium.connection.getAccountInfo(configId)
    console.log('configData', configData)
    if (!configData) {
      return { error: 'Config not found' }
    }

    const configInfo = LaunchpadConfig.decode(configData.data)
    const mintBInfo = await raydium.token.getTokenInfo(configInfo.mintB)
    console.log('mintBInfjjjo', buyAmount)
    const inAmount = buyAmount ? new BN(Number(buyAmount) * 1_000_000_000) : new BN(1000)

    const tokenMetadata = {
      name,
      symbol,
      description,
      external_url: website || '',
      twitter: twitter || '',
      telegram: telegram || '',
      website: website,
      created_at: new Date().toISOString(),
      created_on: 'https://mintjobs.fun',
    }
    // Upload image + metadata via server endpoint
    const uploadForm = new FormData()
    uploadForm.append('image', image)
    uploadForm.append('metadata', JSON.stringify(tokenMetadata))

    const uploadRes = await fetch('/api/upload-assets', { method: 'POST', body: uploadForm })
    if (!uploadRes.ok) {
      const err = await uploadRes.json().catch(() => ({}))
      return { error: err?.error || 'Failed to upload token assets' }
    }
    const { imageUri, metadataUri } = await uploadRes.json()

    console.log(provider, 'provider')

    const shouldCreateOnly =  !buyAmount

    console.log(shouldCreateOnly, 'bhvhjv')

    const { transactions, extInfo, execute } = await raydium.launchpad.createLaunchpad({
      programId,
      mintA: new PublicKey(mintA),
      decimals: decimals || 6,
      name,
      symbol,
      migrateType: 'cpmm',
      uri: metadataUri,
      configId,
      platformId: new PublicKey(API_CONSTANTS.platformId),
      configInfo,
      mintBDecimals: mintBInfo.decimals,
      txVersion: TxVersion.V0,
      slippage: new BN(slippage || 100),
      buyAmount: inAmount,
      createOnly: shouldCreateOnly,
      extraSigners: [pair],
    })

    let txId = ''

    // Send transactions directly from server-side
    const { signedTxs, txIds } = await execute({ sequentially: true })
    console.log(signedTxs, 'signedTxs - transactions sent from server')
    console.log(txIds, 'txIds - transaction IDs from server')

    if (signedTxs) {
      return {
        success: true,
        mintAddress: mintA,
        txIds: txIds, // Return transaction IDs instead of transactions
        imageUri,
        metadataUri,
        extInfo: {
          ...extInfo,
          poolId: extInfo.address.poolId.toBase58(),
          ammId: extInfo.address.epoch.toString(),
          mintA: extInfo.address.mintA.toBase58(),
        },
        twitter,
        telegram,
        website,
        sent: true, // Flag to indicate transactions were already sent
      }
    }

    return { error: 'Unexpected state' }
  } catch (error) {
    console.error('Error creating token:', error)
    return { error: error instanceof Error ? error.message : 'Failed to create token' }
  }
}


