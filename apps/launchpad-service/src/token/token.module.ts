import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@mintjobs/config';
import { Token } from './entities/token.entity';
import { TokenService } from './token.service';
import { TokenMessageHandler } from './token.message-handler';
import { PinataService } from './pinata.service';

@Module({
  imports: [ConfigModule, TypeOrmModule.forFeature([Token])],
  providers: [TokenService, TokenMessageHandler, PinataService],
})
export class TokenModule {}
