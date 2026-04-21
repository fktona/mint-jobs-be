import {
  IsString,
  IsOptional,
  IsArray,
  MaxLength,
  ValidateNested,
  ArrayMaxSize,
  IsUrl,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';

export class ProjectItemDto {
  @ApiPropertyOptional({ description: 'Project title' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional({ description: 'What the user did on the project' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  role?: string;

  @ApiPropertyOptional({ description: 'Project URL' })
  @IsOptional()
  @IsUrl()
  @MaxLength(500)
  link?: string;
}

export class CreateFreelancerProfileDto {
  @ApiPropertyOptional({ description: 'Display name', example: 'Damzyb2' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  displayName?: string;

  @ApiPropertyOptional({
    description: 'Professional summary (max ~1000 words)',
    example: 'Web3 Designer | UI/UX Specialist | 4+ Years Experience',
  })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  professionalSummary?: string;

  @ApiPropertyOptional({
    description: 'Work category — any string',
    example: 'Frontend Development',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  category?: string;

  @ApiPropertyOptional({
    description: 'Selected skills — any labels, max 20',
    example: ['Solidity', 'Foundry', 'React'],
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  selectedSkills?: string[];

  @ApiPropertyOptional({
    description: 'Expertise level — any string',
    example: 'Intermediate Level',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  expertiseLevel?: string;

  @ApiPropertyOptional({
    description: 'Portfolio URL',
    example: 'https://example.com/portfolio',
  })
  @IsOptional()
  @IsUrl()
  @MaxLength(500)
  portfolioLink?: string;

  @ApiPropertyOptional({
    description: 'Avatar image URL (from upload service)',
    example: 'https://mint-jobs.s3.eu-north-1.amazonaws.com/avatars/uuid.jpg',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  avatarUrl?: string;

  @ApiPropertyOptional({
    description: 'Resume/CV file URL (from upload service)',
    example: 'https://mint-jobs.s3.eu-north-1.amazonaws.com/resumes/uuid.pdf',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  resumeUrl?: string;

  @ApiPropertyOptional({
    description: 'Proof-of-work projects (max 20)',
    type: [ProjectItemDto],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => ProjectItemDto)
  projects?: ProjectItemDto[];
}

export class UpdateFreelancerProfileDto extends PartialType(
  CreateFreelancerProfileDto,
) {}
