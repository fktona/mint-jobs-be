import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Request } from 'express';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { PrivyGuard, PrivyUser } from '@mintjobs/privy';
import { RequestResponseService } from '@mintjobs/messaging';
import { MessagePattern, QueueName } from '@mintjobs/constants';
import { ResponseUtil } from '@mintjobs/utils';
import {
  CreateFreelancerProfileDto,
  UpdateFreelancerProfileDto,
} from './dto/freelancer-profile.dto';

@ApiTags('freelancer-profile')
@Controller('freelancer-profile')
@UseGuards(PrivyGuard)
@ApiBearerAuth('JWT-auth')
export class FreelancerProfileController {
  constructor(
    private readonly requestResponseService: RequestResponseService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create freelancer profile for the authenticated user' })
  async createProfile(
    @PrivyUser('privyId') privyId: string,
    @Body() dto: CreateFreelancerProfileDto,
    @Req() request: Request,
  ) {
    const correlationId = (request as any).correlationId;
    const data = await this.requestResponseService.request(
      MessagePattern.FREELANCER_PROFILE_CREATE,
      { userId: privyId, ...dto },
      MessagePattern.FREELANCER_PROFILE_CREATE_RESPONSE,
      QueueName.FREELANCER_PROFILE_QUEUE,
      correlationId,
    );
    return ResponseUtil.success(data, 'Freelancer profile created successfully');
  }

  @Patch()
  @ApiOperation({ summary: 'Update freelancer profile for the authenticated user' })
  async updateProfile(
    @PrivyUser('privyId') privyId: string,
    @Body() dto: UpdateFreelancerProfileDto,
    @Req() request: Request,
  ) {
    const correlationId = (request as any).correlationId;
    const data = await this.requestResponseService.request(
      MessagePattern.FREELANCER_PROFILE_UPDATE,
      { userId: privyId, ...dto },
      MessagePattern.FREELANCER_PROFILE_UPDATE_RESPONSE,
      QueueName.FREELANCER_PROFILE_QUEUE,
      correlationId,
    );
    return ResponseUtil.success(data, 'Freelancer profile updated successfully');
  }

  @Get('me')
  @ApiOperation({ summary: 'Get freelancer profile of the authenticated user' })
  async getMyProfile(
    @PrivyUser('privyId') privyId: string,
    @Req() request: Request,
  ) {
    const correlationId = (request as any).correlationId;
    const data = await this.requestResponseService.request(
      MessagePattern.FREELANCER_PROFILE_GET_ME,
      { userId: privyId },
      MessagePattern.FREELANCER_PROFILE_GET_ME_RESPONSE,
      QueueName.FREELANCER_PROFILE_QUEUE,
      correlationId,
    );
    return ResponseUtil.success(data, 'Freelancer profile retrieved successfully');
  }

  @Get(':userId')
  @ApiOperation({ summary: 'Get freelancer profile by user ID (public)' })
  @ApiParam({ name: 'userId', description: 'Privy DID of the user' })
  async getProfileByUser(
    @Param('userId') userId: string,
    @Req() request: Request,
  ) {
    const correlationId = (request as any).correlationId;
    const data = await this.requestResponseService.request(
      MessagePattern.FREELANCER_PROFILE_GET_BY_USER,
      { userId },
      MessagePattern.FREELANCER_PROFILE_GET_BY_USER_RESPONSE,
      QueueName.FREELANCER_PROFILE_QUEUE,
      correlationId,
    );
    return ResponseUtil.success(data, 'Freelancer profile retrieved successfully');
  }
}
