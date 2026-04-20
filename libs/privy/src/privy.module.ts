import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@mintjobs/config';
import { PrivyService } from './privy.service';
import { PrivyGuard } from './privy.guard';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [PrivyService, PrivyGuard],
  exports: [PrivyService, PrivyGuard],
})
export class PrivyModule {}
