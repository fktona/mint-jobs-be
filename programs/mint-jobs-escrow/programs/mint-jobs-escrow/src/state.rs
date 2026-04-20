use anchor_lang::prelude::*;
use anchor_lang::solana_program::hash::hash;

/// Platform fee: 2.5% collected at hire (lock) and 2.5% at release = 5% total.
pub const FEE_BPS: u64 = 250; // 2.5% expressed in basis points
pub const BPS_DENOMINATOR: u64 = 10_000;
pub const PLATFORM_FEE_SEED: &[u8] = b"platform_fee";
pub const CONTRACT_SEED: &[u8] = b"contract";
pub const MAX_URI_LEN: usize = 200;
pub const MAX_COMPLETION_URI_LEN: usize = 200;

/// SHA-256 the job UUID so it fits the 32-byte PDA seed limit.
pub fn job_id_hash(job_id: &str) -> [u8; 32] {
    hash(job_id.as_bytes()).to_bytes()
}

#[account]
pub struct JobEscrow {
    /// The client (job poster) wallet — funded the escrow
    pub client: Pubkey,
    /// The freelancer wallet — zero until locked (hire)
    pub freelancer: Pubkey,
    /// The platform authority wallet
    pub authority: Pubkey,
    /// SHA-256 hash of the UUID string (fits the 32-byte PDA seed limit)
    pub job_id: [u8; 32],
    /// Principal lamports (what the freelancer will receive, minus release fee)
    pub amount: u64,
    /// 2.5% client fee sitting in vault, moved to platform_fee_vault on lock
    pub platform_fee: u64,
    /// Current lifecycle status
    pub status: EscrowStatus,
    /// Bump seed for the JobEscrow PDA
    pub bump: u8,
    /// Bump seed for the vault PDA
    pub vault_bump: u8,
    /// Bump seed for the global platform fee vault PDA
    pub platform_fee_vault_bump: u8,
}

impl JobEscrow {
    /// 8 discriminator + 32 client + 32 freelancer + 32 authority
    /// + 32 job_id + 8 amount + 8 platform_fee + 1 status + 1 bump + 1 vault_bump + 1 platform_fee_vault_bump
    pub const LEN: usize = 8 + 32 + 32 + 32 + 32 + 8 + 8 + 1 + 1 + 1 + 1;
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum ContractState {
    /// Contract is active — work in progress
    Active,
    /// Job completed — funds released, completion cert on-chain
    Completed,
    /// Contract terminated by either party or authority
    Terminated,
}

#[account]
pub struct JobContract {
    /// The client (job poster) wallet
    pub client: Pubkey,
    /// The freelancer wallet
    pub freelancer: Pubkey,
    /// The platform authority wallet
    pub authority: Pubkey,
    /// SHA-256 hash of the job UUID
    pub job_id: [u8; 32],
    /// IPFS metadata JSON URI for the hire contract
    pub metadata_uri: String,
    /// SHA-256 hash of the hire contract PDF bytes
    pub pdf_hash: [u8; 32],
    /// Unix timestamp when the contract was created on-chain
    pub created_at: i64,
    /// Current contract state
    pub state: ContractState,
    /// IPFS metadata JSON URI for the completion certificate (empty until completed)
    pub completion_uri: String,
    /// SHA-256 hash of the completion certificate PDF (zeroed until completed)
    pub completion_pdf_hash: [u8; 32],
    /// Unix timestamp when the job was completed (0 until completed)
    pub completed_at: i64,
    /// Bump seed for this PDA
    pub bump: u8,
}

impl JobContract {
    /// 8 disc + 32 client + 32 freelancer + 32 authority + 32 job_id
    /// + (4 + 200) metadata_uri + 32 pdf_hash + 8 created_at
    /// + 1 state + (4 + 200) completion_uri + 32 completion_pdf_hash + 8 completed_at
    /// + 1 bump
    pub const LEN: usize = 8
        + 32 + 32 + 32 + 32
        + (4 + MAX_URI_LEN)
        + 32 + 8
        + 1
        + (4 + MAX_COMPLETION_URI_LEN)
        + 32 + 8
        + 1;
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum EscrowStatus {
    /// Funded by client; client can still withdraw
    Funded,
    /// Locked after hire; funds cannot be withdrawn by client
    Locked,
    /// Released to the freelancer
    Released,
    /// Refunded back to the client
    Refunded,
}
