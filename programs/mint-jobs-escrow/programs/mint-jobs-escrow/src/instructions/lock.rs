use anchor_lang::prelude::*;
use anchor_lang::system_program;

use crate::errors::EscrowError;
use crate::state::{job_id_hash, EscrowStatus, JobEscrow, PLATFORM_FEE_SEED};

/// Authority locks the escrow after a freelancer is hired.
/// Records the freelancer's wallet, prevents client withdrawal,
/// and moves the 2.5% client fee from vault → platform_fee_vault.
#[derive(Accounts)]
#[instruction(job_id: String)]
pub struct Lock<'info> {
    /// The platform authority — must match the stored authority pubkey
    #[account(mut)]
    pub authority: Signer<'info>,

    /// The JobEscrow state PDA
    #[account(
        mut,
        seeds = [b"escrow" as &[u8], &job_id_hash(&job_id) as &[u8]],
        bump = escrow.bump,
        constraint = escrow.authority == authority.key() @ EscrowError::Unauthorized,
    )]
    pub escrow: Account<'info, JobEscrow>,

    /// The vault PDA holding the lamports (principal + fee)
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

pub fn handler(ctx: Context<Lock>, job_id: String, freelancer: Pubkey) -> Result<()> {
    let escrow = &mut ctx.accounts.escrow;

    require!(
        escrow.status == EscrowStatus::Funded,
        EscrowError::NotFunded
    );

    let fee = escrow.platform_fee;

    escrow.freelancer = freelancer;
    escrow.status = EscrowStatus::Locked;
    escrow.platform_fee = 0;

    // Move the 2.5% hire fee from vault → platform_fee_vault
    if fee > 0 {
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
                    to: ctx.accounts.platform_fee_vault.to_account_info(),
                },
                signer_seeds,
            ),
            fee,
        )?;
    }

    msg!(
        "Escrow locked for job {}; freelancer: {}; {} lamports fee moved to platform vault",
        job_id, freelancer, fee
    );
    Ok(())
}
