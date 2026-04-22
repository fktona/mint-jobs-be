import { IsString, IsOptional, MaxLength, IsUrl, IsNumber, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateTokenDto {
  @ApiProperty({ example: 'MintJobs Token', description: 'Token name' })
  @IsString()
  @MaxLength(255)
  name: string;

  @ApiProperty({ example: 'MJT', description: 'Token symbol' })
  @IsString()
  @MaxLength(50)
  symbol: string;

  @ApiProperty({ example: 'So11111111111111111111111111111111111111112', description: 'Contract / mint address' })
  @IsString()
  @MaxLength(255)
  ca: string;

  @ApiPropertyOptional({ example: 'Utility token for the MintJobs platform' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiPropertyOptional({ example: 'https://example.com/token.png' })
  @IsOptional()
  @IsUrl()
  @MaxLength(500)
  imageUrl?: string;
}

export class ConfirmTokenDto {
  @ApiProperty({ example: 'MintJobs Token', description: 'Token name' })
  @IsString()
  @MaxLength(255)
  name: string;

  @ApiProperty({ example: 'MJT', description: 'Token symbol' })
  @IsString()
  @MaxLength(50)
  symbol: string;

  @ApiProperty({ example: 'So11111111111111111111111111111111111111112', description: 'Mint / contract address' })
  @IsString()
  @MaxLength(255)
  ca: string;

  @ApiPropertyOptional({ example: 'Utility token for the MintJobs platform' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiPropertyOptional({ example: 'https://example.com/token.png' })
  @IsOptional()
  @IsUrl()
  @MaxLength(500)
  imageUrl?: string;

  @ApiPropertyOptional({
    example: '5mFn...xyz',
    description: 'Tx signature — provide this if you already broadcast the transaction yourself',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  txSignature?: string;

  @ApiPropertyOptional({
    description: 'Base64-encoded signed transaction — provide this if you want the backend to broadcast it',
  })
  @IsOptional()
  @IsString()
  signedTransaction?: string;
}

export class InitiateTokenDto {
  @ApiProperty({ example: 'MintJobs Token' })
  @IsString()
  @MaxLength(255)
  name: string;

  @ApiProperty({ example: 'MJT' })
  @IsString()
  @MaxLength(50)
  symbol: string;

  @ApiPropertyOptional({ example: 'A utility token' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiPropertyOptional({ example: 'https://mintjobs.fun' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  website?: string;

  @ApiPropertyOptional({ example: '@mintjobs' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  twitter?: string;

  @ApiPropertyOptional({ example: 't.me/mintjobs' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  telegram?: string;

  @ApiPropertyOptional({ example: 6, description: 'Token decimals (default 6)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  decimals?: number;

  @ApiPropertyOptional({ example: '0.1', description: 'SOL amount to buy on creation. Omit for create-only.' })
  @IsOptional()
  @IsString()
  buyAmount?: string;

  @ApiPropertyOptional({ example: 100, description: 'Slippage in basis points (default 100 = 1%)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  slippage?: number;

  @ApiProperty({ example: '7xKXtg...', description: 'Creator wallet public key (base58)' })
  @IsString()
  walletPublicKey: string;

  @ApiPropertyOptional({ example: 'ABC123...', description: 'Vanity mint address if pre-generated' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  tokenCA?: string;

  @ApiProperty({ description: 'Base64-encoded image bytes' })
  @IsString()
  imageBase64: string;

  @ApiProperty({ example: 'token.png', description: 'Image filename with extension' })
  @IsString()
  @MaxLength(255)
  imageFilename: string;
}
