use anchor_lang::prelude::*;

#[error_code]
pub enum EscrowError {
    #[msg("Escrow is not in Funded status")]
    NotFunded,

    #[msg("Escrow is not in Locked status")]
    NotLocked,

    #[msg("Escrow is already locked — client cannot withdraw after hire")]
    AlreadyLocked,

    #[msg("Escrow is already finalised (Released or Refunded)")]
    AlreadyFinalised,

    #[msg("Unauthorized: caller does not have permission for this action")]
    Unauthorized,

    #[msg("Amount must be greater than zero")]
    InvalidAmount,

    #[msg("Job ID must be exactly 36 characters (UUID format)")]
    InvalidJobId,

    #[msg("Arithmetic overflow")]
    Overflow,

    #[msg("Fee calculation resulted in zero — amount too small")]
    FeeTooSmall,

    #[msg("Metadata URI exceeds maximum length of 200 characters")]
    MetadataUriTooLong,
}
