import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@mintjobs/config';
import { LoggerModule } from '@mintjobs/logger';
import { DatabaseModule } from '@mintjobs/database';
import { MessagingModule } from '@mintjobs/messaging';
import { JobsService } from './jobs.service';
import { JobsMessageHandler } from './jobs/jobs.message-handler';
import { Job } from './entities/job.entity';
import { SavedJob } from './entities/saved-job.entity';
import { ProposalModule } from './proposal/proposal.module';
import { ContractModule } from './contract/contract.module';

@Module({
  imports: [
    ConfigModule,
    LoggerModule,
    DatabaseModule,
    MessagingModule,
    TypeOrmModule.forFeature([Job, SavedJob]),
    ProposalModule,
    ContractModule,
  ],
  controllers: [],
  providers: [JobsService, JobsMessageHandler],
  exports: [JobsService],
})
export class AppModule {}