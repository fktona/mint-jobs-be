import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { ProposalStatus } from '../entities/proposal.entity';

export class UpdateProposalStatusDto {
  @ApiProperty({
    description: 'New status for the proposal',
    enum: [ProposalStatus.SHORTLISTED, ProposalStatus.HIRED, ProposalStatus.REJECTED],
    example: ProposalStatus.SHORTLISTED,
  })
  @IsEnum([ProposalStatus.SHORTLISTED, ProposalStatus.HIRED, ProposalStatus.REJECTED], {
    message: 'Status must be shortlisted, hired, or rejected',
  })
  status: ProposalStatus.SHORTLISTED | ProposalStatus.HIRED | ProposalStatus.REJECTED;

  @ApiProperty({ description: 'Client Solana wallet address (required when status is hired)', required: false })
  @IsOptional()
  @IsString()
  clientWallet?: string;

  @ApiProperty({ description: 'Client wallet signature of contract terms (required when status is hired)', required: false })
  @IsOptional()
  @IsString()
  clientSignature?: string;
}
