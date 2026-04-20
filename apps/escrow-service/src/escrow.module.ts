import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PrivyModule } from '@mintjobs/privy';
import { ConfigModule } from '@mintjobs/config';
import { Escrow } from './entities/escrow.entity';
import { Milestone } from './entities/milestone.entity';
import { EscrowService } from './escrow.service';
import { EscrowMessageHandler } from './escrow.message-handler';

@Module({
  imports: [TypeOrmModule.forFeature([Escrow, Milestone]), PrivyModule, ConfigModule],
  providers: [EscrowService, EscrowMessageHandler],
  exports: [EscrowService],
})
export class EscrowModule {}
