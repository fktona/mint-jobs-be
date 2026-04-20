import {
  Controller,
  Get,
  Param,
  Req,
  UseGuards,
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

@ApiTags('contracts')
@Controller('contracts')
@UseGuards(PrivyGuard)
@ApiBearerAuth('JWT-auth')
export class ContractsController {
  constructor(
    private readonly requestResponseService: RequestResponseService,
  ) {}

  @Get('my')
  @ApiOperation({
    summary: 'Get my contracts (freelancer)',
    description: 'Returns all contracts for the authenticated freelancer, each including full job details.',
  })
  async getMyContracts(
    @PrivyUser('privyId') applicantId: string,
    @Req() request: Request,
  ) {
    const correlationId = (request as any).correlationId;
    const data = await this.requestResponseService.request(
      MessagePattern.CONTRACT_GET_MY,
      { applicantId },
      MessagePattern.CONTRACT_GET_MY_RESPONSE,
      QueueName.CONTRACT_QUEUE,
      correlationId,
    );
    return ResponseUtil.success(data, 'Contracts retrieved successfully');
  }

  @Get('proposal/:proposalId')
  @ApiOperation({
    summary: 'Get contract by proposal ID',
    description: 'Returns the contract generated when the proposal was hired. Status may be generating, generated, or failed.',
  })
  @ApiParam({ name: 'proposalId', description: 'Proposal ID' })
  async getByProposalId(
    @Param('proposalId') proposalId: string,
    @Req() request: Request,
  ) {
    const correlationId = (request as any).correlationId;
    const data = await this.requestResponseService.request(
      MessagePattern.CONTRACT_GET_BY_PROPOSAL,
      { proposalId },
      MessagePattern.CONTRACT_GET_BY_PROPOSAL_RESPONSE,
      QueueName.CONTRACT_QUEUE,
      correlationId,
    );
    return ResponseUtil.success(data, 'Contract retrieved successfully');
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get contract by contract ID' })
  @ApiParam({ name: 'id', description: 'Contract ID' })
  async getById(
    @Param('id') contractId: string,
    @Req() request: Request,
  ) {
    const correlationId = (request as any).correlationId;
    const data = await this.requestResponseService.request(
      MessagePattern.CONTRACT_GET_ONE,
      { contractId },
      MessagePattern.CONTRACT_GET_ONE_RESPONSE,
      QueueName.CONTRACT_QUEUE,
      correlationId,
    );
    return ResponseUtil.success(data, 'Contract retrieved successfully');
  }
}
