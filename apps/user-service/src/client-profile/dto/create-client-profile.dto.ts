import { IsString, IsOptional, IsUrl, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class CreateClientProfileDto {
  @ApiPropertyOptional({ description: 'Display name', example: 'Acme Corp' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  displayName?: string;

  @ApiPropertyOptional({ description: 'City/Country', example: 'Lagos, Nigeria' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  location?: string;

  @ApiPropertyOptional({
    description: 'Timezone string',
    example: '(UTC+01:00) West Africa Time',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  timezone?: string;

  @ApiPropertyOptional({
    description: 'Company website URL',
    example: 'https://acme.com',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  website?: string;

  @ApiPropertyOptional({
    description: 'Short description about the client',
    example: 'We build decentralized tools for the open web.',
  })
  @IsOptional()
  @IsString()
  bio?: string;

  @ApiPropertyOptional({
    description: 'Avatar image URL (from upload service)',
    example: 'https://mint-jobs.s3.eu-north-1.amazonaws.com/avatars/uuid.jpg',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  avatarUrl?: string;
}
