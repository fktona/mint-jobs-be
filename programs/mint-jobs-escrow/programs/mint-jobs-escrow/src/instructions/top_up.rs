use anchor_lang::prelude::*;
use anchor_lang::system_program;

use crate::errors::EscrowError;
use crate::state::{job_id_hash, EscrowStatus, JobEscrow, FEE_BPS, BPS_DENOMINATOR, PLATFORM_FEE_SEED};

/// Client adds more SOL to a Funded or Locked escrow.
///
/// Fee handling (symmetric with initialize):
///   - Funded (pre-hire): fee deferred into `escrow.platform_fee` — refunded if client withdraws
///   - Locked (in-progress): fee transferred immediately to `platform_fee_vault` — non-refundable
#[derive(Accounts)]
#[instruction(job_id: String)]
pub struct TopUp<'info> {
    /// The client who originally funded the escrow
    #[account(mut)]
    pub client: Signer<'info>,

    /// The JobEscrow state PDA — must belong to the signing client
    #[account(
        mut,
        seeds = [b"escrow" as &[u8], &job_id_hash(&job_id) as &[u8]],
        bump = escrow.bump,
        constraint = escrow.client == client.key() @ EscrowError::Unauthorized,
    )]
    pub escrow: Account<'info, JobEscrow>,

    /// The vault PDA holding the principal lamports
    /// CHECK: PDA vault controlled by this program
    #[account(
        mut,
        seeds = [b"vault" as &[u8], &job_id_hash(&job_id) as &[u8]],
        bump = escrow.vault_bump,
    )]
    pub vault: UncheckedAccount<'info>,

    /// Global platform fee vault — receives fee immediately when escrow is Locked
    /// CHECK: PDA controlled by this program
    #[account(
        mut,
        seeds = [PLATFORM_FEE_SEED],
        bump = escrow.platform_fee_vault_bump,
    )]
    pub platform_fee_vault: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<TopUp>, job_id: String, additional_amount: u64) -> Result<()> {
    require!(additional_amount > 0, EscrowError::InvalidAmount);

    let escrow = &mut ctx.accounts.escrow;

    require!(
        escrow.status == EscrowStatus::Funded || escrow.status == EscrowStatus::Locked,
        EscrowError::NotFunded
    );

    // Compute 2.5% fee on the additional amount
    let fee = additional_amount
        .checked_mul(FEE_BPS)
        .ok_or(EscrowError::Overflow)?
        .checked_div(BPS_DENOMINATOR)
        .ok_or(EscrowError::Overflow)?;
    require!(fee > 0, EscrowError::FeeTooSmall);

    let total = additional_amount
        .checked_add(fee)
        .ok_or(EscrowError::Overflow)?;

    if escrow.status == EscrowStatus::Funded {
        // ── Pre-hire top-up ──────────────────────────────────────────────────
        // Transfer amount + fee from client → vault (fee deferred alongside principal)
        // Fee will be swept to platform_fee_vault when client hires (lock instruction)
        system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: ctx.accounts.client.to_account_info(),
                    to: ctx.accounts.vault.to_account_info(),
                },
            ),
            total,
        )?;

        escrow.amount = escrow
            .amount
            .checked_add(additional_amount)
            .ok_or(EscrowError::Overflow)?;

        escrow.platform_fee = escrow
            .platform_fee
            .checked_add(fee)
            .ok_or(EscrowError::Overflow)?;

        msg!(
            "Top-up (pre-hire) job {} — +{} principal, +{} fee deferred (principal: {}, deferred fee: {})",
            job_id,
            additional_amount,
            fee,
            escrow.amount,
            escrow.platform_fee
        );
    } else {
        // ── Post-lock top-up ─────────────────────────────────────────────────
        // Job is in progress — fee is non-refundable, paid immediately to vault
        // Transfer principal → vault
        system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: ctx.accounts.client.to_account_info(),
                    to: ctx.accounts.vault.to_account_info(),
                },
            ),
            additional_amount,
        )?;

        // Transfer fee → platform_fee_vault immediately
        system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: ctx.accounts.client.to_account_info(),
                    to: ctx.accounts.platform_fee_vault.to_account_info(),
                },
            ),
            fee,
        )?;

        escrow.amount = escrow
            .amount
            .checked_add(additional_amount)
            .ok_or(EscrowError::Overflow)?;

        msg!(
            "Top-up (post-lock) job {} — +{} principal, +{} fee immediate (principal: {})",
            job_id,
            additional_amount,
            fee,
            escrow.amount
        );
    }

    Ok(())
}
