import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@mintjobs/config';
import { Role } from '@mintjobs/constants';

/**
 * Guard that requires admin-token header for admin/super_admin roles
 */
@Injectable()
export class AdminTokenGuard implements CanActivate {
  constructor(private configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    // Only check for admin/super_admin roles
    if (user && (user.role === Role.ADMIN || user.role === Role.SUPER_ADMIN)) {
      const adminToken = request.headers['admin-token'];
      const expectedToken = this.configService.admin.adminToken;

      if (!adminToken || adminToken !== expectedToken) {
        throw new UnauthorizedException(
          'Admin token required for admin operations',
        );
      }
    }

    return true;
  }
}
