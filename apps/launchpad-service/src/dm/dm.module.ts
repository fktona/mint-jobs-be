import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DmMessage } from './entities/dm-message.entity';
import { DmService } from './dm.service';

@Module({
  imports: [TypeOrmModule.forFeature([DmMessage])],
  providers: [DmService],
  exports: [DmService],
})
export class DmModule {}
