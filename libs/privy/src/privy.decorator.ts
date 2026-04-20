import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { PrivyService } from './privy.service';

export interface PrivyUserRequest {
  privyId: string;
  sessionId: string;
  appId: string;
  issuedAt: number;
  expiration: number;
}

/**
 * Decorator to get Privy user info from request
 * Usage: @PrivyUser() user or @PrivyUser('privyId') privyId
 */
export const PrivyUser = createParamDecorator(
  (data: keyof PrivyUserRequest | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user as PrivyUserRequest;

    return data ? user?.[data] : user;
  },
);

/**
 * Decorator to get Privy user data (fetches from Privy API)
 * Usage: @PrivyUserData() userData
 * Note: This decorator requires PrivyService to be injected in the controller
 * For better performance, inject PrivyService directly in your controller methods
 */
export const PrivyUserData = createParamDecorator(
  async (data: string | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user as PrivyUserRequest;

    if (!user?.privyId) {
      return null;
    }

    // Try to get PrivyService from NestJS application context
    const app = ctx.switchToHttp().getRequest().app;
    if (app) {
      try {
        const privyService = app.get(PrivyService);
        if (privyService) {
          const userData = await privyService.getUser(user.privyId);
          if (data && userData) {
            return (userData as any)[data];
          }
          return userData;
        }
      } catch (error) {
        // Fall through to error message
      }
    }

    throw new Error(
      'PrivyService not available. Inject PrivyService in your controller and use it directly instead of @PrivyUserData decorator.',
    );
  },
);
