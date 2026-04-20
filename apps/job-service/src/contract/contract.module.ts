import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@mintjobs/config';
import { Contract } from './entities/contract.entity';
import { Job } from '../entities/job.entity';
import { ContractService } from './contract.service';
import { ContractMessageHandler } from './contract.message-handler';
import { PinataService } from './pinata.service';

@Module({
  imports: [TypeOrmModule.forFeature([Contract, Job]), ConfigModule],
  providers: [ContractService, ContractMessageHandler, PinataService],
  exports: [ContractService],
})
export class ContractModule {}
