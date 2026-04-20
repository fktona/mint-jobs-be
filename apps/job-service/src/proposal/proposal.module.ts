import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Proposal } from './entities/proposal.entity';
import { Job } from '../entities/job.entity';
import { ProposalService } from './proposal.service';
import { ProposalMessageHandler } from './proposal.message-handler';

@Module({
  imports: [TypeOrmModule.forFeature([Proposal, Job])],
  providers: [ProposalService, ProposalMessageHandler],
  exports: [ProposalService],
})
export class ProposalModule {}
