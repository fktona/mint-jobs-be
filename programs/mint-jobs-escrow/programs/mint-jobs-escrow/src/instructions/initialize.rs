use anchor_lang::prelude::*;
use anchor_lang::system_program;

use crate::errors::EscrowError;
use crate::state::{job_id_hash, EscrowStatus, JobEscrow, FEE_BPS, BPS_DENOMINATOR, PLATFORM_FEE_SEED};

#[derive(Accounts)]
#[instruction(job_id: String)]
pub struct InitializeEscrow<'info> {
    /// The client funding the escrow
    #[account(mut)]
    pub client: Signer<'info>,

    /// CHECK: arbitrary pubkey stored as reference; validated on lock/release/refund
    pub authority: UncheckedAccount<'info>,
    #[account(
        init,
        payer = client,
        space = JobEscrow::LEN,
        seeds = [b"escrow" as &[u8], &job_id_hash(&job_id) as &[u8]],
        bump,
    )]
    pub escrow: Account<'info, JobEscrow>,

    /// The vault PDA that holds the lamports (no data — system-owned)
    /// CHECK: PDA vault controlled by this program; holds SOL only
    #[account(
        mut,
        seeds = [b"vault" as &[u8], &job_id_hash(&job_id) as &[u8]],
        bump,
    )]
    pub vault: UncheckedAccount<'info>,

    /// The global platform fee vault PDA (needed to store its bump in escrow state)
    /// CHECK: PDA controlled by this program; accumulates platform fees
    #[account(
        seeds = [PLATFORM_FEE_SEED],
        bump,
    )]
    pub platform_fee_vault: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<InitializeEscrow>, job_id: String, amount: u64) -> Result<()> {
    require!(amount > 0, EscrowError::InvalidAmount);
    require!(job_id.len() == 36, EscrowError::InvalidJobId);

    // Compute 2.5% client fee
    let fee = amount
        .checked_mul(FEE_BPS)
        .ok_or(EscrowError::Overflow)?
        .checked_div(BPS_DENOMINATOR)
        .ok_or(EscrowError::Overflow)?;
    require!(fee > 0, EscrowError::FeeTooSmall);

    let total = amount
        .checked_add(fee)
        .ok_or(EscrowError::Overflow)?;

    let job_id_bytes = job_id_hash(&job_id);

    let escrow = &mut ctx.accounts.escrow;
    escrow.client = ctx.accounts.client.key();
    escrow.freelancer = Pubkey::default();
    escrow.authority = ctx.accounts.authority.key();
    escrow.job_id = job_id_bytes;
    escrow.amount = amount;
    escrow.platform_fee = fee;
    escrow.status = EscrowStatus::Funded;
    escrow.bump = ctx.bumps.escrow;
    escrow.vault_bump = ctx.bumps.vault;
    escrow.platform_fee_vault_bump = ctx.bumps.platform_fee_vault;

    // Transfer amount + fee from client to vault PDA
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

    msg!(
        "Escrow initialised for job {} — principal: {} lamports, fee: {} lamports, total charged: {}",
        job_id, amount, fee, total
    );
    Ok(())
}
