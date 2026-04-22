import {
  Controller,
  Post,
  Get,
  Put,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Request } from 'express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { PrivyGuard, PrivyUser } from '@mintjobs/privy';
import { RequestResponseService } from '@mintjobs/messaging';
import { MessagePattern, QueueName } from '@mintjobs/constants';
import { ResponseUtil } from '@mintjobs/utils';
import { CreateTokenDto, ConfirmTokenDto, InitiateTokenDto } from './dto/token.dto';
import { UpsertDefiProfileDto } from './dto/defi-profile.dto';

@ApiTags('launchpad')
@Controller('launchpad/tokens')
@UseGuards(PrivyGuard)
@ApiBearerAuth('JWT-auth')
export class LaunchpadController {
  constructor(private readonly requestResponseService: RequestResponseService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Save a token (unconfirmed)',
    description: 'Persist a token record before the on-chain tx is sent. Use /confirm once the tx lands.',
  })
  async createToken(
    @PrivyUser('privyId') userId: string,
    @Body() dto: CreateTokenDto,
    @Req() req: Request,
  ) {
    const correlationId = (req as any).correlationId;
    const data = await this.requestResponseService.request(
      MessagePattern.TOKEN_CREATE,
      { userId, ...dto },
      MessagePattern.TOKEN_CREATE_RESPONSE,
      QueueName.LAUNCHPAD_QUEUE,
      correlationId,
    );
    return ResponseUtil.success(data, 'Token saved successfully');
  }

  @Post('initiate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Initiate token creation',
    description:
      'Uploads image and metadata to IPFS, builds the unsigned Raydium launchpad transaction, ' +
      'and returns base64-serialized transaction(s) for the client to sign. ' +
      'After signing, call POST /confirm with the signed transaction.',
  })
  async initiateToken(
    @Body() dto: InitiateTokenDto,
    @Req() req: Request,
  ) {
    const correlationId = (req as any).correlationId;
    const data = await this.requestResponseService.request(
      MessagePattern.TOKEN_INITIATE,
      dto,
      MessagePattern.TOKEN_INITIATE_RESPONSE,
      QueueName.LAUNCHPAD_QUEUE,
      correlationId,
    );
    return ResponseUtil.success(data, 'Token initiation data ready — sign the transactions and call /confirm');
  }

  @Post('confirm')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Confirm token creation on-chain',
    description:
      'Verifies the token creation transaction landed on Solana, then saves the token to the database. ' +
      'Pass either `txSignature` (if you already broadcast) or `signedTransaction` (base64, and we will broadcast for you). ' +
      'Returns the saved token record with ca, name, symbol, and txSignature.',
  })
  async confirmToken(
    @PrivyUser('privyId') userId: string,
    @Body() dto: ConfirmTokenDto,
    @Req() req: Request,
  ) {
    const correlationId = (req as any).correlationId;
    const data = await this.requestResponseService.request(
      MessagePattern.TOKEN_CONFIRM,
      { userId, ...dto },
      MessagePattern.TOKEN_CONFIRM_RESPONSE,
      QueueName.LAUNCHPAD_QUEUE,
      correlationId,
    );
    return ResponseUtil.success(data, 'Token confirmed and saved successfully');
  }

  @Get()
  @ApiOperation({ summary: 'Get my tokens', description: 'Retrieve all tokens saved by the authenticated user.' })
  async getMyTokens(
    @PrivyUser('privyId') userId: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Req() req?: Request,
  ) {
    const correlationId = (req as any).correlationId;
    const data = await this.requestResponseService.request(
      MessagePattern.TOKEN_GET_MY,
      { userId, page, limit },
      MessagePattern.TOKEN_GET_MY_RESPONSE,
      QueueName.LAUNCHPAD_QUEUE,
      correlationId,
    );
    return ResponseUtil.success(data, 'Tokens retrieved successfully');
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a token by ID' })
  @ApiParam({ name: 'id', description: 'Token ID' })
  async getToken(
    @PrivyUser('privyId') userId: string,
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    const correlationId = (req as any).correlationId;
    const data = await this.requestResponseService.request(
      MessagePattern.TOKEN_GET_ONE,
      { id, userId },
      MessagePattern.TOKEN_GET_ONE_RESPONSE,
      QueueName.LAUNCHPAD_QUEUE,
      correlationId,
    );
    return ResponseUtil.success(data, 'Token retrieved successfully');
  }

  // ─── DeFi Profile ───────────────────────────────────────────────────────────

  @Put('profile')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Upsert my DeFi profile',
    description: 'Creates or updates the authenticated user\'s DeFi profile (name, avatar, bio).',
  })
  async upsertDefiProfile(
    @PrivyUser('privyId') userId: string,
    @Body() dto: UpsertDefiProfileDto,
    @Req() req: Request,
  ) {
    const correlationId = (req as any).correlationId;
    const data = await this.requestResponseService.request(
      MessagePattern.DEFI_PROFILE_UPSERT,
      { userId, ...dto },
      MessagePattern.DEFI_PROFILE_UPSERT_RESPONSE,
      QueueName.LAUNCHPAD_QUEUE,
      correlationId,
    );
    return ResponseUtil.success(data, 'DeFi profile saved successfully');
  }

  @Get('profile/me')
  @ApiOperation({ summary: 'Get my DeFi profile' })
  async getMyDefiProfile(
    @PrivyUser('privyId') userId: string,
    @Req() req: Request,
  ) {
    const correlationId = (req as any).correlationId;
    const data = await this.requestResponseService.request(
      MessagePattern.DEFI_PROFILE_GET,
      { userId },
      MessagePattern.DEFI_PROFILE_GET_RESPONSE,
      QueueName.LAUNCHPAD_QUEUE,
      correlationId,
    );
    return ResponseUtil.success(data, 'DeFi profile retrieved successfully');
  }
}
