import { IsEnum, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationDto } from '@mintjobs/common';
import { ProposalStatus } from '../entities/proposal.entity';

export class FilterProposalDto extends PaginationDto {
  @ApiPropertyOptional({ enum: ProposalStatus, description: 'Filter by status' })
  @IsOptional()
  @IsEnum(ProposalStatus)
  status?: ProposalStatus;
}
