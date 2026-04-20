use anchor_lang::prelude::*;
use anchor_lang::system_program;

use crate::errors::EscrowError;
use crate::state::{job_id_hash, EscrowStatus, JobEscrow};

/// Client withdraws their funds before a freelancer is hired.
/// Only allowed when status == Funded.
/// Full refund: client gets back principal + the 2.5% fee. No fee charged.
#[derive(Accounts)]
#[instruction(job_id: String)]
pub struct Withdraw<'info> {
    /// The client who originally funded the escrow
    #[account(mut)]
    pub client: Signer<'info>,

    /// The JobEscrow state PDA — must be owned by the signing client
    #[account(
        mut,
        seeds = [b"escrow" as &[u8], &job_id_hash(&job_id) as &[u8]],
        bump = escrow.bump,
        constraint = escrow.client == client.key() @ EscrowError::Unauthorized,
    )]
    pub escrow: Account<'info, JobEscrow>,

    /// The vault PDA holding the lamports
    /// CHECK: PDA vault controlled by this program
    #[account(
        mut,
        seeds = [b"vault" as &[u8], &job_id_hash(&job_id) as &[u8]],
        bump = escrow.vault_bump,
    )]
    pub vault: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<Withdraw>, job_id: String) -> Result<()> {
    let escrow = &mut ctx.accounts.escrow;

    require!(
        escrow.status == EscrowStatus::Funded,
        EscrowError::NotFunded
    );

    // Full refund: principal + accumulated fee
    let total_refund = escrow
        .amount
        .checked_add(escrow.platform_fee)
        .ok_or(EscrowError::Overflow)?;

    // Mark as refunded before transfer (checks-effects-interactions)
    escrow.status = EscrowStatus::Refunded;
    escrow.amount = 0;
    escrow.platform_fee = 0;

    // Transfer full amount from vault PDA back to client using invoke_signed
    let hashed = job_id_hash(&job_id);
    let vault_bump = escrow.vault_bump;
    let bump_slice = &[vault_bump];
    let seeds: &[&[u8]] = &[b"vault", &hashed, bump_slice];
    let signer_seeds = &[seeds];

    system_program::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.system_program.to_account_info(),
            system_program::Transfer {
                from: ctx.accounts.vault.to_account_info(),
                to: ctx.accounts.client.to_account_info(),
            },
            signer_seeds,
        ),
        total_refund,
    )?;

    msg!(
        "Client withdrew {} lamports (principal + fee) from escrow for job {}",
        total_refund, job_id
    );
    Ok(())
}
