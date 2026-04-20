import { IsString, IsOptional, IsArray, IsEnum, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationDto } from '@mintjobs/common';

export enum ProposalStatus {
  PENDING = 'pending',
  SHORTLISTED = 'shortlisted',
  AWAITING_ACCEPTANCE = 'awaiting_acceptance',
  HIRED = 'hired',
  REJECTED = 'rejected',
}

export class CreateProposalDto {
  @ApiProperty({ description: 'Job ID to apply for' })
  @IsString()
  jobId: string;

  @ApiProperty({
    description: 'Portfolio or project links',
    type: [String],
    example: ['https://github.com/user/project', 'https://example.com/demo'],
  })
  @IsArray()
  @IsString({ each: true })
  links: string[];

  @ApiPropertyOptional({
    description: 'Resume/CV URL (from upload service)',
    example: 'https://mint-jobs.s3.eu-north-1.amazonaws.com/resumes/uuid.pdf',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  resumeUrl?: string;

  @ApiPropertyOptional({
    description: 'Cover letter',
    example: 'I am excited to apply for this role because...',
  })
  @IsOptional()
  @IsString()
  coverLetter?: string;
}

export class UpdateProposalStatusDto {
  @ApiProperty({
    enum: [ProposalStatus.SHORTLISTED, ProposalStatus.HIRED, ProposalStatus.REJECTED],
    description: 'New status — shortlisted, hired, or rejected',
  })
  @IsEnum([ProposalStatus.SHORTLISTED, ProposalStatus.HIRED, ProposalStatus.REJECTED], {
    message: 'Status must be shortlisted, hired, or rejected',
  })
  status: ProposalStatus.SHORTLISTED | ProposalStatus.HIRED | ProposalStatus.REJECTED;

  @ApiPropertyOptional({ description: 'Client Solana wallet address (required when status is hired)' })
  @IsOptional()
  @IsString()
  clientWallet?: string;

  @ApiPropertyOptional({ description: 'Client wallet signature of contract terms (required when status is hired)' })
  @IsOptional()
  @IsString()
  clientSignature?: string;
}

export class AcceptProposalDto {
  @ApiProperty({ description: 'Freelancer Solana wallet address (base58)' })
  @IsString()
  freelancerWallet: string;

  @ApiProperty({ description: 'Freelancer wallet signature of contract terms' })
  @IsString()
  freelancerSignature: string;
}

export class FilterProposalDto extends PaginationDto {
  @ApiPropertyOptional({ enum: ProposalStatus, description: 'Filter by status' })
  @IsOptional()
  @IsEnum(ProposalStatus)
  status?: ProposalStatus;
}
