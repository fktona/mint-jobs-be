import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  AccountMeta,
  SystemProgram,
} from '@solana/web3.js';
import { createHash } from 'crypto';
import { ConfigService } from '@mintjobs/config';
import { PrivyService } from '@mintjobs/privy';
import { PublisherService } from '@mintjobs/messaging';
import { MessagePattern } from '@mintjobs/constants';
import { Escrow, EscrowStatus } from './entities/escrow.entity';
import { Milestone, MilestoneStatus } from './entities/milestone.entity';

/** Platform fee: 2.5% at fund/lock, 2.5% at release = 5% total */
const FEE_BPS = 250n;
const BPS_DENOMINATOR = 10_000n;

/** On-chain deserialized JobEscrow account */
interface OnChainEscrow {
  client: PublicKey;
  freelancer: PublicKey;
  authority: PublicKey;
  jobId: string;
  amount: bigint;
  platformFee: bigint;
  /** 0=Funded 1=Locked 2=Released 3=Refunded */
  status: number;
  bump: number;
  vaultBump: number;
  platformFeeVaultBump: number;
}

@Injectable()
export class EscrowService {
  private readonly logger = new Logger(EscrowService.name);

  private safePublish(pattern: any, data: Record<string, unknown>): void {
    this.publisherService.publish(pattern, data).catch((err) =>
      this.logger.warn(`Failed to publish ${pattern}`, err),
    );
  }
  private readonly connection: Connection;
  private readonly programId: PublicKey;
  private readonly authority: Keypair | null = null;
  private readonly BLOCKHASH_FETCH_RETRIES = 3;

  constructor(
    @InjectRepository(Escrow)
    private readonly escrowRepository: Repository<Escrow>,
    @InjectRepository(Milestone)
    private readonly milestoneRepository: Repository<Milestone>,
    private readonly configService: ConfigService,
    private readonly privyService: PrivyService,
    private readonly publisherService: PublisherService,
  ) {
    const { rpcUrl, programId, authorityKeypair } = this.configService.solana;

    if (!rpcUrl) {
      throw new ServiceUnavailableException(
        'SOLANA_RPC_URL is not configured for escrow-service',
      );
    }

    this.connection = new Connection(rpcUrl, 'confirmed');

    try {
      this.programId = new PublicKey(programId);
    } catch {
      this.logger.warn('Invalid or missing SOLANA_PROGRAM_ID — using default pubkey');
      this.programId = PublicKey.default;
    }

    if (authorityKeypair) {
      try {
        const keypairBytes: number[] = JSON.parse(
          Buffer.from(authorityKeypair, 'base64').toString('utf-8'),
        );
        this.authority = Keypair.fromSecretKey(Uint8Array.from(keypairBytes));
        this.logger.log(`Authority wallet: ${this.authority.publicKey.toBase58()}`);
      } catch {
        this.logger.warn('Failed to parse SOLANA_AUTHORITY_KEYPAIR');
      }
    }
  }

  // ─── PDA derivation ─────────────────────────────────────────────────────

  /** SHA-256 the job UUID to fit the 32-byte PDA seed limit (matches on-chain logic). */
  private jobIdSeed(jobId: string): Buffer {
    return createHash('sha256').update(jobId).digest();
  }

  deriveEscrowPda(jobId: string): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('escrow'), this.jobIdSeed(jobId)],
      this.programId,
    );
  }

  deriveVaultPda(jobId: string): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('vault'), this.jobIdSeed(jobId)],
      this.programId,
    );
  }

  derivePlatformFeeVaultPda(): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('platform_fee')],
      this.programId,
    );
  }

  deriveContractPda(jobId: string): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('contract'), this.jobIdSeed(jobId)],
      this.programId,
    );
  }

  /** Read and deserialize the on-chain JobContract account. */
  async getOnChainContract(jobId: string): Promise<{
    pda: string;
    client: string;
    freelancer: string;
    authority: string;
    metadataUri: string;
    pdfHash: string;
    createdAt: number;
    state: 'active' | 'completed' | 'terminated';
    completionUri: string;
    completionPdfHash: string;
    completedAt: number;
  } | null> {
    const [contractPda] = this.deriveContractPda(jobId);
    const accountInfo = await this.connection.getAccountInfo(contractPda);
    if (!accountInfo) return null;

    const data = accountInfo.data;
    let o = 8; // skip discriminator

    const client = new PublicKey(data.subarray(o, o + 32)).toBase58(); o += 32;
    const freelancer = new PublicKey(data.subarray(o, o + 32)).toBase58(); o += 32;
    const authority = new PublicKey(data.subarray(o, o + 32)).toBase58(); o += 32;
    o += 32; // job_id hash (internal)

    const metadataUriLen = data.readUInt32LE(o); o += 4;
    const metadataUri = data.subarray(o, o + metadataUriLen).toString('utf-8'); o += metadataUriLen;

    const pdfHash = data.subarray(o, o + 32).toString('hex'); o += 32;
    const createdAt = Number(data.readBigInt64LE(o)); o += 8;

    const stateRaw = data.readUInt8(o); o += 1;
    const stateMap: Record<number, 'active' | 'completed' | 'terminated'> = {
      0: 'active', 1: 'completed', 2: 'terminated',
    };
    const state = stateMap[stateRaw] ?? 'active';

    const completionUriLen = data.readUInt32LE(o); o += 4;
    const completionUri = completionUriLen > 0
      ? data.subarray(o, o + completionUriLen).toString('utf-8')
      : '';
    o += completionUriLen;

    const completionPdfHash = data.subarray(o, o + 32).toString('hex'); o += 32;
    const completedAt = Number(data.readBigInt64LE(o)); o += 8;

    return {
      pda: contractPda.toBase58(),
      client, freelancer, authority,
      metadataUri, pdfHash, createdAt,
      state, completionUri, completionPdfHash, completedAt,
    };
  }

  // ─── Instruction encoding helpers ───────────────────────────────────────

  /** Compute Anchor discriminator: sha256("global:<name>")[0:8] */
  private disc(name: string): Buffer {
    return Buffer.from(createHash('sha256').update(`global:${name}`).digest()).subarray(0, 8);
  }

  private encodeString(s: string): Buffer {
    const bytes = Buffer.from(s, 'utf-8');
    const len = Buffer.alloc(4);
    len.writeUInt32LE(bytes.length, 0);
    return Buffer.concat([len, bytes]);
  }

  private encodeU64(n: bigint): Buffer {
    const buf = Buffer.alloc(8);
    buf.writeBigUInt64LE(n, 0);
    return buf;
  }

  private async getLatestBlockhashWithRetry(): Promise<{
    blockhash: string;
    lastValidBlockHeight: number;
  }> {
    let lastError: unknown;

    for (let attempt = 1; attempt <= this.BLOCKHASH_FETCH_RETRIES; attempt += 1) {
      try {
        return await this.connection.getLatestBlockhash('confirmed');
      } catch (error) {
        lastError = error;
        this.logger.warn(
          `Failed to fetch latest blockhash (attempt ${attempt}/${this.BLOCKHASH_FETCH_RETRIES})`,
        );
      }
    }

    const reason =
      lastError instanceof Error ? lastError.message : 'Unknown Solana RPC error';
    throw new ServiceUnavailableException(
      `Unable to fetch latest blockhash from Solana RPC after ${this.BLOCKHASH_FETCH_RETRIES} attempts: ${reason}`,
    );
  }

  // ─── On-chain state reading ──────────────────────────────────────────────

  async fetchOnChainEscrow(escrowPda: PublicKey): Promise<OnChainEscrow | null> {
    try {
      const accountInfo = await this.connection.getAccountInfo(escrowPda);
      if (!accountInfo) return null;
      return this.deserializeEscrow(accountInfo.data);
    } catch (err) {
      this.logger.error('Failed to fetch on-chain escrow', err);
      return null;
    }
  }

  private deserializeEscrow(data: Buffer): OnChainEscrow {
    let o = 8; // skip 8-byte discriminator
    const client = new PublicKey(data.subarray(o, o + 32)); o += 32;
    const freelancer = new PublicKey(data.subarray(o, o + 32)); o += 32;
    const authority = new PublicKey(data.subarray(o, o + 32)); o += 32;
    const jobIdBytes = data.subarray(o, o + 32); o += 32; // stored as 32-byte SHA-256 hash
    const amount = data.readBigUInt64LE(o); o += 8;
    const platformFee = data.readBigUInt64LE(o); o += 8;
    const status = data.readUInt8(o); o += 1;
    const bump = data.readUInt8(o); o += 1;
    const vaultBump = data.readUInt8(o); o += 1;
    const platformFeeVaultBump = data.readUInt8(o); o += 1;
    return { client, freelancer, authority, jobId: jobIdBytes.toString('utf-8'), amount, platformFee, status, bump, vaultBump, platformFeeVaultBump };
  }

  // ─── Privy sign + broadcast helper ──────────────────────────────────────

  private async signAndBroadcast(
    tx: Transaction,
    walletId: string,
    userJwt: string,
  ): Promise<string> {
    const { blockhash, lastValidBlockHeight } =
      await this.getLatestBlockhashWithRetry();
    tx.recentBlockhash = blockhash;

    const base64Tx = tx.serialize({ requireAllSignatures: false }).toString('base64');
    const signedBase64 = await this.privyService.signSolanaTransaction(
      walletId,
      base64Tx,
      userJwt,
    );

    const signedTx = Transaction.from(Buffer.from(signedBase64, 'base64'));
    const sig = await this.connection.sendRawTransaction(signedTx.serialize());
    await this.connection.confirmTransaction(
      { signature: sig, blockhash, lastValidBlockHeight },
      'confirmed',
    );
    return sig;
  }

  // ─── Client instructions (signed via Privy server-side) ──────────────────

  /**
   * Fund escrow.
   * - signingMode='server' (default): signs via Privy + broadcasts → { txSignature }
   * - signingMode='client': returns unsigned base64 tx for frontend to sign → { transaction }
   */
  async fundJob(
    jobId: string,
    clientId: string,
    clientWallet: string,
    amountLamports: bigint,
    signingMode: 'server' | 'client',
    walletId?: string,
    userJwt?: string,
  ): Promise<{ txSignature?: string; transaction?: string; escrowPda: string; vaultPda: string }> {
    const [escrowPda] = this.deriveEscrowPda(jobId);
    const [vaultPda] = this.deriveVaultPda(jobId);
    const [platformFeeVaultPda] = this.derivePlatformFeeVaultPda();
    const authorityPubkey = this.authority?.publicKey ?? PublicKey.default;

    const existing = await this.escrowRepository.findOne({ where: { jobId } });
    if (existing && existing.status !== EscrowStatus.REFUNDED) {
      throw new ConflictException(
        `Escrow for job ${jobId} already exists (status: ${existing.status})`,
      );
    }

    // Fee computed client-side for DB tracking; on-chain program computes independently
    const platformFeeLamports = amountLamports * FEE_BPS / BPS_DENOMINATOR;

    const keys: AccountMeta[] = [
      { pubkey: new PublicKey(clientWallet), isSigner: true, isWritable: true },
      { pubkey: authorityPubkey, isSigner: false, isWritable: false },
      { pubkey: escrowPda, isSigner: false, isWritable: true },
      { pubkey: vaultPda, isSigner: false, isWritable: true },
      { pubkey: platformFeeVaultPda, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ];

    const tx = new Transaction();
    tx.feePayer = new PublicKey(clientWallet);
    tx.add(new TransactionInstruction({
      keys,
      programId: this.programId,
      data: Buffer.concat([this.disc('initialize_escrow'), this.encodeString(jobId), this.encodeU64(amountLamports)]),
    }));

    if (signingMode === 'server') {
      if (!walletId || !userJwt) throw new BadRequestException('walletId and userJwt are required for server-side signing');
      const sig = await this.signAndBroadcast(tx, walletId, userJwt);
      this.logger.log(`Escrow funded (server) for job ${jobId} | sig: ${sig}`);
      await this.escrowRepository.upsert(
        { jobId, clientId, clientWallet, escrowPda: escrowPda.toBase58(), vaultPda: vaultPda.toBase58(), amountLamports: amountLamports.toString(), platformFeeLamports: platformFeeLamports.toString(), status: EscrowStatus.FUNDED, freelancerId: null, freelancerWallet: null, txSignature: sig },
        ['jobId'],
      );
      this.safePublish(MessagePattern.JOB_SET_ACTIVE, { jobId, isActive: true });
      this.safePublish(MessagePattern.ESCROW_FUNDED, { jobId, clientId, amountLamports: amountLamports.toString() });
      return { txSignature: sig, escrowPda: escrowPda.toBase58(), vaultPda: vaultPda.toBase58() };
    }

    // Client mode: return unsigned tx; no DB write until client confirms broadcast
    const { blockhash } = await this.getLatestBlockhashWithRetry();
    tx.recentBlockhash = blockhash;
    return {
      transaction: tx.serialize({ requireAllSignatures: false }).toString('base64'),
      escrowPda: escrowPda.toBase58(),
      vaultPda: vaultPda.toBase58(),
    };
  }

  /**
   * Top up an existing Funded or Locked escrow with additional SOL.
   * - Funded (pre-hire): fee deferred into escrow.platform_fee — refunded on withdraw
   * - Locked (in-progress): fee transferred immediately to platform_fee_vault — non-refundable
   * - signingMode='server': signs via Privy + broadcasts → { txSignature }
   * - signingMode='client': returns unsigned base64 tx → { transaction }
   */
  async topUpJob(
    jobId: string,
    clientWallet: string,
    additionalLamports: bigint,
    signingMode: 'server' | 'client',
    walletId?: string,
    userJwt?: string,
  ): Promise<{ txSignature?: string; transaction?: string }> {
    const [escrowPda] = this.deriveEscrowPda(jobId);
    const [vaultPda] = this.deriveVaultPda(jobId);
    const [platformFeeVaultPda] = this.derivePlatformFeeVaultPda();

    // Guard: only allowed when Funded (0) or Locked (1)
    const onChain = await this.fetchOnChainEscrow(escrowPda);
    if (onChain) {
      if (onChain.status !== 0 && onChain.status !== 1) {
        throw new BadRequestException(
          `Top-up not allowed — escrow is already finalised (on-chain status: ${onChain.status})`,
        );
      }
    } else {
      const dbRecord = await this.escrowRepository.findOne({ where: { jobId } });
      if (!dbRecord) throw new NotFoundException(`Escrow for job ${jobId} not found`);
      if (dbRecord.status !== EscrowStatus.FUNDED && dbRecord.status !== EscrowStatus.LOCKED) {
        throw new BadRequestException(
          `Top-up not allowed — escrow is already finalised (db status: ${dbRecord.status})`,
        );
      }
    }

    const keys: AccountMeta[] = [
      { pubkey: new PublicKey(clientWallet), isSigner: true, isWritable: true },
      { pubkey: escrowPda, isSigner: false, isWritable: true },
      { pubkey: vaultPda, isSigner: false, isWritable: true },
      { pubkey: platformFeeVaultPda, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ];

    const tx = new Transaction();
    tx.feePayer = new PublicKey(clientWallet);
    tx.add(new TransactionInstruction({
      keys,
      programId: this.programId,
      data: Buffer.concat([this.disc('top_up'), this.encodeString(jobId), this.encodeU64(additionalLamports)]),
    }));

    if (signingMode === 'server') {
      if (!walletId || !userJwt) throw new BadRequestException('walletId and userJwt are required for server-side signing');
      const sig = await this.signAndBroadcast(tx, walletId, userJwt);
      this.logger.log(`Escrow topped up (server) for job ${jobId} | +${additionalLamports} lamports | sig: ${sig}`);
      // Update DB amount
      const dbRecord = await this.escrowRepository.findOne({ where: { jobId } });
      if (dbRecord) {
        const newAmount = (BigInt(dbRecord.amountLamports) + additionalLamports).toString();
        await this.escrowRepository.update({ jobId }, { amountLamports: newAmount, txSignature: sig });
      }
      return { txSignature: sig };
    }

    const { blockhash } = await this.getLatestBlockhashWithRetry();
    tx.recentBlockhash = blockhash;
    return { transaction: tx.serialize({ requireAllSignatures: false }).toString('base64') };
  }

  /**
   * Withdraw escrow (pre-hire).
   * - signingMode='server': signs via Privy + broadcasts → { txSignature }
   * - signingMode='client': returns unsigned base64 tx → { transaction }
   */
  async withdrawJob(
    jobId: string,
    clientWallet: string,
    signingMode: 'server' | 'client',
    walletId?: string,
    userJwt?: string,
  ): Promise<{ txSignature?: string; transaction?: string }> {
    const [escrowPda] = this.deriveEscrowPda(jobId);
    const [vaultPda] = this.deriveVaultPda(jobId);

    const onChain = await this.fetchOnChainEscrow(escrowPda);
    if (onChain) {
      if (onChain.status !== 0) {
        throw new BadRequestException(
          `Escrow is not in Funded status — withdrawal not allowed (on-chain status: ${onChain.status})`,
        );
      }
    } else {
      // On-chain read unavailable — fall back to DB record for status check
      const dbRecord = await this.escrowRepository.findOne({ where: { jobId } });
      if (!dbRecord) throw new NotFoundException(`Escrow for job ${jobId} not found`);
      if (dbRecord.status !== EscrowStatus.FUNDED) {
        throw new BadRequestException(
          `Escrow is not in Funded status — withdrawal not allowed (db status: ${dbRecord.status})`,
        );
      }
      this.logger.warn(`On-chain read unavailable for job ${jobId} — using DB status for withdraw guard`);
    }

    const keys: AccountMeta[] = [
      { pubkey: new PublicKey(clientWallet), isSigner: true, isWritable: true },
      { pubkey: escrowPda, isSigner: false, isWritable: true },
      { pubkey: vaultPda, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ];

    const tx = new Transaction();
    tx.feePayer = new PublicKey(clientWallet);
    tx.add(new TransactionInstruction({
      keys,
      programId: this.programId,
      data: Buffer.concat([this.disc('withdraw'), this.encodeString(jobId)]),
    }));

    if (signingMode === 'server') {
      if (!walletId || !userJwt) throw new BadRequestException('walletId and userJwt are required for server-side signing');
      const sig = await this.signAndBroadcast(tx, walletId, userJwt);
      this.logger.log(`Escrow withdrawn (server) for job ${jobId} | sig: ${sig}`);
      await this.escrowRepository.update({ jobId }, { status: EscrowStatus.REFUNDED, txSignature: sig });
      this.safePublish(MessagePattern.JOB_SET_ACTIVE, { jobId, isActive: false });
      return { txSignature: sig };
    }

    const { blockhash } = await this.getLatestBlockhashWithRetry();
    tx.recentBlockhash = blockhash;
    return { transaction: tx.serialize({ requireAllSignatures: false }).toString('base64') };
  }

  /**
   * Release escrow to freelancer.
   * - signingMode='server': signs via Privy + broadcasts → { txSignature }
   * - signingMode='client': returns unsigned base64 tx → { transaction }
   */
  async releaseJob(
    jobId: string,
    callerWallet: string,
    signingMode: 'server' | 'client',
    walletId?: string,
    userJwt?: string,
  ): Promise<{ txSignature?: string; transaction?: string }> {
    const [escrowPda] = this.deriveEscrowPda(jobId);
    const [vaultPda] = this.deriveVaultPda(jobId);

    const onChain = await this.fetchOnChainEscrow(escrowPda);
    let freelancerPubkey: PublicKey;

    if (onChain) {
      if (onChain.status !== 1) {
        throw new BadRequestException(
          `Escrow is not Locked — release not allowed (on-chain status: ${onChain.status})`,
        );
      }
      freelancerPubkey = onChain.freelancer;
    } else {
      // On-chain read unavailable — fall back to DB record
      const dbRecord = await this.escrowRepository.findOne({ where: { jobId } });
      if (!dbRecord) throw new NotFoundException(`Escrow for job ${jobId} not found`);
      if (dbRecord.status !== EscrowStatus.LOCKED) {
        throw new BadRequestException(
          `Escrow is not Locked — release not allowed (db status: ${dbRecord.status})`,
        );
      }
      if (!dbRecord.freelancerWallet) {
        throw new BadRequestException(`Freelancer wallet not recorded for job ${jobId}`);
      }
      freelancerPubkey = new PublicKey(dbRecord.freelancerWallet);
      this.logger.warn(`On-chain read unavailable for job ${jobId} — using DB for release guard`);
    }

    const [platformFeeVaultPda] = this.derivePlatformFeeVaultPda();

    const keys: AccountMeta[] = [
      { pubkey: new PublicKey(callerWallet), isSigner: true, isWritable: true },
      { pubkey: escrowPda, isSigner: false, isWritable: true },
      { pubkey: freelancerPubkey, isSigner: false, isWritable: true },
      { pubkey: vaultPda, isSigner: false, isWritable: true },
      { pubkey: platformFeeVaultPda, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ];

    const tx = new Transaction();
    tx.feePayer = new PublicKey(callerWallet);
    tx.add(new TransactionInstruction({
      keys,
      programId: this.programId,
      data: Buffer.concat([this.disc('release'), this.encodeString(jobId)]),
    }));

    if (signingMode === 'server') {
      if (!walletId || !userJwt) throw new BadRequestException('walletId and userJwt are required for server-side signing');
      const sig = await this.signAndBroadcast(tx, walletId, userJwt);
      this.logger.log(`Escrow released (server) for job ${jobId} | sig: ${sig}`);
      await this.escrowRepository.update({ jobId }, { status: EscrowStatus.RELEASED, txSignature: sig });
      const releasedRecord = await this.escrowRepository.findOne({ where: { jobId } });
      this.safePublish(MessagePattern.JOB_COMPLETED, { jobId, txSignature: sig, amountLamports: releasedRecord?.amountLamports ?? null });
      this.safePublish(MessagePattern.ESCROW_RELEASED, { jobId, freelancerId: releasedRecord?.freelancerId ?? null, amountLamports: releasedRecord?.amountLamports ?? null });
      return { txSignature: sig };
    }

    const { blockhash } = await this.getLatestBlockhashWithRetry();
    tx.recentBlockhash = blockhash;
    return { transaction: tx.serialize({ requireAllSignatures: false }).toString('base64') };
  }

  /**
   * Authority locks the escrow after a freelancer is hired.
   * Called in response to PROPOSAL_HIRED event.
   */
  async lockFunds(
    jobId: string,
    freelancerWallet: string,
    freelancerId: string,
  ): Promise<void> {
    if (!this.authority) {
      this.logger.error('Authority keypair not configured — cannot lock escrow');
      return;
    }

    const [escrowPda] = this.deriveEscrowPda(jobId);
    const [vaultPda] = this.deriveVaultPda(jobId);
    const [platformFeeVaultPda] = this.derivePlatformFeeVaultPda();

    const onChain = await this.fetchOnChainEscrow(escrowPda);
    if (!onChain) {
      this.logger.warn(`No on-chain escrow for job ${jobId} — client may not have funded yet`);
      return;
    }
    if (onChain.status !== 0) {
      this.logger.warn(`Escrow for job ${jobId} is not Funded (status: ${onChain.status}) — skipping lock`);
      return;
    }

    const data = Buffer.concat([
      this.disc('lock'),
      this.encodeString(jobId),
      Buffer.from(new PublicKey(freelancerWallet).toBytes()),
    ]);

    const keys: AccountMeta[] = [
      { pubkey: this.authority.publicKey, isSigner: true, isWritable: true },
      { pubkey: escrowPda, isSigner: false, isWritable: true },
      { pubkey: vaultPda, isSigner: false, isWritable: true },
      { pubkey: platformFeeVaultPda, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ];

    const ix = new TransactionInstruction({ keys, programId: this.programId, data });

    const { blockhash: lockBlockhash, lastValidBlockHeight: lockHeight } =
      await this.getLatestBlockhashWithRetry();
    const tx = new Transaction();
    tx.recentBlockhash = lockBlockhash;
    tx.feePayer = this.authority.publicKey;
    tx.add(ix);
    tx.sign(this.authority);

    const sig = await this.connection.sendRawTransaction(tx.serialize());
    await this.connection.confirmTransaction(
      { signature: sig, blockhash: lockBlockhash, lastValidBlockHeight: lockHeight },
      'confirmed',
    );

    this.logger.log(`Escrow locked for job ${jobId} | freelancer: ${freelancerWallet} | sig: ${sig}`);

    // Update DB
    await this.escrowRepository.upsert(
      {
        jobId,
        clientId: onChain.client.toBase58(), // use on-chain value as fallback
        clientWallet: onChain.client.toBase58(),
        freelancerId,
        freelancerWallet,
        escrowPda: escrowPda.toBase58(),
        vaultPda: this.deriveVaultPda(jobId)[0].toBase58(),
        amountLamports: onChain.amount.toString(),
        status: EscrowStatus.LOCKED,
        txSignature: sig,
      },
      ['jobId'],
    );
  }

  /**
   * Authority force-refunds the escrow back to the client (dispute resolution).
   * Works for both Funded (pre-hire) and Locked (dispute) states.
   */
  async refundFunds(jobId: string): Promise<{ txSignature: string }> {
    if (!this.authority) throw new BadRequestException('Authority keypair not configured');

    const [escrowPda] = this.deriveEscrowPda(jobId);
    const [vaultPda] = this.deriveVaultPda(jobId);

    const onChain = await this.fetchOnChainEscrow(escrowPda);
    if (!onChain) throw new NotFoundException(`On-chain escrow for job ${jobId} not found`);
    if (onChain.status !== 0 && onChain.status !== 1) {
      throw new BadRequestException(`Escrow for job ${jobId} is already finalised`);
    }

    const [platformFeeVaultPda] = this.derivePlatformFeeVaultPda();
    const data = Buffer.concat([this.disc('refund'), this.encodeString(jobId)]);

    const keys: AccountMeta[] = [
      { pubkey: this.authority.publicKey, isSigner: true, isWritable: true },
      { pubkey: onChain.client, isSigner: false, isWritable: true },
      { pubkey: escrowPda, isSigner: false, isWritable: true },
      { pubkey: vaultPda, isSigner: false, isWritable: true },
      { pubkey: platformFeeVaultPda, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ];

    const ix = new TransactionInstruction({ keys, programId: this.programId, data });

    const { blockhash: refundBlockhash, lastValidBlockHeight: refundHeight } =
      await this.getLatestBlockhashWithRetry();
    const tx = new Transaction();
    tx.recentBlockhash = refundBlockhash;
    tx.feePayer = this.authority.publicKey;
    tx.add(ix);
    tx.sign(this.authority);

    const sig = await this.connection.sendRawTransaction(tx.serialize());
    await this.connection.confirmTransaction(
      { signature: sig, blockhash: refundBlockhash, lastValidBlockHeight: refundHeight },
      'confirmed',
    );

    this.logger.log(`Escrow refunded for job ${jobId} → client ${onChain.client.toBase58()} | sig: ${sig}`);

    // Update DB
    await this.escrowRepository.upsert(
      {
        jobId,
        clientId: onChain.client.toBase58(),
        clientWallet: onChain.client.toBase58(),
        escrowPda: escrowPda.toBase58(),
        vaultPda: vaultPda.toBase58(),
        amountLamports: '0',
        status: EscrowStatus.REFUNDED,
        txSignature: sig,
      },
      ['jobId'],
    );
    this.safePublish(MessagePattern.JOB_SET_ACTIVE, { jobId, isActive: false });
    this.safePublish(MessagePattern.ESCROW_REFUNDED, { jobId, clientId: onChain.client.toBase58(), amountLamports: onChain.amount.toString() });

    return { txSignature: sig };
  }

  /**
   * Confirm a client-broadcast transaction and persist the escrow record.
   * Verifies the tx landed on-chain, then upserts DB with confirmed status.
   */
  async confirmClientTransaction(
    jobId: string,
    clientId: string,
    clientWallet: string,
    options: { txSignature: string } | { signedTransaction: string },
  ): Promise<Escrow> {
    let txSignature: string;

    if ('signedTransaction' in options) {
      // Relay mode: broadcast the signed tx on behalf of the frontend
      const txBytes = Buffer.from(options.signedTransaction, 'base64');
      const { blockhash, lastValidBlockHeight } = await this.getLatestBlockhashWithRetry();
      txSignature = await this.connection.sendRawTransaction(txBytes);
      await this.connection.confirmTransaction(
        { signature: txSignature, blockhash, lastValidBlockHeight },
        'confirmed',
      );
      // confirmTransaction only waits for inclusion — still need to check if program succeeded
      const relayedTxInfo = await this.connection.getTransaction(txSignature, {
        commitment: 'confirmed',
        maxSupportedTransactionVersion: 0,
      });
      if (relayedTxInfo?.meta?.err) {
        throw new BadRequestException(
          `Transaction failed on-chain: ${JSON.stringify(relayedTxInfo.meta.err)}`,
        );
      }
      this.logger.log(`Relayed client tx for job ${jobId} | sig: ${txSignature}`);
    } else {
      // Verify-only mode: tx was already broadcast by the frontend
      txSignature = options.txSignature;
      const txInfo = await this.connection.getTransaction(txSignature, {
        commitment: 'confirmed',
        maxSupportedTransactionVersion: 0,
      });
      if (!txInfo) {
        throw new NotFoundException(`Transaction ${txSignature} not found on-chain`);
      }
      if (txInfo.meta?.err) {
        throw new BadRequestException(
          `Transaction ${txSignature} failed on-chain: ${JSON.stringify(txInfo.meta.err)}`,
        );
      }
    }

    const [escrowPda] = this.deriveEscrowPda(jobId);
    const [vaultPda] = this.deriveVaultPda(jobId);

    const onChain = await this.fetchOnChainEscrow(escrowPda);

    const statusMap: Record<number, EscrowStatus> = {
      0: EscrowStatus.FUNDED,
      1: EscrowStatus.LOCKED,
      2: EscrowStatus.RELEASED,
      3: EscrowStatus.REFUNDED,
    };

    const status = onChain ? (statusMap[onChain.status] ?? EscrowStatus.FUNDED) : EscrowStatus.FUNDED;
    const amountLamports = onChain ? onChain.amount.toString() : '0';

    await this.escrowRepository.upsert(
      {
        jobId,
        clientId,
        clientWallet,
        escrowPda: escrowPda.toBase58(),
        vaultPda: vaultPda.toBase58(),
        amountLamports,
        status,
        freelancerId: null,
        freelancerWallet: null,
        txSignature,
      },
      ['jobId'],
    );

    if (status === EscrowStatus.FUNDED) {
      this.safePublish(MessagePattern.JOB_SET_ACTIVE, { jobId, isActive: true });
    } else if (status === EscrowStatus.REFUNDED) {
      this.safePublish(MessagePattern.JOB_SET_ACTIVE, { jobId, isActive: false });
    } else if (status === EscrowStatus.RELEASED) {
      const record = await this.escrowRepository.findOne({ where: { jobId } });
      this.safePublish(MessagePattern.JOB_COMPLETED, { jobId, txSignature, amountLamports: record?.amountLamports ?? null });
    }

    const record = await this.escrowRepository.findOne({ where: { jobId } });
    return record!;
  }

  // ─── Milestone helpers ───────────────────────────────────────────────────

  /** Publish JOB_SET_ACTIVE based on whether any funded/locked milestones remain. */
  private async updateJobActiveFromMilestones(jobId: string): Promise<void> {
    const active = await this.milestoneRepository.count({
      where: { jobId, status: In([MilestoneStatus.FUNDED, MilestoneStatus.LOCKED]) },
    });
    this.safePublish(MessagePattern.JOB_SET_ACTIVE, { jobId, isActive: active > 0 });
  }

  // ─── Milestone CRUD ──────────────────────────────────────────────────────

  async createMilestones(
    jobId: string,
    milestones: Array<{ title: string; description?: string; order: number; amountLamports: string }>,
  ): Promise<Milestone[]> {
    const entities = milestones.map((m) =>
      this.milestoneRepository.create({
        jobId,
        title: m.title,
        description: m.description ?? null,
        order: m.order,
        amountLamports: m.amountLamports,
        status: MilestoneStatus.PENDING,
      }),
    );
    return this.milestoneRepository.save(entities);
  }

  async getMilestonesByJob(jobId: string): Promise<Milestone[]> {
    return this.milestoneRepository.find({ where: { jobId }, order: { order: 'ASC' } });
  }

  async getMilestone(milestoneId: string): Promise<Milestone> {
    const m = await this.milestoneRepository.findOne({ where: { id: milestoneId } });
    if (!m) throw new NotFoundException(`Milestone ${milestoneId} not found`);
    return m;
  }

  /** Used by PROPOSAL_HIRED handler to get milestones that need locking. */
  async getFundedMilestonesByJob(jobId: string): Promise<Milestone[]> {
    return this.milestoneRepository.find({ where: { jobId, status: MilestoneStatus.FUNDED } });
  }

  // ─── Milestone escrow operations ─────────────────────────────────────────

  /**
   * Fund a milestone. Amount is fixed at milestone creation — no amount param needed.
   * signingMode='server': signs via Privy + broadcasts → { txSignature }
   * signingMode='client': returns unsigned base64 tx → { transaction }
   */
  async fundMilestone(
    milestoneId: string,
    clientId: string,
    clientWallet: string,
    signingMode: 'server' | 'client',
    walletId?: string,
    userJwt?: string,
  ): Promise<{ txSignature?: string; transaction?: string; escrowPda: string; vaultPda: string }> {
    const milestone = await this.milestoneRepository.findOne({ where: { id: milestoneId } });
    if (!milestone) throw new NotFoundException(`Milestone ${milestoneId} not found`);
    if (milestone.status !== MilestoneStatus.PENDING) {
      throw new ConflictException(`Milestone ${milestoneId} cannot be funded (status: ${milestone.status})`);
    }

    const [escrowPda] = this.deriveEscrowPda(milestoneId);
    const [vaultPda] = this.deriveVaultPda(milestoneId);
    const [platformFeeVaultPda] = this.derivePlatformFeeVaultPda();
    const authorityPubkey = this.authority?.publicKey ?? PublicKey.default;
    const amountLamports = BigInt(milestone.amountLamports);

    const keys: AccountMeta[] = [
      { pubkey: new PublicKey(clientWallet), isSigner: true, isWritable: true },
      { pubkey: authorityPubkey, isSigner: false, isWritable: false },
      { pubkey: escrowPda, isSigner: false, isWritable: true },
      { pubkey: vaultPda, isSigner: false, isWritable: true },
      { pubkey: platformFeeVaultPda, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ];

    const tx = new Transaction();
    tx.feePayer = new PublicKey(clientWallet);
    tx.add(new TransactionInstruction({
      keys,
      programId: this.programId,
      data: Buffer.concat([this.disc('initialize_escrow'), this.encodeString(milestoneId), this.encodeU64(amountLamports)]),
    }));

    if (signingMode === 'server') {
      if (!walletId || !userJwt) throw new BadRequestException('walletId and userJwt are required for server-side signing');
      const sig = await this.signAndBroadcast(tx, walletId, userJwt);
      this.logger.log(`Milestone ${milestoneId} funded (server) | sig: ${sig}`);
      await this.milestoneRepository.update(
        { id: milestoneId },
        { status: MilestoneStatus.FUNDED, clientId, clientWallet, escrowPda: escrowPda.toBase58(), vaultPda: vaultPda.toBase58(), txSignature: sig },
      );
      this.safePublish(MessagePattern.JOB_SET_ACTIVE, { jobId: milestone.jobId, isActive: true });
      return { txSignature: sig, escrowPda: escrowPda.toBase58(), vaultPda: vaultPda.toBase58() };
    }

    const { blockhash } = await this.getLatestBlockhashWithRetry();
    tx.recentBlockhash = blockhash;
    return {
      transaction: tx.serialize({ requireAllSignatures: false }).toString('base64'),
      escrowPda: escrowPda.toBase58(),
      vaultPda: vaultPda.toBase58(),
    };
  }

  /**
   * Withdraw a funded milestone (pre-hire only).
   */
  async withdrawMilestone(
    milestoneId: string,
    clientWallet: string,
    signingMode: 'server' | 'client',
    walletId?: string,
    userJwt?: string,
  ): Promise<{ txSignature?: string; transaction?: string }> {
    const milestone = await this.milestoneRepository.findOne({ where: { id: milestoneId } });
    if (!milestone) throw new NotFoundException(`Milestone ${milestoneId} not found`);
    if (milestone.status !== MilestoneStatus.FUNDED) {
      throw new BadRequestException(`Milestone ${milestoneId} is not Funded — withdrawal not allowed (status: ${milestone.status})`);
    }

    const [escrowPda] = this.deriveEscrowPda(milestoneId);
    const [vaultPda] = this.deriveVaultPda(milestoneId);

    const keys: AccountMeta[] = [
      { pubkey: new PublicKey(clientWallet), isSigner: true, isWritable: true },
      { pubkey: escrowPda, isSigner: false, isWritable: true },
      { pubkey: vaultPda, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ];

    const tx = new Transaction();
    tx.feePayer = new PublicKey(clientWallet);
    tx.add(new TransactionInstruction({
      keys,
      programId: this.programId,
      data: Buffer.concat([this.disc('withdraw'), this.encodeString(milestoneId)]),
    }));

    if (signingMode === 'server') {
      if (!walletId || !userJwt) throw new BadRequestException('walletId and userJwt are required for server-side signing');
      const sig = await this.signAndBroadcast(tx, walletId, userJwt);
      this.logger.log(`Milestone ${milestoneId} withdrawn (server) | sig: ${sig}`);
      await this.milestoneRepository.update({ id: milestoneId }, { status: MilestoneStatus.REFUNDED, txSignature: sig });
      await this.updateJobActiveFromMilestones(milestone.jobId);
      return { txSignature: sig };
    }

    const { blockhash } = await this.getLatestBlockhashWithRetry();
    tx.recentBlockhash = blockhash;
    return { transaction: tx.serialize({ requireAllSignatures: false }).toString('base64') };
  }

  /**
   * Release a locked milestone to the freelancer.
   */
  async releaseMilestone(
    milestoneId: string,
    callerWallet: string,
    signingMode: 'server' | 'client',
    walletId?: string,
    userJwt?: string,
  ): Promise<{ txSignature?: string; transaction?: string }> {
    const milestone = await this.milestoneRepository.findOne({ where: { id: milestoneId } });
    if (!milestone) throw new NotFoundException(`Milestone ${milestoneId} not found`);
    if (milestone.status !== MilestoneStatus.LOCKED) {
      throw new BadRequestException(`Milestone ${milestoneId} is not Locked — release not allowed (status: ${milestone.status})`);
    }
    if (!milestone.freelancerWallet) {
      throw new BadRequestException(`Freelancer wallet not set for milestone ${milestoneId}`);
    }

    const [escrowPda] = this.deriveEscrowPda(milestoneId);
    const [vaultPda] = this.deriveVaultPda(milestoneId);
    const [platformFeeVaultPda] = this.derivePlatformFeeVaultPda();
    const freelancerPubkey = new PublicKey(milestone.freelancerWallet);

    const keys: AccountMeta[] = [
      { pubkey: new PublicKey(callerWallet), isSigner: true, isWritable: true },
      { pubkey: escrowPda, isSigner: false, isWritable: true },
      { pubkey: freelancerPubkey, isSigner: false, isWritable: true },
      { pubkey: vaultPda, isSigner: false, isWritable: true },
      { pubkey: platformFeeVaultPda, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ];

    const tx = new Transaction();
    tx.feePayer = new PublicKey(callerWallet);
    tx.add(new TransactionInstruction({
      keys,
      programId: this.programId,
      data: Buffer.concat([this.disc('release'), this.encodeString(milestoneId)]),
    }));

    if (signingMode === 'server') {
      if (!walletId || !userJwt) throw new BadRequestException('walletId and userJwt are required for server-side signing');
      const sig = await this.signAndBroadcast(tx, walletId, userJwt);
      this.logger.log(`Milestone ${milestoneId} released (server) | sig: ${sig}`);
      await this.milestoneRepository.update({ id: milestoneId }, { status: MilestoneStatus.RELEASED, txSignature: sig });
      return { txSignature: sig };
    }

    const { blockhash } = await this.getLatestBlockhashWithRetry();
    tx.recentBlockhash = blockhash;
    return { transaction: tx.serialize({ requireAllSignatures: false }).toString('base64') };
  }

  /**
   * Authority force-refunds a milestone back to the client (dispute resolution).
   */
  async refundMilestone(milestoneId: string): Promise<{ txSignature: string }> {
    if (!this.authority) throw new BadRequestException('Authority keypair not configured');

    const milestone = await this.milestoneRepository.findOne({ where: { id: milestoneId } });
    if (!milestone) throw new NotFoundException(`Milestone ${milestoneId} not found`);
    if (milestone.status !== MilestoneStatus.FUNDED && milestone.status !== MilestoneStatus.LOCKED) {
      throw new BadRequestException(`Milestone ${milestoneId} is already finalised (status: ${milestone.status})`);
    }
    if (!milestone.clientWallet) throw new BadRequestException(`Client wallet not set for milestone ${milestoneId}`);

    const [escrowPda] = this.deriveEscrowPda(milestoneId);
    const [vaultPda] = this.deriveVaultPda(milestoneId);
    const [platformFeeVaultPda] = this.derivePlatformFeeVaultPda();
    const clientPubkey = new PublicKey(milestone.clientWallet);

    const keys: AccountMeta[] = [
      { pubkey: this.authority.publicKey, isSigner: true, isWritable: true },
      { pubkey: clientPubkey, isSigner: false, isWritable: true },
      { pubkey: escrowPda, isSigner: false, isWritable: true },
      { pubkey: vaultPda, isSigner: false, isWritable: true },
      { pubkey: platformFeeVaultPda, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ];

    const ix = new TransactionInstruction({
      keys,
      programId: this.programId,
      data: Buffer.concat([this.disc('refund'), this.encodeString(milestoneId)]),
    });

    const { blockhash, lastValidBlockHeight } = await this.getLatestBlockhashWithRetry();
    const tx = new Transaction();
    tx.recentBlockhash = blockhash;
    tx.feePayer = this.authority.publicKey;
    tx.add(ix);
    tx.sign(this.authority);

    const sig = await this.connection.sendRawTransaction(tx.serialize());
    await this.connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed');

    this.logger.log(`Milestone ${milestoneId} refunded → ${clientPubkey.toBase58()} | sig: ${sig}`);
    await this.milestoneRepository.update({ id: milestoneId }, { status: MilestoneStatus.REFUNDED, txSignature: sig });
    await this.updateJobActiveFromMilestones(milestone.jobId);

    return { txSignature: sig };
  }

  /**
   * Top up a funded milestone with additional SOL.
   * Updates the stored amountLamports to reflect the new total.
   */
  async topUpMilestone(
    milestoneId: string,
    clientWallet: string,
    additionalLamports: bigint,
    signingMode: 'server' | 'client',
    walletId?: string,
    userJwt?: string,
  ): Promise<{ txSignature?: string; transaction?: string }> {
    const milestone = await this.milestoneRepository.findOne({ where: { id: milestoneId } });
    if (!milestone) throw new NotFoundException(`Milestone ${milestoneId} not found`);
    if (milestone.status !== MilestoneStatus.FUNDED) {
      throw new BadRequestException(`Milestone ${milestoneId} is not Funded — top-up not allowed (status: ${milestone.status})`);
    }

    const [escrowPda] = this.deriveEscrowPda(milestoneId);
    const [vaultPda] = this.deriveVaultPda(milestoneId);

    const keys: AccountMeta[] = [
      { pubkey: new PublicKey(clientWallet), isSigner: true, isWritable: true },
      { pubkey: escrowPda, isSigner: false, isWritable: true },
      { pubkey: vaultPda, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ];

    const tx = new Transaction();
    tx.feePayer = new PublicKey(clientWallet);
    tx.add(new TransactionInstruction({
      keys,
      programId: this.programId,
      data: Buffer.concat([this.disc('top_up'), this.encodeString(milestoneId), this.encodeU64(additionalLamports)]),
    }));

    if (signingMode === 'server') {
      if (!walletId || !userJwt) throw new BadRequestException('walletId and userJwt are required for server-side signing');
      const sig = await this.signAndBroadcast(tx, walletId, userJwt);
      this.logger.log(`Milestone ${milestoneId} topped up (server) | +${additionalLamports} lamports | sig: ${sig}`);
      const newAmount = (BigInt(milestone.amountLamports) + additionalLamports).toString();
      await this.milestoneRepository.update({ id: milestoneId }, { amountLamports: newAmount, txSignature: sig });
      return { txSignature: sig };
    }

    const { blockhash } = await this.getLatestBlockhashWithRetry();
    tx.recentBlockhash = blockhash;
    return { transaction: tx.serialize({ requireAllSignatures: false }).toString('base64') };
  }

  /**
   * Confirm a client-broadcast milestone transaction and update the DB record.
   */
  async confirmMilestoneTransaction(
    milestoneId: string,
    clientId: string,
    clientWallet: string,
    options: { txSignature: string } | { signedTransaction: string },
  ): Promise<Milestone> {
    let txSignature: string;

    if ('signedTransaction' in options) {
      const txBytes = Buffer.from(options.signedTransaction, 'base64');
      const { blockhash, lastValidBlockHeight } = await this.getLatestBlockhashWithRetry();
      txSignature = await this.connection.sendRawTransaction(txBytes);
      await this.connection.confirmTransaction({ signature: txSignature, blockhash, lastValidBlockHeight }, 'confirmed');
      const relayedTx = await this.connection.getTransaction(txSignature, { commitment: 'confirmed', maxSupportedTransactionVersion: 0 });
      if (relayedTx?.meta?.err) {
        throw new BadRequestException(`Transaction failed on-chain: ${JSON.stringify(relayedTx.meta.err)}`);
      }
      this.logger.log(`Relayed client tx for milestone ${milestoneId} | sig: ${txSignature}`);
    } else {
      txSignature = options.txSignature;
      const txInfo = await this.connection.getTransaction(txSignature, { commitment: 'confirmed', maxSupportedTransactionVersion: 0 });
      if (!txInfo) throw new NotFoundException(`Transaction ${txSignature} not found on-chain`);
      if (txInfo.meta?.err) throw new BadRequestException(`Transaction ${txSignature} failed on-chain: ${JSON.stringify(txInfo.meta.err)}`);
    }

    const milestone = await this.milestoneRepository.findOne({ where: { id: milestoneId } });
    if (!milestone) throw new NotFoundException(`Milestone ${milestoneId} not found`);

    const [escrowPda] = this.deriveEscrowPda(milestoneId);
    const [vaultPda] = this.deriveVaultPda(milestoneId);

    const onChain = await this.fetchOnChainEscrow(escrowPda);
    const statusMap: Record<number, MilestoneStatus> = {
      0: MilestoneStatus.FUNDED,
      1: MilestoneStatus.LOCKED,
      2: MilestoneStatus.RELEASED,
      3: MilestoneStatus.REFUNDED,
    };
    const newStatus = onChain ? (statusMap[onChain.status] ?? MilestoneStatus.FUNDED) : MilestoneStatus.FUNDED;
    const newAmount = onChain ? onChain.amount.toString() : milestone.amountLamports;

    await this.milestoneRepository.update(
      { id: milestoneId },
      { clientId, clientWallet, escrowPda: escrowPda.toBase58(), vaultPda: vaultPda.toBase58(), amountLamports: newAmount, status: newStatus, txSignature },
    );

    if (newStatus === MilestoneStatus.FUNDED) {
      this.safePublish(MessagePattern.JOB_SET_ACTIVE, { jobId: milestone.jobId, isActive: true });
    } else if (newStatus === MilestoneStatus.REFUNDED) {
      await this.updateJobActiveFromMilestones(milestone.jobId);
    }

    const updated = await this.milestoneRepository.findOne({ where: { id: milestoneId } });
    return updated!;
  }

  /**
   * Authority locks a single funded milestone after a freelancer is hired.
   * Called internally from PROPOSAL_HIRED handler.
   */
  async lockMilestone(milestoneId: string, freelancerWallet: string, freelancerId: string): Promise<void> {
    if (!this.authority) {
      this.logger.error('Authority keypair not configured — cannot lock milestone');
      return;
    }

    const milestone = await this.milestoneRepository.findOne({ where: { id: milestoneId } });
    if (!milestone) {
      this.logger.warn(`Milestone ${milestoneId} not found — skipping lock`);
      return;
    }
    if (milestone.status !== MilestoneStatus.FUNDED) {
      this.logger.warn(`Milestone ${milestoneId} not Funded (status: ${milestone.status}) — skipping lock`);
      return;
    }

    const [escrowPda] = this.deriveEscrowPda(milestoneId);
    const [vaultPda] = this.deriveVaultPda(milestoneId);
    const [platformFeeVaultPda] = this.derivePlatformFeeVaultPda();

    const keys: AccountMeta[] = [
      { pubkey: this.authority.publicKey, isSigner: true, isWritable: true },
      { pubkey: escrowPda, isSigner: false, isWritable: true },
      { pubkey: vaultPda, isSigner: false, isWritable: true },
      { pubkey: platformFeeVaultPda, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ];

    const data = Buffer.concat([
      this.disc('lock'),
      this.encodeString(milestoneId),
      Buffer.from(new PublicKey(freelancerWallet).toBytes()),
    ]);

    const ix = new TransactionInstruction({ keys, programId: this.programId, data });
    const { blockhash, lastValidBlockHeight } = await this.getLatestBlockhashWithRetry();
    const tx = new Transaction();
    tx.recentBlockhash = blockhash;
    tx.feePayer = this.authority.publicKey;
    tx.add(ix);
    tx.sign(this.authority);

    const sig = await this.connection.sendRawTransaction(tx.serialize());
    await this.connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed');

    this.logger.log(`Milestone ${milestoneId} locked | freelancer: ${freelancerWallet} | sig: ${sig}`);
    await this.milestoneRepository.update(
      { id: milestoneId },
      { status: MilestoneStatus.LOCKED, freelancerId, freelancerWallet, txSignature: sig },
    );
  }

  // ─── Platform fee operations ──────────────────────────────────────────

  /** Authority withdraws accumulated platform fees from the global fee vault. */
  async withdrawPlatformFees(amount: bigint): Promise<{ txSignature: string }> {
    if (!this.authority) throw new BadRequestException('Authority keypair not configured');

    const [platformFeeVaultPda] = this.derivePlatformFeeVaultPda();

    const keys: AccountMeta[] = [
      { pubkey: this.authority.publicKey, isSigner: true, isWritable: true },
      { pubkey: platformFeeVaultPda, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ];

    const ix = new TransactionInstruction({
      keys,
      programId: this.programId,
      data: Buffer.concat([this.disc('withdraw_fees'), this.encodeU64(amount)]),
    });

    const { blockhash, lastValidBlockHeight } = await this.getLatestBlockhashWithRetry();
    const tx = new Transaction();
    tx.recentBlockhash = blockhash;
    tx.feePayer = this.authority.publicKey;
    tx.add(ix);
    tx.sign(this.authority);

    const sig = await this.connection.sendRawTransaction(tx.serialize());
    await this.connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed');

    this.logger.log(`Withdrew ${amount} lamports from platform fee vault | sig: ${sig}`);
    return { txSignature: sig };
  }

  /** Mark an existing on-chain contract as completed with completion cert URI + hash. */
  async completeOnChainContract(
    jobId: string,
    completionUri: string,
    completionPdfHash: string, // hex-encoded SHA-256
  ): Promise<{ txSignature: string }> {
    if (!this.authority) throw new BadRequestException('Authority keypair not configured');

    const [contractPda] = this.deriveContractPda(jobId);
    const completionHashBytes = Buffer.from(completionPdfHash, 'hex');

    const keys: AccountMeta[] = [
      { pubkey: this.authority.publicKey, isSigner: true, isWritable: true },
      { pubkey: contractPda, isSigner: false, isWritable: true },
    ];

    const data = Buffer.concat([
      this.disc('complete_contract'),
      this.encodeString(jobId),
      this.encodeString(completionUri),
      completionHashBytes,
    ]);

    const ix = new TransactionInstruction({ keys, programId: this.programId, data });
    const { blockhash, lastValidBlockHeight } = await this.getLatestBlockhashWithRetry();
    const tx = new Transaction();
    tx.recentBlockhash = blockhash;
    tx.feePayer = this.authority.publicKey;
    tx.add(ix);
    tx.sign(this.authority);

    const sig = await this.connection.sendRawTransaction(tx.serialize());
    await this.connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed');

    this.logger.log(`On-chain contract completed for job ${jobId} | sig: ${sig}`);
    return { txSignature: sig };
  }

  /** Create an on-chain contract PDA storing metadata URI + PDF hash. */
  async createOnChainContract(
    jobId: string,
    clientWallet: string,
    freelancerWallet: string,
    metadataUri: string,
    pdfHash: string, // hex-encoded SHA-256
  ): Promise<{ txSignature: string; contractPda: string }> {
    if (!this.authority) throw new BadRequestException('Authority keypair not configured');

    const [contractPda] = this.deriveContractPda(jobId);
    const pdfHashBytes = Buffer.from(pdfHash, 'hex');

    const keys: AccountMeta[] = [
      { pubkey: this.authority.publicKey, isSigner: true, isWritable: true },
      { pubkey: contractPda, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ];

    const encodePubkey = (addr: string) => Buffer.from(new PublicKey(addr).toBytes());

    const data = Buffer.concat([
      this.disc('create_contract'),
      this.encodeString(jobId),
      encodePubkey(clientWallet),
      encodePubkey(freelancerWallet),
      this.encodeString(metadataUri),
      pdfHashBytes,
    ]);

    const ix = new TransactionInstruction({ keys, programId: this.programId, data });
    const { blockhash, lastValidBlockHeight } = await this.getLatestBlockhashWithRetry();
    const tx = new Transaction();
    tx.recentBlockhash = blockhash;
    tx.feePayer = this.authority.publicKey;
    tx.add(ix);
    tx.sign(this.authority);

    const sig = await this.connection.sendRawTransaction(tx.serialize());
    await this.connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed');

    this.logger.log(`On-chain contract created for job ${jobId} | PDA: ${contractPda.toBase58()} | sig: ${sig}`);
    return { txSignature: sig, contractPda: contractPda.toBase58() };
  }

  /** Read the SOL balance of the platform fee vault PDA. */
  async getPlatformFeeBalance(): Promise<{ balance: string; address: string }> {
    const [platformFeeVaultPda] = this.derivePlatformFeeVaultPda();
    const balance = await this.connection.getBalance(platformFeeVaultPda);
    return { balance: balance.toString(), address: platformFeeVaultPda.toBase58() };
  }

  /**
   * Get escrow state — returns DB record if present, else queries on-chain.
   */
  async getEscrow(jobId: string): Promise<Escrow | null> {
    const dbRecord = await this.escrowRepository.findOne({ where: { jobId } });
    if (dbRecord) return dbRecord;

    // Fallback to on-chain
    const [escrowPda] = this.deriveEscrowPda(jobId);
    const onChain = await this.fetchOnChainEscrow(escrowPda);
    if (!onChain) return null;

    // Synthesize a read-only record (not persisted)
    const statusMap: Record<number, EscrowStatus> = {
      0: EscrowStatus.FUNDED,
      1: EscrowStatus.LOCKED,
      2: EscrowStatus.RELEASED,
      3: EscrowStatus.REFUNDED,
    };

    const ephemeral = this.escrowRepository.create({
      jobId,
      clientId: onChain.client.toBase58(),
      clientWallet: onChain.client.toBase58(),
      freelancerWallet: onChain.freelancer.equals(PublicKey.default)
        ? null
        : onChain.freelancer.toBase58(),
      escrowPda: escrowPda.toBase58(),
      vaultPda: this.deriveVaultPda(jobId)[0].toBase58(),
      amountLamports: onChain.amount.toString(),
      status: statusMap[onChain.status] ?? EscrowStatus.FUNDED,
    });
    return ephemeral;
  }
}
