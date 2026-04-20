import {
  IsString,
  IsArray,
  IsOptional,
  IsNumber,
  IsEnum,
  IsDateString,
  IsBoolean,
  ValidateNested,
  Min,
  Max,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationDto } from '@mintjobs/common';

export enum PaymentType {
  FULL_PAYMENT = 'full_payment',
  MILESTONE = 'milestone',
}

export enum ExperienceLevel {
  BEGINNER = 'beginner',
  INTERMEDIATE = 'intermediate',
  EXPERT = 'expert',
}

export enum TimeWindow {
  RECENT = 'recent',
  WEEK = 'week',
  MONTH = 'month',
  ALL = 'all',
}

export class MilestoneDto {
  @ApiProperty({ example: 'Design Phase', description: 'Milestone name' })
  @IsString()
  name: string;

  @ApiPropertyOptional({ example: 30, description: 'Duration in days (optional if dueDate is provided)' })
  @IsOptional()
  @IsNumber()
  @Min(1)
  duration?: number;

  @ApiPropertyOptional({ example: '2024-02-01T00:00:00.000Z', description: 'Due date as ISO string (optional if duration is provided)' })
  @IsOptional()
  @IsDateString()
  dueDate?: string | null;

  @ApiProperty({ example: '1000', description: 'Amount for this milestone (string or number)' })
  @IsString()
  amount: string;

  @ApiPropertyOptional({ example: 'Complete UI/UX design', description: 'Milestone description' })
  @IsOptional()
  @IsString()
  description?: string;
}

export class PaymentDto {
  @ApiProperty({ example: 5000, description: 'Minimum payment amount' })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  fromAmount: number;

  @ApiProperty({ example: 10000, description: 'Maximum payment amount' })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  toAmount: number;

  @ApiProperty({ example: 'sol', description: 'From currency', enum: ['sol', 'usd', 'eur', 'btc', 'eth'] })
  @IsString()
  fromCurrency: string;

  @ApiProperty({ example: 'sol', description: 'To currency', enum: ['sol', 'usd', 'eur', 'btc', 'eth'] })
  @IsString()
  toCurrency: string;

  @ApiProperty({ enum: ['full-payment', 'milestone-payment'], example: 'milestone-payment', description: 'Payment type' })
  @IsString()
  type: 'full-payment' | 'milestone-payment';

  @ApiPropertyOptional({
    example: [
      { name: 'Design Phase', amount: '1000', dueDate: '2024-02-01T00:00:00.000Z', description: 'Complete UI/UX design' },
    ],
    description: 'Milestones (required if type is milestone-payment)',
    type: [MilestoneDto],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MilestoneDto)
  milestones?: MilestoneDto[];
}

export class CreateJobDto {
  // Frontend field names (matching CreateJobPayload)
  @ApiProperty({ example: 'Senior Frontend Developer', description: 'Job title' })
  @IsString()
  jobTitle: string;

  @ApiProperty({ example: 'We are looking for an experienced frontend developer...', description: 'Job description' })
  @IsString()
  jobDescription: string;

  @ApiProperty({ example: 'Web Development', description: 'Job category' })
  @IsString()
  category: string;

  @ApiProperty({ example: ['React', 'TypeScript'], description: 'Required skills (max 5)', type: [String] })
  @IsArray()
  @IsString({ each: true })
  skills: string[];

  @ApiProperty({ example: ['English', 'Spanish'], description: 'Required languages (max 2)', type: [String] })
  @IsArray()
  @IsString({ each: true })
  languages: string[];

  @ApiProperty({ example: '2024-01-01T00:00:00.000Z', description: 'Start date as ISO string' })
  @IsDateString()
  startDate: string;

  @ApiProperty({ example: '2024-12-31T00:00:00.000Z', description: 'End date as ISO string' })
  @IsDateString()
  endDate: string;

  @ApiProperty({ example: 'global', description: 'Job location' })
  @IsString()
  location: string;

  @ApiProperty({ description: 'Payment information', type: PaymentDto })
  @ValidateNested()
  @Type(() => PaymentDto)
  payment: PaymentDto;

  @ApiProperty({ example: 'beginner-level', description: 'Expertise level', enum: ['beginner-level', 'intermediate-level', 'expert-level'] })
  @IsString()
  expertiseLevel: string; // 'beginner-level' | 'intermediate-level' | 'expert-level'

  @ApiPropertyOptional({ example: 1, description: 'Number of freelancers needed' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  freelancersCount?: number;
}

export class UpdateJobDto {
  @ApiPropertyOptional({ example: 'Senior Frontend Developer', description: 'Job title' })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({ example: 'We are looking for an experienced frontend developer...', description: 'Job description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: 'Web Development', description: 'Job category' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ example: '2024-01-01', description: 'Start date (YYYY-MM-DD)' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ example: '2024-12-31', description: 'End date (YYYY-MM-DD)' })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({ example: 180, description: 'Duration in days' })
  @IsOptional()
  @IsNumber()
  @Min(1)
  duration?: number;

  @ApiPropertyOptional({ example: ['English', 'Spanish'], description: 'Required languages', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  languages?: string[];

  @ApiPropertyOptional({ example: ['React', 'TypeScript'], description: 'Required skills', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  skills?: string[];

  @ApiPropertyOptional({ example: 1, description: 'Number of freelancers needed' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  freelancersCount?: number;

  @ApiPropertyOptional({ example: 5000, description: 'Minimum pay range' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  payRangeMin?: number;

  @ApiPropertyOptional({ example: 10000, description: 'Maximum pay range' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  payRangeMax?: number;

  @ApiPropertyOptional({ enum: PaymentType, example: PaymentType.MILESTONE, description: 'Payment type' })
  @IsOptional()
  @IsEnum(PaymentType)
  paymentType?: PaymentType;

  @ApiPropertyOptional({
    example: [
      { name: 'Design Phase', duration: 30, amount: 1000, description: 'Complete UI/UX design' },
    ],
    description: 'Milestones (required if paymentType is milestone)',
    type: [MilestoneDto],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MilestoneDto)
  milestones?: MilestoneDto[];

  @ApiPropertyOptional({ example: 'global', description: 'Job location' })
  @IsOptional()
  @IsString()
  location?: string;

  @ApiPropertyOptional({ enum: ExperienceLevel, example: ExperienceLevel.INTERMEDIATE, description: 'Experience level required' })
  @IsOptional()
  @IsEnum(ExperienceLevel)
  experienceLevel?: ExperienceLevel;
}

export class UpdateJobStatusDto {
  @ApiProperty({ example: true, description: 'Active status' })
  @IsBoolean()
  isActive: boolean;
}

export class SaveDraftDto {
  @ApiPropertyOptional({ example: 'Senior Frontend Developer', description: 'Job title' })
  @IsOptional()
  @IsString()
  jobTitle?: string;

  @ApiPropertyOptional({ example: 'We are looking for an experienced frontend developer...', description: 'Job description' })
  @IsOptional()
  @IsString()
  jobDescription?: string;

  @ApiPropertyOptional({ example: 'Web Development', description: 'Job category' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ example: ['React', 'TypeScript'], description: 'Required skills', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  skills?: string[];

  @ApiPropertyOptional({ example: ['English', 'Spanish'], description: 'Required languages', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  languages?: string[];

  @ApiPropertyOptional({ example: '2024-01-01T00:00:00.000Z', description: 'Start date as ISO string' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ example: '2024-12-31T00:00:00.000Z', description: 'End date as ISO string' })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({ example: 'global', description: 'Job location' })
  @IsOptional()
  @IsString()
  location?: string;

  @ApiPropertyOptional({ description: 'Payment information', type: PaymentDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => PaymentDto)
  payment?: PaymentDto;

  @ApiPropertyOptional({ example: 'beginner-level', description: 'Expertise level', enum: ['beginner-level', 'intermediate-level', 'expert-level'] })
  @IsOptional()
  @IsString()
  expertiseLevel?: string;

  @ApiPropertyOptional({ example: 1, description: 'Number of freelancers needed' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  freelancersCount?: number;
}

export class FilterDraftDto extends PaginationDto {
  // Can add filters later if needed
}

export class FilterJobDto extends PaginationDto {
  @ApiPropertyOptional({ example: 'Web Development', description: 'Filter by category' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ enum: ExperienceLevel, example: ExperienceLevel.INTERMEDIATE, description: 'Filter by experience level' })
  @IsOptional()
  @IsEnum(ExperienceLevel)
  experienceLevel?: ExperienceLevel;

  @ApiPropertyOptional({ example: 'global', description: 'Filter by location' })
  @IsOptional()
  @IsString()
  location?: string;

  @ApiPropertyOptional({ example: 5000, description: 'Minimum pay range filter' })
  @IsOptional()
  @Transform(({ value }) => (value ? Number(value) : undefined))
  @IsNumber()
  @Min(0)
  minPay?: number;

  @ApiPropertyOptional({ example: 10000, description: 'Maximum pay range filter' })
  @IsOptional()
  @Transform(({ value }) => (value ? Number(value) : undefined))
  @IsNumber()
  @Min(0)
  maxPay?: number;

  @ApiPropertyOptional({ enum: PaymentType, example: PaymentType.MILESTONE, description: 'Filter by payment type' })
  @IsOptional()
  @IsEnum(PaymentType)
  paymentType?: PaymentType;

  @ApiPropertyOptional({ example: ['English'], description: 'Filter by languages', type: [String] })
  @IsOptional()
  @Transform(({ value }) => {
    if (!value) return undefined;
    if (Array.isArray(value)) return value;
    if (typeof value === 'string') {
      // Handle comma-separated string or single value
      return value.split(',').map((lang) => lang.trim()).filter(Boolean);
    }
    return [value];
  })
  @IsArray()
  @IsString({ each: true })
  languages?: string[];

  @ApiPropertyOptional({ example: true, description: 'Filter by active status' })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return value;
  })
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({
    enum: TimeWindow,
    example: TimeWindow.WEEK,
    description: 'Filter by time window: recent (3 days), week (7 days), month (30 days), all (no filter). Omit for no filter.',
  })
  @IsOptional()
  @IsEnum(TimeWindow)
  timeWindow?: TimeWindow;
}

