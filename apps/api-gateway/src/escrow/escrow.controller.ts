import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Query,
  Body,
  Req,
  Headers,
  UseGuards,
  HttpCode,
  HttpStatus,
  BadRequestException,
  UnauthorizedException,
  ParseUUIDPipe,
} from '@nestjs/common';
import { Request } from 'express';
import {
  ApiTags,
  ApiOperation,
  ApiParam,
  ApiBody,
  ApiHeader,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { IsInt, IsString, IsOptional, Min, ValidateIf, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { RequestResponseService } from '@mintjobs/messaging';
import { MessagePattern, QueueName } from '@mintjobs/constants';
import { ResponseUtil } from '@mintjobs/utils';
import { PrivyGuard, PrivyUser } from '@mintjobs/privy';
import { PrivyService } from '@mintjobs/privy';
import { ConfigService } from '@mintjobs/config';
import { LoggerService } from '@mintjobs/logger';

class FundEscrowDto {
  @ApiProperty({
    description: 'Amount to lock in escrow, in lamports (1 SOL = 1,000,000,000 lamports)',
    example: 1000000000,
    minimum: 1,
  })
  @Type(() => Number)
  @IsInt({ message: 'amountLamports must be an integer (lamports cannot be fractional)' })
  @Min(1, { message: 'amountLamports must be at least 1' })
  amountLamports: number;
}

class TopUpEscrowDto {
  @ApiProperty({
    description: 'Additional lamports to add to the escrow (1 SOL = 1,000,000,000 lamports)',
    example: 500000000,
    minimum: 1,
  })
  @Type(() => Number)
  @IsInt({ message: 'additionalLamports must be an integer' })
  @Min(1, { message: 'additionalLamports must be at least 1' })
  additionalLamports: number;
}

class ConfirmEscrowDto {
  @ApiProperty({
    description: 'Solana transaction signature (if frontend already broadcast)',
    example: '5KtWqX...',
    required: false,
  })
  @IsOptional()
  @IsString()
  txSignature?: string;

  @ApiProperty({
    description: 'Base64-encoded signed transaction (backend will broadcast on your behalf)',
    example: 'AQAAAA...',
    required: false,
  })
  @IsOptional()
  @IsString()
  signedTransaction?: string;

  @ValidateIf((o) => !o.txSignature && !o.signedTransaction)
  @IsString({ message: 'Provide either txSignature or signedTransaction' })
  _atLeastOne?: never;
}

class CreateMilestoneItemDto {
  @ApiProperty({ example: 'UI Design', description: 'Milestone title' })
  @IsString()
  title: string;

  @ApiProperty({ example: 'Design all screens', required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ example: 1, description: 'Display order (1-based)' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  order: number;

  @ApiProperty({ example: 500000000, description: 'Fixed amount in lamports for this milestone' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  amountLamports: number;
}

class CreateMilestonesDto {
  @ApiProperty({ type: [CreateMilestoneItemDto], description: 'Ordered list of milestones' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateMilestoneItemDto)
  milestones: CreateMilestoneItemDto[];
}

class MilestoneTopUpDto {
  @ApiProperty({ example: 100000000, description: 'Additional lamports to add to the milestone' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  additionalLamports: number;
}

@ApiTags('escrow')
@Controller('escrow/jobs')
@UseGuards(PrivyGuard)
@ApiBearerAuth('JWT-auth')
export class EscrowController {
  private readonly logger = new LoggerService(this.configService);
  constructor(
    private readonly requestResponseService: RequestResponseService,
    private readonly privyService: PrivyService,
    private readonly configService: ConfigService
  ) {}

  /** Resolve caller's first Solana wallet — returns address and (if embedded) wallet ID */
  private async getSolanaWallet(
    privyId: string,
  ): Promise<{ address: string; walletId?: string }> {
    const wallets = await this.privyService.getUserWallets(privyId);
    const solanaWallet = wallets.find((w) => w.chainType === 'solana');
    if (!solanaWallet) {
      throw new BadRequestException('No Solana wallet linked to your account');
    }
    return { address: solanaWallet.address, walletId: solanaWallet.id };
  }

  /** Validate admin-token header for authority-only operations */
  private requireAdminToken(adminToken: string | undefined): void {
    const expected = this.configService.admin.adminToken;
    if (!adminToken || adminToken !== expected) {
      throw new UnauthorizedException('Admin token required for this operation');
    }
  }

  @Post(':jobId/fund')
  @ApiOperation({
    summary: 'Fund escrow',
    description:
      '`signingMode=server` (default): signs + broadcasts via Privy embedded wallet, returns `{ txSignature }`. ' +
      '`signingMode=client`: returns unsigned base64 `{ transaction }` for the frontend to sign (external wallets).',
  })
  @ApiParam({ name: 'jobId', description: 'Job UUID' })
  @ApiBody({ type: FundEscrowDto })
  async fundEscrow(
    @Param('jobId', new ParseUUIDPipe()) jobId: string,
    @Query('signingMode') signingMode: 'server' | 'client' = 'server',
    @PrivyUser('privyId') privyId: string,
    @Body() body: FundEscrowDto,
    @Req() request: Request,
  ) {
    const correlationId = (request as any).correlationId;
    const { address: clientWallet, walletId } = await this.getSolanaWallet(privyId);
    const userJwt = signingMode === 'server'
      ? this.privyService.extractTokenFromRequest(request)
      : undefined;

    if (signingMode === 'server' && !userJwt) throw new UnauthorizedException('Missing authorization token');
    if (signingMode === 'server' && !walletId) throw new BadRequestException('Server-side signing requires a Privy embedded wallet');

    const data = await this.requestResponseService.request(
      MessagePattern.ESCROW_FUND,
      { jobId, clientId: privyId, clientWallet, amountLamports: body.amountLamports, signingMode, walletId, userJwt },
      MessagePattern.ESCROW_FUND_RESPONSE,
      QueueName.ESCROW_QUEUE,
      correlationId,
    );
    return ResponseUtil.success(data, signingMode === 'server' ? 'Escrow funded successfully' : 'Fund transaction built — sign and broadcast to complete');
  }

  @Post(':jobId/topup')
  @ApiOperation({
    summary: 'Top up escrow',
    description:
      'Add more SOL to an existing Funded escrow. Only allowed before hire (status = funded). ' +
      '`signingMode=server` (default): signs + broadcasts via Privy. ' +
      '`signingMode=client`: returns unsigned base64 `{ transaction }` for frontend signing.',
  })
  @ApiParam({ name: 'jobId', description: 'Job UUID' })
  @ApiBody({ type: TopUpEscrowDto })
  async topUpEscrow(
    @Param('jobId', new ParseUUIDPipe()) jobId: string,
    @Query('signingMode') signingMode: 'server' | 'client' = 'server',
    @PrivyUser('privyId') privyId: string,
    @Body() body: TopUpEscrowDto,
    @Req() request: Request,
  ) {
    const correlationId = (request as any).correlationId;
    const { address: clientWallet, walletId } = await this.getSolanaWallet(privyId);
    const userJwt = signingMode === 'server'
      ? this.privyService.extractTokenFromRequest(request)
      : undefined;

    if (signingMode === 'server' && !userJwt) throw new UnauthorizedException('Missing authorization token');
    if (signingMode === 'server' && !walletId) throw new BadRequestException('Server-side signing requires a Privy embedded wallet');

    const data = await this.requestResponseService.request(
      MessagePattern.ESCROW_TOPUP,
      { jobId, clientWallet, additionalLamports: body.additionalLamports, signingMode, walletId, userJwt },
      MessagePattern.ESCROW_TOPUP_RESPONSE,
      QueueName.ESCROW_QUEUE,
      correlationId,
    );
    return ResponseUtil.success(data, signingMode === 'server' ? 'Escrow topped up successfully' : 'Top-up transaction built — sign and broadcast to complete');
  }

  @Delete(':jobId/fund')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Withdraw escrow (pre-hire only)',
    description:
      '`signingMode=server` (default): signs + broadcasts, returns `{ txSignature }`. ' +
      '`signingMode=client`: returns unsigned `{ transaction }` for frontend signing.',
  })
  @ApiParam({ name: 'jobId', description: 'Job UUID' })
  async withdrawEscrow(
    @Param('jobId', new ParseUUIDPipe()) jobId: string,
    @Query('signingMode') signingMode: 'server' | 'client' = 'server',
    @PrivyUser('privyId') privyId: string,
    @Req() request: Request,
  ) {
    const correlationId = (request as any).correlationId;
    const { address: clientWallet, walletId } = await this.getSolanaWallet(privyId);
    const userJwt = signingMode === 'server'
      ? this.privyService.extractTokenFromRequest(request)
      : undefined;

    if (signingMode === 'server' && !userJwt) throw new UnauthorizedException('Missing authorization token');
    if (signingMode === 'server' && !walletId) throw new BadRequestException('Server-side signing requires a Privy embedded wallet');

    const data = await this.requestResponseService.request(
      MessagePattern.ESCROW_WITHDRAW,
      { jobId, clientWallet, signingMode, walletId, userJwt },
      MessagePattern.ESCROW_WITHDRAW_RESPONSE,
      QueueName.ESCROW_QUEUE,
      correlationId,
    );
    return ResponseUtil.success(data, signingMode === 'server' ? 'Escrow withdrawn successfully' : 'Withdraw transaction built — sign and broadcast to complete');
  }

  @Post(':jobId/release')
  @ApiOperation({
    summary: 'Release escrow to freelancer',
    description:
      '`signingMode=server` (default): signs + broadcasts, returns `{ txSignature }`. ' +
      '`signingMode=client`: returns unsigned `{ transaction }` for frontend signing.',
  })
  @ApiParam({ name: 'jobId', description: 'Job UUID' })
  async releaseEscrow(
    @Param('jobId', new ParseUUIDPipe()) jobId: string,
    @Query('signingMode') signingMode: 'server' | 'client' = 'server',
    @PrivyUser('privyId') privyId: string,
    @Req() request: Request,
  ) {
    const correlationId = (request as any).correlationId;
    const { address: callerWallet, walletId } = await this.getSolanaWallet(privyId);
    const userJwt = signingMode === 'server'
      ? this.privyService.extractTokenFromRequest(request)
      : undefined;

    if (signingMode === 'server' && !userJwt) throw new UnauthorizedException('Missing authorization token');
    if (signingMode === 'server' && !walletId) throw new BadRequestException('Server-side signing requires a Privy embedded wallet');

    const data = await this.requestResponseService.request(
      MessagePattern.ESCROW_RELEASE,
      { jobId, callerWallet, signingMode, walletId, userJwt },
      MessagePattern.ESCROW_RELEASE_RESPONSE,
      QueueName.ESCROW_QUEUE,
      correlationId,
    );
    return ResponseUtil.success(data, signingMode === 'server' ? 'Escrow released successfully' : 'Release transaction built — sign and broadcast to complete');
  }

  @Post(':jobId/refund')
  @ApiOperation({
    summary: 'Authority force-refund (admin only)',
    description:
      'Platform authority refunds escrow back to the client (dispute resolution). ' +
      'Requires admin-token header. The authority wallet signs server-side.',
  })
  @ApiParam({ name: 'jobId', description: 'Job UUID' })
  @ApiHeader({ name: 'admin-token', description: 'Platform admin token', required: true })
  async refundEscrow(
    @Param('jobId', new ParseUUIDPipe()) jobId: string,
    @Headers('admin-token') adminToken: string | undefined,
    @Req() request: Request,
  ) {
    this.requireAdminToken(adminToken);

    const correlationId = (request as any).correlationId;

    const data = await this.requestResponseService.request(
      MessagePattern.ESCROW_REFUND,
      { jobId },
      MessagePattern.ESCROW_REFUND_RESPONSE,
      QueueName.ESCROW_QUEUE,
      correlationId,
    );
    return ResponseUtil.success(data, 'Escrow refunded successfully');
  }

  @Post(':jobId/confirm')
  @ApiOperation({
    summary: 'Confirm client-signed transaction',
    description:
      'After the frontend signs and broadcasts a fund/withdraw/release transaction, call this endpoint with the tx signature to verify on-chain and persist the escrow record.',
  })
  @ApiParam({ name: 'jobId', description: 'Job UUID' })
  @ApiBody({ type: ConfirmEscrowDto })
  async confirmEscrow(
    @Param('jobId', new ParseUUIDPipe()) jobId: string,
    @Body() body: ConfirmEscrowDto,
    @PrivyUser('privyId') privyId: string,
    @Req() request: Request,
  ) {
    const correlationId = (request as any).correlationId;
    const { address: clientWallet } = await this.getSolanaWallet(privyId);

    if (!body.txSignature && !body.signedTransaction) {
      throw new BadRequestException('Provide either txSignature or signedTransaction');
    }

    const data = await this.requestResponseService.request(
      MessagePattern.ESCROW_CONFIRM,
      { jobId, clientId: privyId, clientWallet, txSignature: body.txSignature, signedTransaction: body.signedTransaction },
      MessagePattern.ESCROW_CONFIRM_RESPONSE,
      QueueName.ESCROW_QUEUE,
      correlationId,
    );
    return ResponseUtil.success(data, 'Escrow transaction confirmed');
  }

  @Get(':jobId/contract')
  @ApiOperation({
    summary: 'Read on-chain contract data',
    description: 'Reads and deserializes the JobContract PDA directly from Solana. Returns metadata URI, PDF hash, parties, state, and completion data.',
  })
  @ApiParam({ name: 'jobId', description: 'Job UUID' })
  async getOnChainContract(
    @Param('jobId', new ParseUUIDPipe()) jobId: string,
    @Req() request: Request,
  ) {
    const correlationId = (request as any).correlationId;
    const data = await this.requestResponseService.request(
      MessagePattern.ONCHAIN_CONTRACT_GET,
      { jobId },
      MessagePattern.ONCHAIN_CONTRACT_GET_RESPONSE,
      QueueName.ESCROW_QUEUE,
      correlationId,
    );
    return ResponseUtil.success(data, 'On-chain contract retrieved successfully');
  }

  @Get(':jobId')
  @ApiOperation({
    summary: 'Get escrow state',
    description: 'Returns the current escrow record for the given job (DB + on-chain fallback).',
  })
  @ApiParam({ name: 'jobId', description: 'Job UUID' })
  async getEscrow(
    @Param('jobId', new ParseUUIDPipe()) jobId: string,
    @Req() request: Request,
  ) {
    const correlationId = (request as any).correlationId;

    const data = await this.requestResponseService.request(
      MessagePattern.ESCROW_GET,
      { jobId },
      MessagePattern.ESCROW_GET_RESPONSE,
      QueueName.ESCROW_QUEUE,
      correlationId,
    );
    return ResponseUtil.success(data, 'Escrow retrieved successfully');
  }

  // ─── Milestone routes ────────────────────────────────────────────────────

  @Post(':jobId/milestones')
  @ApiOperation({
    summary: 'Create milestones for a job',
    description: 'Define the payment milestones for a job. Each milestone has a fixed SOL amount set at creation. Call this before funding.',
  })
  @ApiParam({ name: 'jobId', description: 'Job UUID' })
  @ApiBody({ type: CreateMilestonesDto })
  async createMilestones(
    @Param('jobId', new ParseUUIDPipe()) jobId: string,
    @Body() body: CreateMilestonesDto,
    @PrivyUser('privyId') privyId: string,
    @Req() request: Request,
  ) {
    const correlationId = (request as any).correlationId;
    const milestones = body.milestones.map((m) => ({
      ...m,
      amountLamports: m.amountLamports.toString(),
    }));
    const data = await this.requestResponseService.request(
      MessagePattern.MILESTONE_CREATE,
      { jobId, clientId: privyId, milestones },
      MessagePattern.MILESTONE_CREATE_RESPONSE,
      QueueName.ESCROW_QUEUE,
      correlationId,
    );
    return ResponseUtil.success(data, 'Milestones created successfully');
  }

  @Get(':jobId/milestones')
  @ApiOperation({ summary: 'List milestones for a job', description: 'Returns all milestones ordered by their display order.' })
  @ApiParam({ name: 'jobId', description: 'Job UUID' })
  async getMilestonesByJob(
    @Param('jobId', new ParseUUIDPipe()) jobId: string,
    @Req() request: Request,
  ) {
    const correlationId = (request as any).correlationId;
    const data = await this.requestResponseService.request(
      MessagePattern.MILESTONE_GET_BY_JOB,
      { jobId },
      MessagePattern.MILESTONE_GET_BY_JOB_RESPONSE,
      QueueName.ESCROW_QUEUE,
      correlationId,
    );
    return ResponseUtil.success(data, 'Milestones retrieved successfully');
  }
}

// ─── Milestone controller (/escrow/milestones/:milestoneId/...) ──────────────

@ApiTags('escrow')
@Controller('escrow/milestones')
@UseGuards(PrivyGuard)
@ApiBearerAuth('JWT-auth')
export class MilestoneController {
  constructor(
    private readonly requestResponseService: RequestResponseService,
    private readonly privyService: PrivyService,
    private readonly configService: ConfigService,
  ) {}

  private async getSolanaWallet(privyId: string): Promise<{ address: string; walletId?: string }> {
    const wallets = await this.privyService.getUserWallets(privyId);
    const solanaWallet = wallets.find((w) => w.chainType === 'solana');
    if (!solanaWallet) throw new BadRequestException('No Solana wallet linked to your account');
    return { address: solanaWallet.address, walletId: solanaWallet.id };
  }

  private requireAdminToken(adminToken: string | undefined): void {
    const expected = this.configService.admin.adminToken;
    if (!adminToken || adminToken !== expected) {
      throw new UnauthorizedException('Admin token required for this operation');
    }
  }

  @Get(':milestoneId')
  @ApiOperation({ summary: 'Get a single milestone' })
  @ApiParam({ name: 'milestoneId', description: 'Milestone UUID' })
  async getMilestone(
    @Param('milestoneId', new ParseUUIDPipe()) milestoneId: string,
    @Req() request: Request,
  ) {
    const correlationId = (request as any).correlationId;
    const data = await this.requestResponseService.request(
      MessagePattern.MILESTONE_GET_ONE,
      { milestoneId },
      MessagePattern.MILESTONE_GET_ONE_RESPONSE,
      QueueName.ESCROW_QUEUE,
      correlationId,
    );
    return ResponseUtil.success(data, 'Milestone retrieved successfully');
  }

  @Post(':milestoneId/fund')
  @ApiOperation({
    summary: 'Fund a milestone',
    description:
      'Funds the on-chain PDA for this milestone using the amount set at creation. ' +
      '`signingMode=server` (default): Privy signs + broadcasts → `{ txSignature }`. ' +
      '`signingMode=client`: returns unsigned `{ transaction }` for frontend signing.',
  })
  @ApiParam({ name: 'milestoneId', description: 'Milestone UUID' })
  async fundMilestone(
    @Param('milestoneId', new ParseUUIDPipe()) milestoneId: string,
    @Query('signingMode') signingMode: 'server' | 'client' = 'server',
    @PrivyUser('privyId') privyId: string,
    @Req() request: Request,
  ) {
    const correlationId = (request as any).correlationId;
    const { address: clientWallet, walletId } = await this.getSolanaWallet(privyId);
    const userJwt = signingMode === 'server' ? this.privyService.extractTokenFromRequest(request) : undefined;

    if (signingMode === 'server' && !userJwt) throw new UnauthorizedException('Missing authorization token');
    if (signingMode === 'server' && !walletId) throw new BadRequestException('Server-side signing requires a Privy embedded wallet');

    const data = await this.requestResponseService.request(
      MessagePattern.ESCROW_MILESTONE_FUND,
      { milestoneId, clientId: privyId, clientWallet, signingMode, walletId, userJwt },
      MessagePattern.ESCROW_MILESTONE_FUND_RESPONSE,
      QueueName.ESCROW_QUEUE,
      correlationId,
    );
    return ResponseUtil.success(data, signingMode === 'server' ? 'Milestone funded successfully' : 'Fund transaction built — sign and broadcast to complete');
  }

  @Delete(':milestoneId/fund')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Withdraw a funded milestone (pre-hire only)',
    description: 'Returns funds to the client. Only allowed before the freelancer is hired (status = funded).',
  })
  @ApiParam({ name: 'milestoneId', description: 'Milestone UUID' })
  async withdrawMilestone(
    @Param('milestoneId', new ParseUUIDPipe()) milestoneId: string,
    @Query('signingMode') signingMode: 'server' | 'client' = 'server',
    @PrivyUser('privyId') privyId: string,
    @Req() request: Request,
  ) {
    const correlationId = (request as any).correlationId;
    const { address: clientWallet, walletId } = await this.getSolanaWallet(privyId);
    const userJwt = signingMode === 'server' ? this.privyService.extractTokenFromRequest(request) : undefined;

    if (signingMode === 'server' && !userJwt) throw new UnauthorizedException('Missing authorization token');
    if (signingMode === 'server' && !walletId) throw new BadRequestException('Server-side signing requires a Privy embedded wallet');

    const data = await this.requestResponseService.request(
      MessagePattern.ESCROW_MILESTONE_WITHDRAW,
      { milestoneId, clientWallet, signingMode, walletId, userJwt },
      MessagePattern.ESCROW_MILESTONE_WITHDRAW_RESPONSE,
      QueueName.ESCROW_QUEUE,
      correlationId,
    );
    return ResponseUtil.success(data, signingMode === 'server' ? 'Milestone withdrawn successfully' : 'Withdraw transaction built — sign and broadcast to complete');
  }

  @Post(':milestoneId/topup')
  @ApiOperation({
    summary: 'Top up a funded milestone',
    description: 'Add more SOL to a funded milestone before hire. Updates the stored amountLamports.',
  })
  @ApiParam({ name: 'milestoneId', description: 'Milestone UUID' })
  @ApiBody({ type: MilestoneTopUpDto })
  async topUpMilestone(
    @Param('milestoneId', new ParseUUIDPipe()) milestoneId: string,
    @Query('signingMode') signingMode: 'server' | 'client' = 'server',
    @PrivyUser('privyId') privyId: string,
    @Body() body: MilestoneTopUpDto,
    @Req() request: Request,
  ) {
    const correlationId = (request as any).correlationId;
    const { address: clientWallet, walletId } = await this.getSolanaWallet(privyId);
    const userJwt = signingMode === 'server' ? this.privyService.extractTokenFromRequest(request) : undefined;

    if (signingMode === 'server' && !userJwt) throw new UnauthorizedException('Missing authorization token');
    if (signingMode === 'server' && !walletId) throw new BadRequestException('Server-side signing requires a Privy embedded wallet');

    const data = await this.requestResponseService.request(
      MessagePattern.ESCROW_MILESTONE_TOPUP,
      { milestoneId, clientWallet, additionalLamports: body.additionalLamports, signingMode, walletId, userJwt },
      MessagePattern.ESCROW_MILESTONE_TOPUP_RESPONSE,
      QueueName.ESCROW_QUEUE,
      correlationId,
    );
    return ResponseUtil.success(data, signingMode === 'server' ? 'Milestone topped up successfully' : 'Top-up transaction built — sign and broadcast to complete');
  }

  @Post(':milestoneId/release')
  @ApiOperation({
    summary: 'Release a locked milestone to the freelancer',
    description: 'Client (or authority) releases the SOL to the freelancer. Only allowed when status = locked.',
  })
  @ApiParam({ name: 'milestoneId', description: 'Milestone UUID' })
  async releaseMilestone(
    @Param('milestoneId', new ParseUUIDPipe()) milestoneId: string,
    @Query('signingMode') signingMode: 'server' | 'client' = 'server',
    @PrivyUser('privyId') privyId: string,
    @Req() request: Request,
  ) {
    const correlationId = (request as any).correlationId;
    const { address: callerWallet, walletId } = await this.getSolanaWallet(privyId);
    const userJwt = signingMode === 'server' ? this.privyService.extractTokenFromRequest(request) : undefined;

    if (signingMode === 'server' && !userJwt) throw new UnauthorizedException('Missing authorization token');
    if (signingMode === 'server' && !walletId) throw new BadRequestException('Server-side signing requires a Privy embedded wallet');

    const data = await this.requestResponseService.request(
      MessagePattern.ESCROW_MILESTONE_RELEASE,
      { milestoneId, callerWallet, signingMode, walletId, userJwt },
      MessagePattern.ESCROW_MILESTONE_RELEASE_RESPONSE,
      QueueName.ESCROW_QUEUE,
      correlationId,
    );
    return ResponseUtil.success(data, signingMode === 'server' ? 'Milestone released successfully' : 'Release transaction built — sign and broadcast to complete');
  }

  @Post(':milestoneId/refund')
  @ApiOperation({
    summary: 'Authority force-refund a milestone (admin only)',
    description: 'Platform authority refunds a funded or locked milestone back to the client.',
  })
  @ApiParam({ name: 'milestoneId', description: 'Milestone UUID' })
  @ApiHeader({ name: 'admin-token', description: 'Platform admin token', required: true })
  async refundMilestone(
    @Param('milestoneId', new ParseUUIDPipe()) milestoneId: string,
    @Headers('admin-token') adminToken: string | undefined,
    @Req() request: Request,
  ) {
    this.requireAdminToken(adminToken);
    const correlationId = (request as any).correlationId;
    const data = await this.requestResponseService.request(
      MessagePattern.ESCROW_MILESTONE_REFUND,
      { milestoneId },
      MessagePattern.ESCROW_MILESTONE_REFUND_RESPONSE,
      QueueName.ESCROW_QUEUE,
      correlationId,
    );
    return ResponseUtil.success(data, 'Milestone refunded successfully');
  }

  @Post(':milestoneId/confirm')
  @ApiOperation({
    summary: 'Confirm a client-signed milestone transaction',
    description: 'After signing a fund/withdraw/release transaction client-side, call this to verify on-chain and persist the milestone record.',
  })
  @ApiParam({ name: 'milestoneId', description: 'Milestone UUID' })
  @ApiBody({ type: ConfirmEscrowDto })
  async confirmMilestone(
    @Param('milestoneId', new ParseUUIDPipe()) milestoneId: string,
    @Body() body: ConfirmEscrowDto,
    @PrivyUser('privyId') privyId: string,
    @Req() request: Request,
  ) {
    const correlationId = (request as any).correlationId;
    const { address: clientWallet } = await this.getSolanaWallet(privyId);

    if (!body.txSignature && !body.signedTransaction) {
      throw new BadRequestException('Provide either txSignature or signedTransaction');
    }

    const data = await this.requestResponseService.request(
      MessagePattern.ESCROW_MILESTONE_CONFIRM,
      { milestoneId, clientId: privyId, clientWallet, txSignature: body.txSignature, signedTransaction: body.signedTransaction },
      MessagePattern.ESCROW_MILESTONE_CONFIRM_RESPONSE,
      QueueName.ESCROW_QUEUE,
      correlationId,
    );
    return ResponseUtil.success(data, 'Milestone transaction confirmed');
  }
}

// ─── Platform fee controller (/escrow/fees/...) ──────────────────────────────

class WithdrawFeesDto {
  @ApiProperty({ description: 'Amount in lamports to withdraw from the platform fee vault', example: 500000000 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  amount: number;
}

@ApiTags('escrow')
@Controller('escrow/fees')
export class PlatformFeeController {
  constructor(
    private readonly requestResponseService: RequestResponseService,
    private readonly configService: ConfigService,
  ) {}

  private requireAdminToken(adminToken: string | undefined): void {
    const expected = this.configService.admin.adminToken;
    if (!adminToken || adminToken !== expected) {
      throw new UnauthorizedException('Admin token required for this operation');
    }
  }

  @Get('balance')
  @ApiOperation({ summary: 'Get platform fee vault balance (admin only)' })
  @ApiHeader({ name: 'admin-token', required: true })
  async getFeeBalance(
    @Headers('admin-token') adminToken: string | undefined,
    @Req() request: Request,
  ) {
    this.requireAdminToken(adminToken);
    const correlationId = (request as any).correlationId;
    const data = await this.requestResponseService.request(
      MessagePattern.ESCROW_GET_FEE_BALANCE,
      {},
      MessagePattern.ESCROW_GET_FEE_BALANCE_RESPONSE,
      QueueName.ESCROW_QUEUE,
      correlationId,
    );
    return ResponseUtil.success(data, 'Fee balance retrieved');
  }

  @Post('withdraw')
  @ApiOperation({ summary: 'Withdraw platform fees to authority wallet (admin only)' })
  @ApiHeader({ name: 'admin-token', required: true })
  @ApiBody({ type: WithdrawFeesDto })
  async withdrawFees(
    @Headers('admin-token') adminToken: string | undefined,
    @Body() body: WithdrawFeesDto,
    @Req() request: Request,
  ) {
    this.requireAdminToken(adminToken);
    const correlationId = (request as any).correlationId;
    const data = await this.requestResponseService.request(
      MessagePattern.ESCROW_WITHDRAW_FEES,
      { amount: body.amount },
      MessagePattern.ESCROW_WITHDRAW_FEES_RESPONSE,
      QueueName.ESCROW_QUEUE,
      correlationId,
    );
    return ResponseUtil.success(data, 'Platform fees withdrawn');
  }
}
