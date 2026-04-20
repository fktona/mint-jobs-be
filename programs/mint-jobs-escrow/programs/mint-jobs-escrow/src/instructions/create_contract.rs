use anchor_lang::prelude::*;

use crate::errors::EscrowError;
use crate::state::{job_id_hash, ContractState, JobContract, CONTRACT_SEED, MAX_URI_LEN};

/// Authority creates an on-chain contract record after both parties have signed.
/// This is a permanent, publicly verifiable proof of the agreement.
#[derive(Accounts)]
#[instruction(job_id: String)]
pub struct CreateContract<'info> {
    /// The platform authority — pays rent for the new account
    #[account(mut)]
    pub authority: Signer<'info>,

    /// The JobContract PDA — stores metadata URI + PDF hash
    #[account(
        init,
        payer = authority,
        space = JobContract::LEN,
        seeds = [CONTRACT_SEED, &job_id_hash(&job_id) as &[u8]],
        bump,
    )]
    pub contract: Account<'info, JobContract>,

    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<CreateContract>,
    job_id: String,
    client: Pubkey,
    freelancer: Pubkey,
    metadata_uri: String,
    pdf_hash: [u8; 32],
) -> Result<()> {
    require!(job_id.len() == 36, EscrowError::InvalidJobId);
    require!(metadata_uri.len() <= MAX_URI_LEN, EscrowError::MetadataUriTooLong);

    let contract = &mut ctx.accounts.contract;
    contract.client = client;
    contract.freelancer = freelancer;
    contract.authority = ctx.accounts.authority.key();
    contract.job_id = job_id_hash(&job_id);
    contract.metadata_uri = metadata_uri;
    contract.pdf_hash = pdf_hash;
    contract.created_at = Clock::get()?.unix_timestamp;
    contract.state = ContractState::Active;
    contract.completion_uri = String::new();
    contract.completion_pdf_hash = [0u8; 32];
    contract.completed_at = 0;
    contract.bump = ctx.bumps.contract;

    msg!(
        "On-chain contract created for job {} | client: {} | freelancer: {}",
        job_id, client, freelancer
    );
    Ok(())
}
