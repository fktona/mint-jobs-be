import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@mintjobs/config';
import { timingSafeEqual } from 'crypto';

/**
 * Guard that requires a valid admin-token header.
 * Applied on routes or controllers that need admin-only access.
 * Works independently of PrivyGuard — does NOT rely on request.user.role.
 */
@Injectable()
export class AdminTokenGuard implements CanActivate {
  constructor(private configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const adminToken = request.headers['admin-token'] as string | undefined;
    const expected = this.configService.admin.adminToken;

    if (!adminToken || !expected) {
      throw new UnauthorizedException('Admin token required for admin operations');
    }

    try {
      const a = Buffer.from(adminToken);
      const b = Buffer.from(expected);
      if (a.length !== b.length || !timingSafeEqual(a, b)) {
        throw new UnauthorizedException('Admin token required for admin operations');
      }
    } catch {
      throw new UnauthorizedException('Admin token required for admin operations');
    }

    return true;
  }
}
