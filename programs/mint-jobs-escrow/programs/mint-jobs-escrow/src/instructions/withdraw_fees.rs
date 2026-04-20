use anchor_lang::prelude::*;
use anchor_lang::system_program;

use crate::errors::EscrowError;
use crate::state::PLATFORM_FEE_SEED;

/// Authority withdraws accumulated platform fees from the global fee vault.
#[derive(Accounts)]
pub struct WithdrawFees<'info> {
    /// The platform authority wallet — receives the withdrawn fees
    #[account(mut)]
    pub authority: Signer<'info>,

    /// The global platform fee vault PDA
    /// CHECK: PDA controlled by this program; holds accumulated platform fees
    #[account(
        mut,
        seeds = [PLATFORM_FEE_SEED],
        bump,
    )]
    pub platform_fee_vault: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<WithdrawFees>, amount: u64) -> Result<()> {
    require!(amount > 0, EscrowError::InvalidAmount);

    let bump = ctx.bumps.platform_fee_vault;
    let bump_slice = &[bump];
    let seeds: &[&[u8]] = &[PLATFORM_FEE_SEED, bump_slice];
    let signer_seeds = &[seeds];

    system_program::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.system_program.to_account_info(),
            system_program::Transfer {
                from: ctx.accounts.platform_fee_vault.to_account_info(),
                to: ctx.accounts.authority.to_account_info(),
            },
            signer_seeds,
        ),
        amount,
    )?;

    msg!(
        "Authority withdrew {} lamports from platform fee vault",
        amount
    );
    Ok(())
}
