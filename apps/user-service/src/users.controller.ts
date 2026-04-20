import {
  Controller,
  Get,
  UseGuards,
  Query,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiHeader, ApiQuery } from '@nestjs/swagger';
import { PrivyGuard, PrivyUser } from '@mintjobs/privy';
import { AdminTokenGuard } from '@mintjobs/guards';
import { ResponseUtil } from '@mintjobs/utils';
import { AuthMethod } from './entities/user.entity';
import { UsersService } from './users.service';
import { PrivyService } from '@mintjobs/privy';
import { Role } from '@mintjobs/constants';

@ApiTags('users')
@Controller('users')
@UseGuards(PrivyGuard, AdminTokenGuard)
@ApiBearerAuth('JWT-auth')
@ApiHeader({
  name: 'admin-token',
  description: 'Admin token required for admin/super_admin operations',
  required: false,
})
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly privyService: PrivyService,
  ) {}

  @Get('auth/methods')
  @ApiOperation({ summary: 'Get available authentication methods' })
  async getAuthMethods() {
    const methods = Object.values(AuthMethod);
    return ResponseUtil.success(methods, 'Authentication methods retrieved successfully');
  }

  @Get('me')
  @ApiOperation({ 
    summary: 'Get current user profile',
    description: 'Automatically creates user in database if they do not exist. Fetches user data from Privy and creates local record. Role is required via query parameter (requires admin-token for admin/super_admin roles).'
  })
  @ApiQuery({
    name: 'role',
    required: true,
    enum: Role,
    description: 'User role to set. Admin token required for ADMIN or SUPER_ADMIN roles.',
  })
  async getCurrentUser(
    @PrivyUser('privyId') privyId: string,
    @Query('role') role: string,
    @Req() request?: Request,
  ) {
    // Get admin token from request
    const adminToken = request?.headers?.['admin-token'] as string;

    // Get or create user with role validation (all logic in service)
    const user = await this.usersService.getOrCreateUserWithRole(
      privyId,
      role,
      adminToken,
    );

    // Get fresh data from Privy
    const privyUserData = await this.privyService.getUser(privyId);

    return ResponseUtil.success(
      {
        ...user,
        privyData: privyUserData,
      },
      'User profile retrieved successfully',
    );
  }

  @Get('me/wallet')
  @ApiOperation({ summary: 'Get current user wallet' })
  async getCurrentUserWallet(@PrivyUser('privyId') privyId: string) {
    const wallets = await this.privyService.getUserWallets(privyId);
    return ResponseUtil.success(wallets, 'User wallets retrieved successfully');
  }
}
