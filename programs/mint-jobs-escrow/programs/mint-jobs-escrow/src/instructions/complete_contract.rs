use anchor_lang::prelude::*;

use crate::errors::EscrowError;
use crate::state::{job_id_hash, ContractState, JobContract, CONTRACT_SEED, MAX_COMPLETION_URI_LEN};

/// Authority marks a contract as completed on-chain.
/// Stores the completion certificate URI and PDF hash.
#[derive(Accounts)]
#[instruction(job_id: String)]
pub struct CompleteContract<'info> {
    /// The platform authority — must match the stored authority pubkey
    #[account(mut)]
    pub authority: Signer<'info>,

    /// The existing JobContract PDA
    #[account(
        mut,
        seeds = [CONTRACT_SEED, &job_id_hash(&job_id) as &[u8]],
        bump = contract.bump,
        constraint = contract.authority == authority.key() @ EscrowError::Unauthorized,
    )]
    pub contract: Account<'info, JobContract>,
}

pub fn handler(
    ctx: Context<CompleteContract>,
    job_id: String,
    completion_uri: String,
    completion_pdf_hash: [u8; 32],
) -> Result<()> {
    require!(job_id.len() == 36, EscrowError::InvalidJobId);
    require!(completion_uri.len() <= MAX_COMPLETION_URI_LEN, EscrowError::MetadataUriTooLong);

    let contract = &mut ctx.accounts.contract;

    require!(
        contract.state == ContractState::Active,
        EscrowError::AlreadyFinalised
    );

    contract.state = ContractState::Completed;
    contract.completion_uri = completion_uri;
    contract.completion_pdf_hash = completion_pdf_hash;
    contract.completed_at = Clock::get()?.unix_timestamp;

    msg!(
        "Contract completed for job {} | client: {} | freelancer: {}",
        job_id,
        contract.client,
        contract.freelancer
    );
    Ok(())
}
