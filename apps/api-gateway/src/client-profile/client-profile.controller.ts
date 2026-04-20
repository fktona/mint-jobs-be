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
import { CreateClientProfileDto, UpdateClientProfileDto } from './dto/client-profile.dto';

@ApiTags('client-profile')
@Controller('client-profile')
@UseGuards(PrivyGuard)
@ApiBearerAuth('JWT-auth')
export class ClientProfileController {
  constructor(
    private readonly requestResponseService: RequestResponseService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create client profile for the authenticated user' })
  async createProfile(
    @PrivyUser('privyId') privyId: string,
    @Body() dto: CreateClientProfileDto,
    @Req() request: Request,
  ) {
    const correlationId = (request as any).correlationId;
    const data = await this.requestResponseService.request(
      MessagePattern.CLIENT_PROFILE_CREATE,
      { userId: privyId, ...dto },
      MessagePattern.CLIENT_PROFILE_CREATE_RESPONSE,
      QueueName.CLIENT_PROFILE_QUEUE,
      correlationId,
    );
    return ResponseUtil.success(data, 'Client profile created successfully');
  }

  @Patch()
  @ApiOperation({ summary: 'Update client profile for the authenticated user' })
  async updateProfile(
    @PrivyUser('privyId') privyId: string,
    @Body() dto: UpdateClientProfileDto,
    @Req() request: Request,
  ) {
    const correlationId = (request as any).correlationId;
    const data = await this.requestResponseService.request(
      MessagePattern.CLIENT_PROFILE_UPDATE,
      { userId: privyId, ...dto },
      MessagePattern.CLIENT_PROFILE_UPDATE_RESPONSE,
      QueueName.CLIENT_PROFILE_QUEUE,
      correlationId,
    );
    return ResponseUtil.success(data, 'Client profile updated successfully');
  }

  @Get('me')
  @ApiOperation({ summary: 'Get client profile of the authenticated user' })
  async getMyProfile(
    @PrivyUser('privyId') privyId: string,
    @Req() request: Request,
  ) {
    const correlationId = (request as any).correlationId;
    const data = await this.requestResponseService.request(
      MessagePattern.CLIENT_PROFILE_GET_ME,
      { userId: privyId },
      MessagePattern.CLIENT_PROFILE_GET_ME_RESPONSE,
      QueueName.CLIENT_PROFILE_QUEUE,
      correlationId,
    );
    return ResponseUtil.success(data, 'Client profile retrieved successfully');
  }

  @Get(':userId')
  @ApiOperation({ summary: 'Get client profile by user ID' })
  @ApiParam({ name: 'userId', description: 'Privy DID of the user' })
  async getProfileByUser(
    @Param('userId') userId: string,
    @Req() request: Request,
  ) {
    const correlationId = (request as any).correlationId;
    const data = await this.requestResponseService.request(
      MessagePattern.CLIENT_PROFILE_GET_BY_USER,
      { userId },
      MessagePattern.CLIENT_PROFILE_GET_BY_USER_RESPONSE,
      QueueName.CLIENT_PROFILE_QUEUE,
      correlationId,
    );
    return ResponseUtil.success(data, 'Client profile retrieved successfully');
  }
}
