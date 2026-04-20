use anchor_lang::prelude::*;

pub mod errors;
pub mod instructions;
pub mod state;

// Re-export everything so the #[program] macro can find the generated
// __client_accounts_* types at the crate root.
pub use instructions::*;

// Replace with actual program ID after `anchor build`
declare_id!("DSpvnGTUxHo47tLgGJygq9F1ZX1TvGVrv7Ku2jAfBew8");

#[program]
pub mod mint_jobs_escrow {
    use super::*;

    /// Client funds the escrow for a job.
    /// Status transitions: (new) → Funded
    pub fn initialize_escrow(
        ctx: Context<InitializeEscrow>,
        job_id: String,
        amount: u64,
    ) -> Result<()> {
        instructions::initialize::handler(ctx, job_id, amount)
    }

    /// Client withdraws funds before a freelancer is hired.
    /// Status transitions: Funded → Refunded
    pub fn withdraw(ctx: Context<Withdraw>, job_id: String) -> Result<()> {
        instructions::withdraw::handler(ctx, job_id)
    }

    /// Authority locks the escrow after a freelancer is hired.
    /// Status transitions: Funded → Locked
    pub fn lock(ctx: Context<Lock>, job_id: String, freelancer: Pubkey) -> Result<()> {
        instructions::lock::handler(ctx, job_id, freelancer)
    }

    /// Client or authority releases funds to the freelancer.
    /// Status transitions: Locked → Released
    pub fn release(ctx: Context<Release>, job_id: String) -> Result<()> {
        instructions::release::handler(ctx, job_id)
    }

    /// Client tops up an existing Funded escrow with additional SOL.
    /// Status remains Funded; amount increases.
    pub fn top_up(ctx: Context<TopUp>, job_id: String, additional_amount: u64) -> Result<()> {
        instructions::top_up::handler(ctx, job_id, additional_amount)
    }

    /// Authority force-refunds to the client (dispute resolution).
    /// Status transitions: Funded | Locked → Refunded
    pub fn refund(ctx: Context<Refund>, job_id: String) -> Result<()> {
        instructions::refund::handler(ctx, job_id)
    }

    /// Authority withdraws accumulated platform fees from the global fee vault.
    pub fn withdraw_fees(ctx: Context<WithdrawFees>, amount: u64) -> Result<()> {
        instructions::withdraw_fees::handler(ctx, amount)
    }

    /// Authority marks a contract as completed on-chain with completion cert URI + hash.
    pub fn complete_contract(
        ctx: Context<CompleteContract>,
        job_id: String,
        completion_uri: String,
        completion_pdf_hash: [u8; 32],
    ) -> Result<()> {
        instructions::complete_contract::handler(ctx, job_id, completion_uri, completion_pdf_hash)
    }

    /// Authority creates an on-chain contract record (metadata URI + PDF hash).
    pub fn create_contract(
        ctx: Context<CreateContract>,
        job_id: String,
        client: Pubkey,
        freelancer: Pubkey,
        metadata_uri: String,
        pdf_hash: [u8; 32],
    ) -> Result<()> {
        instructions::create_contract::handler(ctx, job_id, client, freelancer, metadata_uri, pdf_hash)
    }
}
