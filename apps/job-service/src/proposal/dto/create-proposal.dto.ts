import { IsString, IsOptional, IsArray, IsUrl, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

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
  @MaxLength(10000)
  coverLetter?: string;
}
