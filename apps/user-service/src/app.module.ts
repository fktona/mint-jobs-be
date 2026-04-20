import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@mintjobs/config';
import { LoggerModule } from '@mintjobs/logger';
import { DatabaseModule } from '@mintjobs/database';
import { MessagingModule } from '@mintjobs/messaging';
import { PrivyModule } from '@mintjobs/privy';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { UsersMessageHandler } from './users/users.message-handler';
import { User } from './entities/user.entity';
import { FreelancerProfileModule } from './freelancer-profile/freelancer-profile.module';
import { ClientProfileModule } from './client-profile/client-profile.module';

@Module({
  imports: [
    ConfigModule,
    LoggerModule,
    DatabaseModule,
    MessagingModule,
    PrivyModule,
    TypeOrmModule.forFeature([User]),
    FreelancerProfileModule,
    ClientProfileModule,
  ],
  controllers: [UsersController],
  providers: [UsersService, UsersMessageHandler],
  exports: [UsersService],
})
export class AppModule {}
