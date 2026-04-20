use anchor_lang::prelude::*;
use anchor_lang::system_program;

use crate::errors::EscrowError;
use crate::state::{job_id_hash, EscrowStatus, JobEscrow, PLATFORM_FEE_SEED};

/// Authority force-refunds the escrow back to the client.
/// - Funded: full refund (principal + fee). Platform takes nothing.
/// - Locked: refund principal only. The 2.5% hire fee was already collected.
#[derive(Accounts)]
#[instruction(job_id: String)]
pub struct Refund<'info> {
    /// The platform authority — only authority can force-refund
    #[account(mut)]
    pub authority: Signer<'info>,

    /// The client wallet — receives the refunded lamports
    /// CHECK: address verified against escrow.client
    #[account(mut)]
    pub client: UncheckedAccount<'info>,

    /// The JobEscrow state PDA
    #[account(
        mut,
        seeds = [b"escrow" as &[u8], &job_id_hash(&job_id) as &[u8]],
        bump = escrow.bump,
        constraint = escrow.authority == authority.key() @ EscrowError::Unauthorized,
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

    /// The global platform fee vault PDA (unused for funded refunds, needed for account consistency)
    /// CHECK: PDA controlled by this program
    #[account(
        mut,
        seeds = [PLATFORM_FEE_SEED],
        bump = escrow.platform_fee_vault_bump,
    )]
    pub platform_fee_vault: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<Refund>, job_id: String) -> Result<()> {
    let escrow = &mut ctx.accounts.escrow;

    // Allow refund from Funded (pre-hire) or Locked (dispute)
    require!(
        escrow.status == EscrowStatus::Funded || escrow.status == EscrowStatus::Locked,
        EscrowError::AlreadyFinalised
    );

    // Verify the client account matches the stored pubkey
    require!(
        ctx.accounts.client.key() == escrow.client,
        EscrowError::Unauthorized
    );

    // Determine refund amount based on current status
    let refund_amount = if escrow.status == EscrowStatus::Funded {
        // Pre-hire: full refund (principal + fee). Platform takes nothing.
        escrow
            .amount
            .checked_add(escrow.platform_fee)
            .ok_or(EscrowError::Overflow)?
    } else {
        // Locked: hire fee already collected. Refund principal only.
        escrow.amount
    };

    // Mark as refunded before transfer
    escrow.status = EscrowStatus::Refunded;
    escrow.amount = 0;
    escrow.platform_fee = 0;

    // Transfer from vault PDA back to client
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
        refund_amount,
    )?;

    msg!(
        "Refunded {} lamports to client {} for job {}",
        refund_amount,
        escrow.client,
        job_id
    );
    Ok(())
}
