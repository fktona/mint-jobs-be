import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

import * as anchor from '@coral-xyz/anchor';
import { Program } from '@coral-xyz/anchor';
import { MintJobsEscrow } from '../target/types/mint_jobs_escrow';
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
} from '@solana/web3.js';
import { assert } from 'chai';
import * as fs from 'fs';
import * as os from 'os';
import { createHash } from 'crypto';

describe('mint-jobs-escrow', () => {
  const rpcUrl =
    process.env.SOLANA_RPC_URL ?? process.env.SOLANA_RPC_URL;
  const walletPath =
    process.env.ANCHOR_WALLET ?? path.join(os.homedir(), '.config/solana/id.json');
  const walletKeypair = Keypair.fromSecretKey(
    Buffer.from(JSON.parse(fs.readFileSync(walletPath, 'utf-8'))),
  );
  const connection = new Connection(rpcUrl, 'confirmed');
  const provider = new anchor.AnchorProvider(
    connection,
    new anchor.Wallet(walletKeypair),
    { commitment: 'confirmed' },
  );
  anchor.setProvider(provider);

  const program = anchor.workspace.MintJobsEscrow as Program<MintJobsEscrow>;

  let client: Keypair;
  let authority: Keypair;
  let freelancer: Keypair;

  // Use a fixed UUID-format job ID for tests
  const jobId = '550e8400-e29b-41d4-a716-446655440000';
  const jobId2 = '550e8400-e29b-41d4-a716-446655440001';
  const jobId3 = '550e8400-e29b-41d4-a716-446655440002';

  const fundAmount = 1 * LAMPORTS_PER_SOL; // 1 SOL

  function jobIdSeed(jobId: string): Buffer {
    return createHash('sha256').update(jobId).digest();
  }

  function deriveEscrowPda(jobId: string): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('escrow'), jobIdSeed(jobId)],
      program.programId,
    );
  }

  function deriveVaultPda(jobId: string): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('vault'), jobIdSeed(jobId)],
      program.programId,
    );
  }

  before(async () => {
    client = Keypair.generate();
    authority = Keypair.generate();
    freelancer = Keypair.generate();

    // Airdrop SOL to client and authority
    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(
        client.publicKey,
        5 * LAMPORTS_PER_SOL,
      ),
    );
    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(
        authority.publicKey,
        2 * LAMPORTS_PER_SOL,
      ),
    );
  });

  // ─── Test 1: Fund → Withdraw (pre-hire) ─────────────────────────────────
  it('client can fund and then withdraw before hire', async () => {
    const [escrowPda] = deriveEscrowPda(jobId);
    const [vaultPda] = deriveVaultPda(jobId);

    const clientBalanceBefore = await provider.connection.getBalance(
      client.publicKey,
    );

    await program.methods
      .initializeEscrow(jobId, new anchor.BN(fundAmount))
      .accounts({
        client: client.publicKey,
        authority: authority.publicKey,
        escrow: escrowPda,
        vault: vaultPda,
        systemProgram: SystemProgram.programId,
      })
      .signers([client])
      .rpc();

    let escrowAccount = await program.account.jobEscrow.fetch(escrowPda);
    assert.equal(escrowAccount.amount.toNumber(), fundAmount);
    assert.deepEqual(escrowAccount.status, { funded: {} });

    // Withdraw
    await program.methods
      .withdraw(jobId)
      .accounts({
        client: client.publicKey,
        escrow: escrowPda,
        vault: vaultPda,
        systemProgram: SystemProgram.programId,
      })
      .signers([client])
      .rpc();

    escrowAccount = await program.account.jobEscrow.fetch(escrowPda);
    assert.equal(escrowAccount.amount.toNumber(), 0);
    assert.deepEqual(escrowAccount.status, { refunded: {} });

    const clientBalanceAfter = await provider.connection.getBalance(
      client.publicKey,
    );
    // Client got funds back (minus tx fees)
    assert.isAbove(clientBalanceAfter, clientBalanceBefore - 0.01 * LAMPORTS_PER_SOL);
  });

  // ─── Test 2: Fund → Lock → Release ──────────────────────────────────────
  it('full lifecycle: fund → lock → release to freelancer', async () => {
    const [escrowPda] = deriveEscrowPda(jobId2);
    const [vaultPda] = deriveVaultPda(jobId2);

    // Fund
    await program.methods
      .initializeEscrow(jobId2, new anchor.BN(fundAmount))
      .accounts({
        client: client.publicKey,
        authority: authority.publicKey,
        escrow: escrowPda,
        vault: vaultPda,
        systemProgram: SystemProgram.programId,
      })
      .signers([client])
      .rpc();

    // Lock (authority action, on hire)
    await program.methods
      .lock(jobId2, freelancer.publicKey)
      .accounts({
        authority: authority.publicKey,
        escrow: escrowPda,
      })
      .signers([authority])
      .rpc();

    let escrowAccount = await program.account.jobEscrow.fetch(escrowPda);
    assert.deepEqual(escrowAccount.status, { locked: {} });
    assert.equal(escrowAccount.freelancer.toBase58(), freelancer.publicKey.toBase58());

    // Client cannot withdraw after lock
    try {
      await program.methods
        .withdraw(jobId2)
        .accounts({
          client: client.publicKey,
          escrow: escrowPda,
          vault: vaultPda,
          systemProgram: SystemProgram.programId,
        })
        .signers([client])
        .rpc();
      assert.fail('Should have thrown');
    } catch (err) {
      assert.include(err.message, 'NotFunded');
    }

    const freelancerBalanceBefore = await provider.connection.getBalance(
      freelancer.publicKey,
    );

    // Release (client releases to freelancer)
    await program.methods
      .release(jobId2)
      .accounts({
        caller: client.publicKey,
        escrow: escrowPda,
        freelancer: freelancer.publicKey,
        vault: vaultPda,
        systemProgram: SystemProgram.programId,
      })
      .signers([client])
      .rpc();

    escrowAccount = await program.account.jobEscrow.fetch(escrowPda);
    assert.deepEqual(escrowAccount.status, { released: {} });
    assert.equal(escrowAccount.amount.toNumber(), 0);

    const freelancerBalanceAfter = await provider.connection.getBalance(
      freelancer.publicKey,
    );
    assert.equal(freelancerBalanceAfter - freelancerBalanceBefore, fundAmount);
  });

  // ─── Test 3: Fund → Lock → Authority Refund (dispute) ───────────────────
  it('authority can force-refund after lock (dispute resolution)', async () => {
    const [escrowPda] = deriveEscrowPda(jobId3);
    const [vaultPda] = deriveVaultPda(jobId3);

    // Fund
    await program.methods
      .initializeEscrow(jobId3, new anchor.BN(fundAmount))
      .accounts({
        client: client.publicKey,
        authority: authority.publicKey,
        escrow: escrowPda,
        vault: vaultPda,
        systemProgram: SystemProgram.programId,
      })
      .signers([client])
      .rpc();

    // Lock
    await program.methods
      .lock(jobId3, freelancer.publicKey)
      .accounts({
        authority: authority.publicKey,
        escrow: escrowPda,
      })
      .signers([authority])
      .rpc();

    const clientBalanceBefore = await provider.connection.getBalance(
      client.publicKey,
    );

    // Authority force-refunds to client
    await program.methods
      .refund(jobId3)
      .accounts({
        authority: authority.publicKey,
        client: client.publicKey,
        escrow: escrowPda,
        vault: vaultPda,
        systemProgram: SystemProgram.programId,
      })
      .signers([authority])
      .rpc();

    const escrowAccount = await program.account.jobEscrow.fetch(escrowPda);
    assert.deepEqual(escrowAccount.status, { refunded: {} });
    assert.equal(escrowAccount.amount.toNumber(), 0);

    const clientBalanceAfter = await provider.connection.getBalance(
      client.publicKey,
    );
    assert.equal(clientBalanceAfter - clientBalanceBefore, fundAmount);
  });
});
