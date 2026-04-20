import {
  Controller,
  Get,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiHeader,
  ApiQuery,
} from '@nestjs/swagger';
import { PrivyGuard, PrivyUser } from '@mintjobs/privy';
import { AdminTokenGuard } from '@mintjobs/guards';
import { RolesGuard, Roles } from '@mintjobs/auth';
import { RequestResponseService } from '@mintjobs/messaging';
import { MessagePattern, QueueName } from '@mintjobs/constants';
import { ResponseUtil } from '@mintjobs/utils';
import { Role } from '@mintjobs/constants';
import { FilterUserDto } from './dto/filter-user.dto';

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
    private readonly requestResponseService: RequestResponseService,
  ) {}

  @Get('auth/methods')
  @ApiOperation({ summary: 'Get available authentication methods' })
  async getAuthMethods(@Req() request: Request) {
    const correlationId = (request as any).correlationId;
    const data = await this.requestResponseService.request(
      MessagePattern.USER_GET_AUTH_METHODS,
      {},
      MessagePattern.USER_GET_AUTH_METHODS_RESPONSE,
      QueueName.USER_QUEUE,
      correlationId,
    );
    return ResponseUtil.success(data, 'Authentication methods retrieved successfully');
  }

  @Get('me')
  @ApiOperation({
    summary: 'Get current user profile',
    description:
      'Automatically creates user in database if they do not exist. Fetches user data from Privy and creates local record. Role is required via query parameter (requires admin-token for admin/super_admin roles).',
  })
  @ApiQuery({
    name: 'role',
    required: true,
    enum: Role,
    description:
      'User role to set. Admin token required for ADMIN or SUPER_ADMIN roles.',
  })
  async getCurrentUser(
    @PrivyUser('privyId') privyId: string,
    @Query('role') role: string,
    @Req() request: Request,
  ) {
    const correlationId = (request as any).correlationId;
    const adminToken = request?.headers?.['admin-token'] as string;

    const data = await this.requestResponseService.request(
      MessagePattern.USER_GET_ME,
      {
        privyId,
        role,
        adminToken,
      },
      MessagePattern.USER_GET_ME_RESPONSE,
      QueueName.USER_QUEUE,
      correlationId,
    );
    return ResponseUtil.success(data, 'User profile retrieved successfully');
  }

  @Get('me/wallet')
  @ApiOperation({ summary: 'Get current user wallet' })
  async getCurrentUserWallet(
    @PrivyUser('privyId') privyId: string,
    @Req() request: Request,
  ) {
    const correlationId = (request as any).correlationId;
    const data = await this.requestResponseService.request(
      MessagePattern.USER_GET_ME_WALLET,
      { privyId },
      MessagePattern.USER_GET_ME_WALLET_RESPONSE,
      QueueName.USER_QUEUE,
      correlationId,
    );
    return ResponseUtil.success(data, 'User wallets retrieved successfully');
  }

  @Get()
  @UseGuards(RolesGuard)
  // @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Get all users (Admin/Super Admin only)',
    description: 'Returns a paginated list of all users in the database with optional filters. Only accessible by admin or super_admin roles.',
  })
  async getAllUsers(
    @Query() filterDto: FilterUserDto,
    @Req() request: Request,
  ) {
    const correlationId = (request as any).correlationId;
    const data = await this.requestResponseService.request(
      MessagePattern.USER_GET_ALL,
      filterDto,
      MessagePattern.USER_GET_ALL_RESPONSE,
      QueueName.USER_QUEUE,
      correlationId,
    );
    return ResponseUtil.success(data, 'Users retrieved successfully');
  }
}
