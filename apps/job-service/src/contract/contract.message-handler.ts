import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConsumerService, RequestResponseService } from '@mintjobs/messaging';
import { MessagePattern, QueueName } from '@mintjobs/constants';
import { ContractService } from './contract.service';

@Injectable()
export class ContractMessageHandler implements OnModuleInit {
  private readonly logger = new Logger(ContractMessageHandler.name);

  constructor(
    private readonly consumerService: ConsumerService,
    private readonly requestResponseService: RequestResponseService,
    private readonly contractService: ContractService,
  ) {}

  async onModuleInit() {
    await this.consumerService.subscribe(QueueName.CONTRACT_QUEUE, [
      MessagePattern.PROPOSAL_HIRED,
      MessagePattern.CONTRACT_GET_BY_PROPOSAL,
      MessagePattern.CONTRACT_GET_ONE,
      MessagePattern.CONTRACT_GET_MY,
      MessagePattern.ONCHAIN_CONTRACT_CREATE_RESULT,
      MessagePattern.ONCHAIN_CONTRACT_COMPLETE_RESULT,
    ]);

    // Also subscribe to JOB_COMPLETED (fan-out — escrow-service publishes it)
    await this.consumerService.subscribe(QueueName.CONTRACT_QUEUE, [
      MessagePattern.JOB_COMPLETED,
    ]);

    this.consumerService.registerHandler(
      MessagePattern.PROPOSAL_HIRED,
      this.handleProposalHired.bind(this),
    );
    this.consumerService.registerHandler(
      MessagePattern.CONTRACT_GET_BY_PROPOSAL,
      this.handleGetByProposal.bind(this),
    );
    this.consumerService.registerHandler(
      MessagePattern.CONTRACT_GET_ONE,
      this.handleGetOne.bind(this),
    );
    this.consumerService.registerHandler(
      MessagePattern.CONTRACT_GET_MY,
      this.handleGetMy.bind(this),
    );
    this.consumerService.registerHandler(
      MessagePattern.JOB_COMPLETED,
      this.handleJobCompleted.bind(this),
    );
    this.consumerService.registerHandler(
      MessagePattern.ONCHAIN_CONTRACT_CREATE_RESULT,
      this.handleOnChainCreateResult.bind(this),
    );
    this.consumerService.registerHandler(
      MessagePattern.ONCHAIN_CONTRACT_COMPLETE_RESULT,
      this.handleOnChainCompleteResult.bind(this),
    );

    this.logger.log('Contract message handlers registered');
  }

  private async handleProposalHired(event: any): Promise<void> {
    const proposalId = event.data?.proposalId;
    this.logger.log(`Processing PROPOSAL_HIRED for proposal: ${proposalId}`);
    try {
      await this.contractService.createAndGenerate(event.data);
      this.logger.log(`Contract generation complete for proposal: ${proposalId}`);
    } catch (error) {
      this.logger.error(
        `Unhandled error in handleProposalHired for proposal ${proposalId}`,
        error,
      );
      // Rethrow so ConsumerService nacks → dead-letter (no infinite requeue)
      throw error;
    }
  }

  private async handleGetByProposal(event: any): Promise<void> {
    try {
      const { proposalId } = event.data as { proposalId: string };
      const contract = await this.contractService.findByProposalId(proposalId);
      await this.requestResponseService.respond(
        event.requestId,
        MessagePattern.CONTRACT_GET_BY_PROPOSAL_RESPONSE,
        contract,
        true,
      );
    } catch (error) {
      this.logger.error('Error handling get contract by proposal', error);
      await this.requestResponseService.respond(
        event.requestId,
        MessagePattern.CONTRACT_GET_BY_PROPOSAL_RESPONSE,
        null,
        false,
        { message: error.message || 'Contract not found', statusCode: error.status || 404 },
      );
    }
  }

  private async handleGetOne(event: any): Promise<void> {
    try {
      const { contractId } = event.data as { contractId: string };
      const contract = await this.contractService.findById(contractId);
      await this.requestResponseService.respond(
        event.requestId,
        MessagePattern.CONTRACT_GET_ONE_RESPONSE,
        contract,
        true,
      );
    } catch (error) {
      this.logger.error('Error handling get contract', error);
      await this.requestResponseService.respond(
        event.requestId,
        MessagePattern.CONTRACT_GET_ONE_RESPONSE,
        null,
        false,
        { message: error.message || 'Contract not found', statusCode: error.status || 404 },
      );
    }
  }

  private async handleJobCompleted(event: any): Promise<void> {
    const { jobId, amountLamports } = event.data ?? {};
    if (!jobId) {
      this.logger.warn('JOB_COMPLETED missing jobId', event.data);
      return;
    }
    this.logger.log(`JOB_COMPLETED received — generating completion certificate for job ${jobId}`);
    try {
      await this.contractService.completeByJobId(jobId, amountLamports ?? null);
    } catch (err) {
      this.logger.error(`Failed to complete contract for job ${jobId}`, err);
      throw err; // nack → dead-letter
    }
  }

  private async handleGetMy(event: any): Promise<void> {
    try {
      const { applicantId } = event.data as { applicantId: string };
      const contracts = await this.contractService.findByApplicantId(applicantId);
      await this.requestResponseService.respond(
        event.requestId,
        MessagePattern.CONTRACT_GET_MY_RESPONSE,
        contracts,
        true,
      );
    } catch (error) {
      this.logger.error('Error handling get my contracts', error);
      await this.requestResponseService.respond(
        event.requestId,
        MessagePattern.CONTRACT_GET_MY_RESPONSE,
        null,
        false,
        { message: error.message || 'Failed to get contracts', statusCode: error.status || 500 },
      );
    }
  }

  private async handleOnChainCreateResult(event: any): Promise<void> {
    const { contractId, success, txSignature, contractPda, error } = event.data ?? {};
    if (!contractId) return;
    if (!success) {
      this.logger.warn(`On-chain contract creation failed for ${contractId}: ${error}`);
      return;
    }
    try {
      await this.contractService.applyOnChainCreateResult(contractId, txSignature, contractPda);
    } catch (err) {
      this.logger.error(`Failed to apply on-chain create result for ${contractId}`, err);
    }
  }

  private async handleOnChainCompleteResult(event: any): Promise<void> {
    const { contractId, success, txSignature, error } = event.data ?? {};
    if (!contractId) return;
    if (!success) {
      this.logger.warn(`On-chain contract completion failed for ${contractId}: ${error}`);
      return;
    }
    try {
      await this.contractService.applyOnChainCompleteResult(contractId, txSignature);
    } catch (err) {
      this.logger.error(`Failed to apply on-chain complete result for ${contractId}`, err);
    }
  }
}
