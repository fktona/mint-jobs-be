import { IsString, IsOptional, MaxLength, IsUrl, IsNumberString } from 'class-validator';

export class CreateTokenDto {
  @IsString()
  @MaxLength(255)
  name: string;

  @IsString()
  @MaxLength(50)
  symbol: string;

  @IsString()
  @MaxLength(255)
  ca: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsOptional()
  @IsUrl()
  @MaxLength(500)
  imageUrl?: string;
}

export class ConfirmTokenDto {
  @IsString()
  @MaxLength(255)
  name: string;

  @IsString()
  @MaxLength(50)
  symbol: string;

  /** Contract / mint address */
  @IsString()
  @MaxLength(255)
  ca: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsOptional()
  @IsUrl()
  @MaxLength(500)
  imageUrl?: string;

  /** Tx signature if frontend already broadcast */
  @IsOptional()
  @IsString()
  @MaxLength(255)
  txSignature?: string;

  /** Base64 signed transaction if frontend wants us to broadcast */
  @IsOptional()
  @IsString()
  signedTransaction?: string;
}

export class FilterTokenDto {
  page?: number;
  limit?: number;
}

export class InitiateTokenDto {
  @IsString()
  @MaxLength(255)
  name: string;

  @IsString()
  @MaxLength(50)
  symbol: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  website?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  twitter?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  telegram?: string;

  @IsOptional()
  decimals?: number;

  /** Amount of SOL to buy on creation (e.g. "0.1"). Omit for create-only. */
  @IsOptional()
  @IsString()
  buyAmount?: string;

  /** Slippage in basis points (default 100 = 1%) */
  @IsOptional()
  slippage?: number;

  /** Wallet public key of the creator */
  @IsString()
  walletPublicKey: string;

  /** Optional vanity mint address */
  @IsOptional()
  @IsString()
  @MaxLength(255)
  tokenCA?: string;

  /** Base64-encoded image bytes */
  @IsString()
  imageBase64: string;

  /** Image filename with extension (e.g. "token.png") */
  @IsString()
  @MaxLength(255)
  imageFilename: string;
}
