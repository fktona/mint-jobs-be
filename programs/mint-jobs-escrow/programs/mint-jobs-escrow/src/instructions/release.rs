use anchor_lang::prelude::*;
use anchor_lang::system_program;

use crate::errors::EscrowError;
use crate::state::{job_id_hash, EscrowStatus, JobEscrow, FEE_BPS, BPS_DENOMINATOR, PLATFORM_FEE_SEED};

/// Releases funds to the freelancer after job completion.
/// Takes a 2.5% release fee → platform_fee_vault, rest → freelancer.
/// Can be called by the client OR the platform authority.
#[derive(Accounts)]
#[instruction(job_id: String)]
pub struct Release<'info> {
    /// Must be either the client or the authority
    #[account(mut)]
    pub caller: Signer<'info>,

    /// The JobEscrow state PDA
    #[account(
        mut,
        seeds = [b"escrow" as &[u8], &job_id_hash(&job_id) as &[u8]],
        bump = escrow.bump,
    )]
    pub escrow: Account<'info, JobEscrow>,

    /// The freelancer wallet — receives the funds
    /// CHECK: address is verified against the stored escrow.freelancer value
    #[account(mut)]
    pub freelancer: UncheckedAccount<'info>,

    /// The vault PDA holding the lamports
    /// CHECK: PDA vault controlled by this program
    #[account(
        mut,
        seeds = [b"vault" as &[u8], &job_id_hash(&job_id) as &[u8]],
        bump = escrow.vault_bump,
    )]
    pub vault: UncheckedAccount<'info>,

    /// The global platform fee vault PDA
    /// CHECK: PDA controlled by this program; accumulates platform fees
    #[account(
        mut,
        seeds = [PLATFORM_FEE_SEED],
        bump = escrow.platform_fee_vault_bump,
    )]
    pub platform_fee_vault: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<Release>, job_id: String) -> Result<()> {
    let escrow = &mut ctx.accounts.escrow;

    // Only client or authority can release
    let caller = ctx.accounts.caller.key();
    require!(
        caller == escrow.client || caller == escrow.authority,
        EscrowError::Unauthorized
    );

    require!(
        escrow.status == EscrowStatus::Locked,
        EscrowError::NotLocked
    );

    // Verify the freelancer account matches the stored pubkey
    require!(
        ctx.accounts.freelancer.key() == escrow.freelancer,
        EscrowError::Unauthorized
    );

    let amount = escrow.amount;

    // Compute 2.5% release fee
    let release_fee = amount
        .checked_mul(FEE_BPS)
        .ok_or(EscrowError::Overflow)?
        .checked_div(BPS_DENOMINATOR)
        .ok_or(EscrowError::Overflow)?;

    let freelancer_payout = amount
        .checked_sub(release_fee)
        .ok_or(EscrowError::Overflow)?;

    // Mark as released before transfers
    escrow.status = EscrowStatus::Released;
    escrow.amount = 0;

    let hashed = job_id_hash(&job_id);
    let vault_bump = escrow.vault_bump;
    let bump_slice = &[vault_bump];
    let seeds: &[&[u8]] = &[b"vault", &hashed, bump_slice];
    let signer_seeds = &[seeds];

    // Transfer release fee from vault → platform_fee_vault
    if release_fee > 0 {
        system_program::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: ctx.accounts.vault.to_account_info(),
                    to: ctx.accounts.platform_fee_vault.to_account_info(),
                },
                signer_seeds,
            ),
            release_fee,
        )?;
    }

    // Transfer remaining from vault → freelancer
    system_program::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.system_program.to_account_info(),
            system_program::Transfer {
                from: ctx.accounts.vault.to_account_info(),
                to: ctx.accounts.freelancer.to_account_info(),
            },
            signer_seeds,
        ),
        freelancer_payout,
    )?;

    msg!(
        "Released for job {} — {} to freelancer {}, {} fee to platform vault",
        job_id, freelancer_payout, escrow.freelancer, release_fee
    );
    Ok(())
}
