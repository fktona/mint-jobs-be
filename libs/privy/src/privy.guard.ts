import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrivyService } from './privy.service';
import { IS_PUBLIC_KEY } from '@mintjobs/auth';

/**
 * Guard that verifies Privy access tokens from frontend
 */
@Injectable()
export class PrivyGuard implements CanActivate {
  constructor(
    private privyService: PrivyService,
    private reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Check if route is marked as public
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const accessToken = this.privyService.extractTokenFromRequest(request);

    if (!accessToken) {
      throw new UnauthorizedException('Access token is required');
    }

    try {
      // Verify the token
      const verifiedClaims = await this.privyService.verifyAccessToken(
        accessToken,
      );

 

      // Attach verified claims to request
      request.user = {
        privyId: verifiedClaims.userId,
        sessionId: verifiedClaims.sessionId,
        appId: verifiedClaims.appId,
        issuedAt: verifiedClaims.issuedAt,
        expiration: verifiedClaims.expiration,
      };

      return true;
    } catch (error) {

      throw new UnauthorizedException(error?.message || 'Invalid or expired access token');
    }
  }
}
