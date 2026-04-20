import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  Param,
  Query,
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
  CreateProposalDto,
  UpdateProposalStatusDto,
  AcceptProposalDto,
  FilterProposalDto,
} from './dto/proposal.dto';

@ApiTags('proposals')
@Controller('proposals')
@UseGuards(PrivyGuard)
@ApiBearerAuth('JWT-auth')
export class ProposalsController {
  constructor(
    private readonly requestResponseService: RequestResponseService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Apply for a job',
    description: 'Submit a proposal. Limited to 5 proposals per day per user.',
  })
  async apply(
    @PrivyUser('privyId') applicantId: string,
    @Body() dto: CreateProposalDto,
    @Req() request: Request,
  ) {
    const correlationId = (request as any).correlationId;
    const data = await this.requestResponseService.request(
      MessagePattern.PROPOSAL_CREATE,
      { applicantId, ...dto },
      MessagePattern.PROPOSAL_CREATE_RESPONSE,
      QueueName.PROPOSAL_QUEUE,
      correlationId,
    );
    return ResponseUtil.success(data, 'Proposal submitted successfully');
  }

  @Get('me/stats')
  @ApiOperation({
    summary: 'Get freelancer proposal stats',
    description: 'Returns total proposals by status, daily limit, and how many proposals remain today.',
  })
  async getFreelancerStats(
    @PrivyUser('privyId') applicantId: string,
    @Req() request: Request,
  ) {
    const correlationId = (request as any).correlationId;
    const data = await this.requestResponseService.request(
      MessagePattern.PROPOSAL_GET_FREELANCER_STATS,
      { applicantId },
      MessagePattern.PROPOSAL_GET_FREELANCER_STATS_RESPONSE,
      QueueName.PROPOSAL_QUEUE,
      correlationId,
    );
    return ResponseUtil.success(data, 'Freelancer stats retrieved successfully');
  }

  @Get('me')
  @ApiOperation({ summary: 'Get my proposals with status' })
  async getMyProposals(
    @PrivyUser('privyId') applicantId: string,
    @Query() filter: FilterProposalDto,
    @Req() request: Request,
  ) {
    const correlationId = (request as any).correlationId;
    const data = await this.requestResponseService.request(
      MessagePattern.PROPOSAL_GET_MY,
      { applicantId, ...filter },
      MessagePattern.PROPOSAL_GET_MY_RESPONSE,
      QueueName.PROPOSAL_QUEUE,
      correlationId,
    );
    return ResponseUtil.success(data, 'Proposals retrieved successfully');
  }

  @Get('client')
  @ApiOperation({
    summary: 'Get all proposals received across all my jobs (client view)',
  })
  async getClientProposals(
    @PrivyUser('privyId') clientId: string,
    @Query() filter: FilterProposalDto,
    @Req() request: Request,
  ) {
    const correlationId = (request as any).correlationId;
    const result = await this.requestResponseService.request<any, any>(
      MessagePattern.PROPOSAL_GET_BY_CLIENT,
      { clientId, ...filter },
      MessagePattern.PROPOSAL_GET_BY_CLIENT_RESPONSE,
      QueueName.PROPOSAL_QUEUE,
      correlationId,
    );
    const enriched = await this.enrichProposalsWithProfiles(result, correlationId);
    return ResponseUtil.success(enriched, 'Proposals retrieved successfully');
  }

  @Get('job/:jobId/count')
  @ApiOperation({
    summary: 'Get proposal count for a job',
    description: 'Returns total number of proposals and breakdown by status for a given job.',
  })
  @ApiParam({ name: 'jobId', description: 'Job ID' })
  async countJobProposals(
    @Param('jobId') jobId: string,
    @Req() request: Request,
  ) {
    const correlationId = (request as any).correlationId;
    const data = await this.requestResponseService.request(
      MessagePattern.PROPOSAL_COUNT_BY_JOB,
      { jobId },
      MessagePattern.PROPOSAL_COUNT_BY_JOB_RESPONSE,
      QueueName.PROPOSAL_QUEUE,
      correlationId,
    );
    return ResponseUtil.success(data, 'Proposal count retrieved successfully');
  }

  @Get('job/:jobId')
  @ApiOperation({
    summary: 'Get all proposals for a job (client/job owner)',
  })
  @ApiParam({ name: 'jobId', description: 'Job ID' })
  async getJobProposals(
    @Param('jobId') jobId: string,
    @Query() filter: FilterProposalDto,
    @Req() request: Request,
  ) {
    const correlationId = (request as any).correlationId;
    const result = await this.requestResponseService.request<any, any>(
      MessagePattern.PROPOSAL_GET_BY_JOB,
      { jobId, ...filter },
      MessagePattern.PROPOSAL_GET_BY_JOB_RESPONSE,
      QueueName.PROPOSAL_QUEUE,
      correlationId,
    );
    const enriched = await this.enrichProposalsWithProfiles(result, correlationId);
    return ResponseUtil.success(enriched, 'Proposals retrieved successfully');
  }

  private async enrichProposalsWithProfiles(result: any, correlationId?: string): Promise<any> {
    const proposals: any[] = result?.data ?? [];
    if (!proposals.length) return result;

    const applicantIds: string[] = [...new Set(proposals.map((p: any) => p.applicantId as string))];

    let profileMap: Record<string, any> = {};
    try {
      const profiles = await this.requestResponseService.request<any, any[]>(
        MessagePattern.FREELANCER_PROFILE_GET_BATCH,
        { userIds: applicantIds },
        MessagePattern.FREELANCER_PROFILE_GET_BATCH_RESPONSE,
        QueueName.FREELANCER_PROFILE_QUEUE,
        correlationId,
      );
      profileMap = Object.fromEntries((profiles ?? []).map((p: any) => [p.userId, p]));
    } catch {
      // profiles are optional — don't fail the whole request
    }

    return {
      ...result,
      data: proposals.map((p: any) => ({
        ...p,
        applicantProfile: profileMap[p.applicantId] ?? null,
      })),
    };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get proposal details by ID' })
  @ApiParam({ name: 'id', description: 'Proposal ID' })
  async getProposal(
    @Param('id') proposalId: string,
    @Req() request: Request,
  ) {
    const correlationId = (request as any).correlationId;
    const data = await this.requestResponseService.request(
      MessagePattern.PROPOSAL_GET_ONE,
      { proposalId },
      MessagePattern.PROPOSAL_GET_ONE_RESPONSE,
      QueueName.PROPOSAL_QUEUE,
      correlationId,
    );
    return ResponseUtil.success(data, 'Proposal retrieved successfully');
  }

  @Patch(':id/status')
  @ApiOperation({
    summary: 'Update proposal status',
    description:
      'Client (job poster) can shortlist, hire, or reject a pending/shortlisted proposal. ' +
      'Once hired, only the applicant can call this endpoint — and only to decline (reject) the offer. ' +
      'Rejected proposals are final and cannot be updated by either party.',
  })
  @ApiParam({ name: 'id', description: 'Proposal ID' })
  async updateStatus(
    @Param('id') proposalId: string,
    @PrivyUser('privyId') callerId: string,
    @Body() dto: UpdateProposalStatusDto,
    @Req() request: Request,
  ) {
    const correlationId = (request as any).correlationId;
    const data = await this.requestResponseService.request(
      MessagePattern.PROPOSAL_UPDATE_STATUS,
      { proposalId, callerId, status: dto.status, clientWallet: dto.clientWallet, clientSignature: dto.clientSignature },
      MessagePattern.PROPOSAL_UPDATE_STATUS_RESPONSE,
      QueueName.PROPOSAL_QUEUE,
      correlationId,
    );
    return ResponseUtil.success(data, `Proposal ${dto.status}`);
  }

  @Post(':id/accept')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Accept a hire offer (freelancer only)',
    description:
      'After a client sets status to "hired", the freelancer calls this endpoint with their wallet signature to finalize the hire. ' +
      'This triggers contract PDF generation, IPFS upload, on-chain contract creation, and escrow locking.',
  })
  @ApiParam({ name: 'id', description: 'Proposal ID' })
  async acceptProposal(
    @Param('id') proposalId: string,
    @PrivyUser('privyId') applicantId: string,
    @Body() dto: AcceptProposalDto,
    @Req() request: Request,
  ) {
    const correlationId = (request as any).correlationId;
    const data = await this.requestResponseService.request(
      MessagePattern.PROPOSAL_ACCEPT,
      { proposalId, applicantId, freelancerWallet: dto.freelancerWallet, freelancerSignature: dto.freelancerSignature },
      MessagePattern.PROPOSAL_ACCEPT_RESPONSE,
      QueueName.PROPOSAL_QUEUE,
      correlationId,
    );
    return ResponseUtil.success(data, 'Proposal accepted — contract creation in progress');
  }
}
