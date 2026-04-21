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
  ArrayMinSize,
  ArrayMaxSize,
  MaxLength,
  IsIn,
} from 'class-validator';

export enum TimeWindow {
  RECENT = 'recent',   // last 3 days
  WEEK = 'week',       // last 7 days
  MONTH = 'month',     // last 30 days
  ALL = 'all',         // no filter
}
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentType, ExperienceLevel, Milestone } from '../entities/job.entity';
import { PaginationDto } from '@mintjobs/common';

const VALID_CURRENCIES = ['sol', 'usd', 'eur', 'btc', 'eth', 'usdc', 'usdt'];

export class MilestoneDto {
  @ApiProperty({ example: 'Design Phase', description: 'Milestone name' })
  @IsString()
  @MaxLength(255)
  name: string;

  @ApiPropertyOptional({ example: 30, description: 'Duration in days (optional if dueDate is provided)' })
  @IsOptional()
  @IsNumber()
  @Min(1)
  duration?: number;

  @ApiPropertyOptional({ example: '2024-02-01', description: 'Due date as ISO string (optional if duration is provided)' })
  @IsOptional()
  @IsDateString()
  dueDate?: string | null;

  @ApiProperty({ example: 1000, description: 'Amount for this milestone (can be string or number)' })
  @IsString()
  @MaxLength(50)
  amount: string;

  @ApiPropertyOptional({ example: 'Complete UI/UX design', description: 'Milestone description' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
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

  @ApiProperty({ example: 'sol', description: 'From currency', enum: VALID_CURRENCIES })
  @IsString()
  @IsIn(VALID_CURRENCIES)
  fromCurrency: string;

  @ApiProperty({ example: 'sol', description: 'To currency', enum: VALID_CURRENCIES })
  @IsString()
  @IsIn(VALID_CURRENCIES)
  toCurrency: string;

  @ApiProperty({ enum: ['full-payment', 'milestone-payment'], example: 'milestone-payment', description: 'Payment type' })
  @IsString()
  type: 'full-payment' | 'milestone-payment';

  @ApiPropertyOptional({
    example: [
      { name: 'Design Phase', amount: '1000', dueDate: '2024-02-01', description: 'Complete UI/UX design' },
    ],
    description: 'Milestones (required if type is milestone-payment)',
    type: [MilestoneDto],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => MilestoneDto)
  milestones?: MilestoneDto[];
}

export class CreateJobDto {
  // Frontend field names (matching CreateJobPayload)
  @ApiProperty({ example: 'Senior Frontend Developer', description: 'Job title' })
  @IsString()
  @MaxLength(500)
  jobTitle: string;

  @ApiProperty({ example: 'We are looking for an experienced frontend developer...', description: 'Job description' })
  @IsString()
  @MaxLength(10000)
  jobDescription: string;

  @ApiProperty({ example: 'Web Development', description: 'Job category' })
  @IsString()
  @MaxLength(255)
  category: string;

  @ApiProperty({ example: ['React', 'TypeScript'], description: 'Required skills (max 5)', type: [String] })
  @IsArray()
  @ArrayMaxSize(5)
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  skills: string[];

  @ApiProperty({ example: ['English', 'Spanish'], description: 'Required languages (max 2)', type: [String] })
  @IsArray()
  @ArrayMaxSize(2)
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  languages: string[];

  @ApiProperty({ example: '2024-01-01T00:00:00.000Z', description: 'Start date as ISO string' })
  @IsDateString()
  startDate: string;

  @ApiProperty({ example: '2024-12-31T00:00:00.000Z', description: 'End date as ISO string' })
  @IsDateString()
  endDate: string;

  @ApiProperty({ example: 'global', description: 'Job location' })
  @IsString()
  @MaxLength(255)
  location: string;

  @ApiProperty({ description: 'Payment information', type: PaymentDto })
  @ValidateNested()
  @Type(() => PaymentDto)
  payment: PaymentDto;

  @ApiProperty({ example: 'beginner-level', description: 'Expertise level', enum: ['beginner-level', 'intermediate-level', 'expert-level'] })
  @IsString()
  @IsIn(['beginner-level', 'intermediate-level', 'expert-level'])
  expertiseLevel: string;

  @ApiPropertyOptional({ example: 1, description: 'Number of freelancers needed' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  freelancersCount?: number;
}

export class UpdateJobDto {
  @ApiPropertyOptional({ example: 'Senior Frontend Developer', description: 'Job title' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  title?: string;

  @ApiPropertyOptional({ example: 'We are looking for an experienced frontend developer...', description: 'Job description' })
  @IsOptional()
  @IsString()
  @MaxLength(10000)
  description?: string;

  @ApiPropertyOptional({ example: 'Web Development', description: 'Job category' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
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
  @ArrayMaxSize(2)
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  languages?: string[];

  @ApiPropertyOptional({ example: ['React', 'TypeScript'], description: 'Required skills', type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  skills?: string[];

  @ApiPropertyOptional({ example: 1, description: 'Number of freelancers needed' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
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
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => MilestoneDto)
  milestones?: MilestoneDto[];

  @ApiPropertyOptional({ example: 'global', description: 'Job location' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
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
  @MaxLength(500)
  jobTitle?: string;

  @ApiPropertyOptional({ example: 'We are looking for an experienced frontend developer...', description: 'Job description' })
  @IsOptional()
  @IsString()
  @MaxLength(10000)
  jobDescription?: string;

  @ApiPropertyOptional({ example: 'Web Development', description: 'Job category' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  category?: string;

  @ApiPropertyOptional({ example: ['React', 'TypeScript'], description: 'Required skills', type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  skills?: string[];

  @ApiPropertyOptional({ example: ['English', 'Spanish'], description: 'Required languages', type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(2)
  @IsString({ each: true })
  @MaxLength(100, { each: true })
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
  @MaxLength(255)
  location?: string;

  @ApiPropertyOptional({ description: 'Payment information', type: PaymentDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => PaymentDto)
  payment?: PaymentDto;

  @ApiPropertyOptional({ example: 'beginner-level', description: 'Expertise level', enum: ['beginner-level', 'intermediate-level', 'expert-level'] })
  @IsOptional()
  @IsString()
  @IsIn(['beginner-level', 'intermediate-level', 'expert-level'])
  expertiseLevel?: string;

  @ApiPropertyOptional({ example: 1, description: 'Number of freelancers needed' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  freelancersCount?: number;
}

export class FilterDraftDto extends PaginationDto {
  // Can add filters later if needed
}

export class FilterJobDto extends PaginationDto {
  @ApiPropertyOptional({ example: 'Web Development', description: 'Filter by category' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  category?: string;

  @ApiPropertyOptional({ enum: ExperienceLevel, example: ExperienceLevel.INTERMEDIATE, description: 'Filter by experience level' })
  @IsOptional()
  @IsEnum(ExperienceLevel)
  experienceLevel?: ExperienceLevel;

  @ApiPropertyOptional({ example: 'global', description: 'Filter by location' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  location?: string;

  @ApiPropertyOptional({ example: 5000, description: 'Minimum pay range filter' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  minPay?: number;

  @ApiPropertyOptional({ example: 10000, description: 'Maximum pay range filter' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  maxPay?: number;

  @ApiPropertyOptional({ enum: PaymentType, example: PaymentType.MILESTONE, description: 'Filter by payment type' })
  @IsOptional()
  @IsEnum(PaymentType)
  paymentType?: PaymentType;

  @ApiPropertyOptional({ example: ['English'], description: 'Filter by languages', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  languages?: string[];

  @ApiPropertyOptional({ example: true, description: 'Filter by active status' })
  @IsOptional()
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

export class JobResponseDto {
  @ApiProperty({ example: 'uuid-here' })
  id: string;

  @ApiProperty({ example: 'did:privy:...' })
  userId: string;

  @ApiProperty({ example: 'Senior Frontend Developer' })
  title: string;

  @ApiProperty({ example: 'We are looking for an experienced frontend developer...' })
  description: string;

  @ApiProperty({ example: 'Web Development' })
  category: string;

  @ApiProperty({ example: '2024-01-01' })
  startDate: Date;

  @ApiProperty({ example: '2024-12-31' })
  endDate: Date;

  @ApiProperty({ example: 180 })
  duration: number;

  @ApiProperty({ example: ['English', 'Spanish'], type: [String] })
  languages: string[];

  @ApiProperty({ example: 5000 })
  payRangeMin: number;

  @ApiProperty({ example: 10000 })
  payRangeMax: number;

  @ApiPropertyOptional({ example: 'usd', description: 'From currency code' })
  payFromCurrency?: string;

  @ApiPropertyOptional({ example: 'sol', description: 'To currency code' })
  payToCurrency?: string;

  @ApiProperty({ enum: PaymentType })
  paymentType: PaymentType;

  @ApiPropertyOptional({ type: [Object] })
  milestones: Milestone[] | null;

  @ApiProperty({ example: 'global' })
  location: string;

  @ApiProperty({ enum: ExperienceLevel })
  experienceLevel: ExperienceLevel;

  @ApiProperty({ example: false })
  isActive: boolean;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}
