import { IsEnum, IsString, IsOptional, IsEmail } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AuthMethod } from '../entities/user.entity';
import { Role } from '@mintjobs/constants';

export class CreateUserDto {
  @ApiPropertyOptional({
    description: 'Wallet address',
    example: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU',
  })
  @IsOptional()
  @IsString()
  walletAddress?: string;

  @ApiProperty({
    description: 'Authentication method',
    enum: AuthMethod,
    example: AuthMethod.WALLET,
  })
  @IsEnum(AuthMethod)
  authMethod: AuthMethod;

  @ApiPropertyOptional({
    description: 'User role',
    enum: Role,
    default: Role.GUEST,
  })
  @IsOptional()
  @IsEnum(Role)
  role?: Role;

  @ApiPropertyOptional({
    description: 'Email address',
    example: 'user@example.com',
  })
  @IsOptional()
  @IsEmail()
  email?: string;
}
