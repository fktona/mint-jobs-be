import { IsOptional, IsEnum, IsBoolean, IsString, IsEmail } from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationDto } from '@mintjobs/common';
import { Role } from '@mintjobs/constants';

export enum AuthMethod {
  WALLET = 'wallet',
  EMAIL = 'email',
  GOOGLE = 'google',
  GITHUB = 'github',
}

export class FilterUserDto extends PaginationDto {
  @ApiPropertyOptional({
    description: 'Filter by user role',
    enum: Role,
    example: Role.CLIENT,
  })
  @IsOptional()
  @IsEnum(Role)
  role?: Role;

  @ApiPropertyOptional({
    description: 'Filter by active status',
    example: true,
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return value;
  })
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({
    description: 'Filter by email address',
    example: 'user@example.com',
  })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({
    description: 'Filter by wallet address',
    example: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU',
  })
  @IsOptional()
  @IsString()
  walletAddress?: string;

  @ApiPropertyOptional({
    description: 'Filter by authentication method',
    enum: AuthMethod,
    example: AuthMethod.WALLET,
  })
  @IsOptional()
  @IsEnum(AuthMethod)
  authMethod?: AuthMethod;

  @ApiPropertyOptional({
    description: 'Search by user ID (Privy DID)',
    example: 'did:privy:...',
  })
  @IsOptional()
  @IsString()
  id?: string;
}
