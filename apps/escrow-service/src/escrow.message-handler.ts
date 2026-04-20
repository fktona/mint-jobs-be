import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConsumerService, RequestResponseService } from '@mintjobs/messaging';
import { MessagePattern, QueueName } from '@mintjobs/constants';
import { PrivyService } from '@mintjobs/privy';
import { EscrowService } from './escrow.service';

@Injectable()
export class EscrowMessageHandler implements OnModuleInit {
  private readonly logger = new Logger(EscrowMessageHandler.name);

  constructor(
    private readonly consumerService: ConsumerService,
    private readonly requestResponseService: RequestResponseService,
    private readonly escrowService: EscrowService,
    private readonly privyService: PrivyService,
  ) {}

  async onModuleInit() {
    // Subscribe to ESCROW_QUEUE for RPC patterns
    await this.consumerService.subscribe(QueueName.ESCROW_QUEUE, [
      MessagePattern.ESCROW_FUND,
      MessagePattern.ESCROW_TOPUP,
      MessagePattern.ESCROW_WITHDRAW,
      MessagePattern.ESCROW_RELEASE,
      MessagePattern.ESCROW_REFUND,
      MessagePattern.ESCROW_GET,
      MessagePattern.ESCROW_CONFIRM,
      MessagePattern.MILESTONE_CREATE,
      MessagePattern.MILESTONE_GET_BY_JOB,
      MessagePattern.MILESTONE_GET_ONE,
      MessagePattern.ESCROW_MILESTONE_FUND,
      MessagePattern.ESCROW_MILESTONE_WITHDRAW,
      MessagePattern.ESCROW_MILESTONE_RELEASE,
      MessagePattern.ESCROW_MILESTONE_REFUND,
      MessagePattern.ESCROW_MILESTONE_CONFIRM,
      MessagePattern.ESCROW_MILESTONE_TOPUP,
      MessagePattern.ESCROW_WITHDRAW_FEES,
      MessagePattern.ESCROW_GET_FEE_BALANCE,
      MessagePattern.ONCHAIN_CONTRACT_CREATE,
      MessagePattern.ONCHAIN_CONTRACT_COMPLETE,
      MessagePattern.ONCHAIN_CONTRACT_GET,
    ]);

    // Also subscribe to PROPOSAL_HIRED from the exchange (fan-out copy)
    // This uses a separate binding on the ESCROW_QUEUE
    await this.consumerService.subscribe(QueueName.ESCROW_QUEUE, [
      MessagePattern.PROPOSAL_HIRED,
    ]);

    this.consumerService.registerHandler(MessagePattern.PROPOSAL_HIRED, this.handleProposalHired.bind(this));
    this.consumerService.registerHandler(MessagePattern.ESCROW_FUND, this.handleFund.bind(this));
    this.consumerService.registerHandler(MessagePattern.ESCROW_TOPUP, this.handleTopUp.bind(this));
    this.consumerService.registerHandler(MessagePattern.ESCROW_WITHDRAW, this.handleWithdraw.bind(this));
    this.consumerService.registerHandler(MessagePattern.ESCROW_RELEASE, this.handleRelease.bind(this));
    this.consumerService.registerHandler(MessagePattern.ESCROW_REFUND, this.handleRefund.bind(this));
    this.consumerService.registerHandler(MessagePattern.ESCROW_GET, this.handleGet.bind(this));
    this.consumerService.registerHandler(MessagePattern.ESCROW_CONFIRM, this.handleConfirm.bind(this));
    this.consumerService.registerHandler(MessagePattern.MILESTONE_CREATE, this.handleMilestoneCreate.bind(this));
    this.consumerService.registerHandler(MessagePattern.MILESTONE_GET_BY_JOB, this.handleMilestoneGetByJob.bind(this));
    this.consumerService.registerHandler(MessagePattern.MILESTONE_GET_ONE, this.handleMilestoneGetOne.bind(this));
    this.consumerService.registerHandler(MessagePattern.ESCROW_MILESTONE_FUND, this.handleMilestoneFund.bind(this));
    this.consumerService.registerHandler(MessagePattern.ESCROW_MILESTONE_WITHDRAW, this.handleMilestoneWithdraw.bind(this));
    this.consumerService.registerHandler(MessagePattern.ESCROW_MILESTONE_RELEASE, this.handleMilestoneRelease.bind(this));
    this.consumerService.registerHandler(MessagePattern.ESCROW_MILESTONE_REFUND, this.handleMilestoneRefund.bind(this));
    this.consumerService.registerHandler(MessagePattern.ESCROW_MILESTONE_CONFIRM, this.handleMilestoneConfirm.bind(this));
    this.consumerService.registerHandler(MessagePattern.ESCROW_MILESTONE_TOPUP, this.handleMilestoneTopUp.bind(this));
    this.consumerService.registerHandler(MessagePattern.ESCROW_WITHDRAW_FEES, this.handleWithdrawFees.bind(this));
    this.consumerService.registerHandler(MessagePattern.ESCROW_GET_FEE_BALANCE, this.handleGetFeeBalance.bind(this));
    this.consumerService.registerHandler(MessagePattern.ONCHAIN_CONTRACT_CREATE, this.handleCreateOnChainContract.bind(this));
    this.consumerService.registerHandler(MessagePattern.ONCHAIN_CONTRACT_COMPLETE, this.handleCompleteOnChainContract.bind(this));
    this.consumerService.registerHandler(MessagePattern.ONCHAIN_CONTRACT_GET, this.handleGetOnChainContract.bind(this));

    this.logger.log('Escrow message handlers registered');
  }

  /** Fire-and-forget: lock job escrow + all funded milestones when freelancer is hired */
  private async handleProposalHired(event: any): Promise<void> {
    const { applicantId, jobId } = event.data ?? {};
    if (!applicantId || !jobId) {
      this.logger.warn('PROPOSAL_HIRED missing applicantId or jobId', event.data);
      return;
    }
    this.logger.log(`PROPOSAL_HIRED received — locking escrow for job ${jobId}`);
    try {
      const wallets = await this.privyService.getUserWallets(applicantId);
      const solanaWallet = wallets.find((w) => w.chainType === 'solana');
      if (!solanaWallet) {
        this.logger.warn(`No Solana wallet found for freelancer ${applicantId} — skipping lock`);
        return;
      }

      // Lock job-level escrow (if the client used flat-payment mode)
      await this.escrowService.lockFunds(jobId, solanaWallet.address, applicantId);

      // Lock all funded milestones for this job (Option B: fund-as-you-go)
      const fundedMilestones = await this.escrowService.getFundedMilestonesByJob(jobId);
      for (const milestone of fundedMilestones) {
        try {
          await this.escrowService.lockMilestone(milestone.id, solanaWallet.address, applicantId);
        } catch (err) {
          this.logger.error(`Failed to lock milestone ${milestone.id} for job ${jobId}`, err);
          // Non-fatal: log and continue with remaining milestones
        }
      }
    } catch (err) {
      this.logger.error(`Failed to lock escrow for job ${jobId}`, err);
      throw err; // nack → dead-letter (no infinite requeue)
    }
  }

  private async handleFund(event: any): Promise<void> {
    try {
      const { jobId, clientId, clientWallet, amountLamports, signingMode, walletId, userJwt } = event.data as any;
      const result = await this.escrowService.fundJob(
        jobId,
        clientId,
        clientWallet,
        BigInt(amountLamports),
        signingMode ?? 'server',
        walletId,
        userJwt,
      );
      await this.requestResponseService.respond(
        event.requestId,
        MessagePattern.ESCROW_FUND_RESPONSE,
        result,
        true,
      );
    } catch (err) {
      this.logger.error('Error handling ESCROW_FUND', err);
      await this.requestResponseService.respond(
        event.requestId,
        MessagePattern.ESCROW_FUND_RESPONSE,
        null,
        false,
        { message: err.message || 'Failed to fund escrow', statusCode: err.status || 500 },
      );
    }
  }

  private async handleTopUp(event: any): Promise<void> {
    try {
      const { jobId, clientWallet, additionalLamports, signingMode, walletId, userJwt } = event.data as any;
      const result = await this.escrowService.topUpJob(
        jobId,
        clientWallet,
        BigInt(additionalLamports),
        signingMode ?? 'server',
        walletId,
        userJwt,
      );
      await this.requestResponseService.respond(
        event.requestId,
        MessagePattern.ESCROW_TOPUP_RESPONSE,
        result,
        true,
      );
    } catch (err) {
      this.logger.error('Error handling ESCROW_TOPUP', err);
      await this.requestResponseService.respond(
        event.requestId,
        MessagePattern.ESCROW_TOPUP_RESPONSE,
        null,
        false,
        { message: err.message || 'Failed to top up escrow', statusCode: err.status || 500 },
      );
    }
  }

  private async handleWithdraw(event: any): Promise<void> {
    try {
      const { jobId, clientWallet, signingMode, walletId, userJwt } = event.data as any;
      const result = await this.escrowService.withdrawJob(jobId, clientWallet, signingMode ?? 'server', walletId, userJwt);
      await this.requestResponseService.respond(
        event.requestId,
        MessagePattern.ESCROW_WITHDRAW_RESPONSE,
        result,
        true,
      );
    } catch (err) {
      this.logger.error('Error handling ESCROW_WITHDRAW', err);
      await this.requestResponseService.respond(
        event.requestId,
        MessagePattern.ESCROW_WITHDRAW_RESPONSE,
        null,
        false,
        { message: err.message || 'Failed to withdraw escrow', statusCode: err.status || 500 },
      );
    }
  }

  private async handleRelease(event: any): Promise<void> {
    try {
      const { jobId, callerWallet, signingMode, walletId, userJwt } = event.data as any;
      const result = await this.escrowService.releaseJob(jobId, callerWallet, signingMode ?? 'server', walletId, userJwt);
      await this.requestResponseService.respond(
        event.requestId,
        MessagePattern.ESCROW_RELEASE_RESPONSE,
        result,
        true,
      );
    } catch (err) {
      this.logger.error('Error handling ESCROW_RELEASE', err);
      await this.requestResponseService.respond(
        event.requestId,
        MessagePattern.ESCROW_RELEASE_RESPONSE,
        null,
        false,
        { message: err.message || 'Failed to release escrow', statusCode: err.status || 500 },
      );
    }
  }

  private async handleRefund(event: any): Promise<void> {
    try {
      const { jobId } = event.data as any;
      const result = await this.escrowService.refundFunds(jobId);
      await this.requestResponseService.respond(
        event.requestId,
        MessagePattern.ESCROW_REFUND_RESPONSE,
        result,
        true,
      );
    } catch (err) {
      this.logger.error('Error handling ESCROW_REFUND', err);
      await this.requestResponseService.respond(
        event.requestId,
        MessagePattern.ESCROW_REFUND_RESPONSE,
        null,
        false,
        { message: err.message || 'Failed to refund escrow', statusCode: err.status || 500 },
      );
    }
  }

  private async handleGet(event: any): Promise<void> {
    try {
      const { jobId } = event.data as any;
      const result = await this.escrowService.getEscrow(jobId);
      await this.requestResponseService.respond(
        event.requestId,
        MessagePattern.ESCROW_GET_RESPONSE,
        result,
        true,
      );
    } catch (err) {
      this.logger.error('Error handling ESCROW_GET', err);
      await this.requestResponseService.respond(
        event.requestId,
        MessagePattern.ESCROW_GET_RESPONSE,
        null,
        false,
        { message: err.message || 'Failed to get escrow', statusCode: err.status || 500 },
      );
    }
  }

  private async handleConfirm(event: any): Promise<void> {
    try {
      const { jobId, clientId, clientWallet, txSignature, signedTransaction } = event.data as any;
      const options = signedTransaction ? { signedTransaction } : { txSignature };
      const result = await this.escrowService.confirmClientTransaction(jobId, clientId, clientWallet, options);
      await this.requestResponseService.respond(
        event.requestId,
        MessagePattern.ESCROW_CONFIRM_RESPONSE,
        result,
        true,
      );
    } catch (err) {
      this.logger.error('Error handling ESCROW_CONFIRM', err);
      await this.requestResponseService.respond(
        event.requestId,
        MessagePattern.ESCROW_CONFIRM_RESPONSE,
        null,
        false,
        { message: err.message || 'Failed to confirm escrow transaction', statusCode: err.status || 500 },
      );
    }
  }

  // ─── Milestone handlers ──────────────────────────────────────────────────

  private async handleMilestoneCreate(event: any): Promise<void> {
    try {
      const { jobId, milestones } = event.data as any;
      const result = await this.escrowService.createMilestones(jobId, milestones);
      await this.requestResponseService.respond(event.requestId, MessagePattern.MILESTONE_CREATE_RESPONSE, result, true);
    } catch (err) {
      this.logger.error('Error handling MILESTONE_CREATE', err);
      await this.requestResponseService.respond(event.requestId, MessagePattern.MILESTONE_CREATE_RESPONSE, null, false,
        { message: err.message || 'Failed to create milestones', statusCode: err.status || 500 });
    }
  }

  private async handleMilestoneGetByJob(event: any): Promise<void> {
    try {
      const { jobId } = event.data as any;
      const result = await this.escrowService.getMilestonesByJob(jobId);
      await this.requestResponseService.respond(event.requestId, MessagePattern.MILESTONE_GET_BY_JOB_RESPONSE, result, true);
    } catch (err) {
      this.logger.error('Error handling MILESTONE_GET_BY_JOB', err);
      await this.requestResponseService.respond(event.requestId, MessagePattern.MILESTONE_GET_BY_JOB_RESPONSE, null, false,
        { message: err.message || 'Failed to get milestones', statusCode: err.status || 500 });
    }
  }

  private async handleMilestoneGetOne(event: any): Promise<void> {
    try {
      const { milestoneId } = event.data as any;
      const result = await this.escrowService.getMilestone(milestoneId);
      await this.requestResponseService.respond(event.requestId, MessagePattern.MILESTONE_GET_ONE_RESPONSE, result, true);
    } catch (err) {
      this.logger.error('Error handling MILESTONE_GET_ONE', err);
      await this.requestResponseService.respond(event.requestId, MessagePattern.MILESTONE_GET_ONE_RESPONSE, null, false,
        { message: err.message || 'Failed to get milestone', statusCode: err.status || 500 });
    }
  }

  private async handleMilestoneFund(event: any): Promise<void> {
    try {
      const { milestoneId, clientId, clientWallet, signingMode, walletId, userJwt } = event.data as any;
      const result = await this.escrowService.fundMilestone(milestoneId, clientId, clientWallet, signingMode ?? 'server', walletId, userJwt);
      await this.requestResponseService.respond(event.requestId, MessagePattern.ESCROW_MILESTONE_FUND_RESPONSE, result, true);
    } catch (err) {
      this.logger.error('Error handling ESCROW_MILESTONE_FUND', err);
      await this.requestResponseService.respond(event.requestId, MessagePattern.ESCROW_MILESTONE_FUND_RESPONSE, null, false,
        { message: err.message || 'Failed to fund milestone', statusCode: err.status || 500 });
    }
  }

  private async handleMilestoneWithdraw(event: any): Promise<void> {
    try {
      const { milestoneId, clientWallet, signingMode, walletId, userJwt } = event.data as any;
      const result = await this.escrowService.withdrawMilestone(milestoneId, clientWallet, signingMode ?? 'server', walletId, userJwt);
      await this.requestResponseService.respond(event.requestId, MessagePattern.ESCROW_MILESTONE_WITHDRAW_RESPONSE, result, true);
    } catch (err) {
      this.logger.error('Error handling ESCROW_MILESTONE_WITHDRAW', err);
      await this.requestResponseService.respond(event.requestId, MessagePattern.ESCROW_MILESTONE_WITHDRAW_RESPONSE, null, false,
        { message: err.message || 'Failed to withdraw milestone', statusCode: err.status || 500 });
    }
  }

  private async handleMilestoneRelease(event: any): Promise<void> {
    try {
      const { milestoneId, callerWallet, signingMode, walletId, userJwt } = event.data as any;
      const result = await this.escrowService.releaseMilestone(milestoneId, callerWallet, signingMode ?? 'server', walletId, userJwt);
      await this.requestResponseService.respond(event.requestId, MessagePattern.ESCROW_MILESTONE_RELEASE_RESPONSE, result, true);
    } catch (err) {
      this.logger.error('Error handling ESCROW_MILESTONE_RELEASE', err);
      await this.requestResponseService.respond(event.requestId, MessagePattern.ESCROW_MILESTONE_RELEASE_RESPONSE, null, false,
        { message: err.message || 'Failed to release milestone', statusCode: err.status || 500 });
    }
  }

  private async handleMilestoneRefund(event: any): Promise<void> {
    try {
      const { milestoneId } = event.data as any;
      const result = await this.escrowService.refundMilestone(milestoneId);
      await this.requestResponseService.respond(event.requestId, MessagePattern.ESCROW_MILESTONE_REFUND_RESPONSE, result, true);
    } catch (err) {
      this.logger.error('Error handling ESCROW_MILESTONE_REFUND', err);
      await this.requestResponseService.respond(event.requestId, MessagePattern.ESCROW_MILESTONE_REFUND_RESPONSE, null, false,
        { message: err.message || 'Failed to refund milestone', statusCode: err.status || 500 });
    }
  }

  private async handleMilestoneConfirm(event: any): Promise<void> {
    try {
      const { milestoneId, clientId, clientWallet, txSignature, signedTransaction } = event.data as any;
      const options = signedTransaction ? { signedTransaction } : { txSignature };
      const result = await this.escrowService.confirmMilestoneTransaction(milestoneId, clientId, clientWallet, options);
      await this.requestResponseService.respond(event.requestId, MessagePattern.ESCROW_MILESTONE_CONFIRM_RESPONSE, result, true);
    } catch (err) {
      this.logger.error('Error handling ESCROW_MILESTONE_CONFIRM', err);
      await this.requestResponseService.respond(event.requestId, MessagePattern.ESCROW_MILESTONE_CONFIRM_RESPONSE, null, false,
        { message: err.message || 'Failed to confirm milestone transaction', statusCode: err.status || 500 });
    }
  }

  private async handleMilestoneTopUp(event: any): Promise<void> {
    try {
      const { milestoneId, clientWallet, additionalLamports, signingMode, walletId, userJwt } = event.data as any;
      const result = await this.escrowService.topUpMilestone(milestoneId, clientWallet, BigInt(additionalLamports), signingMode ?? 'server', walletId, userJwt);
      await this.requestResponseService.respond(event.requestId, MessagePattern.ESCROW_MILESTONE_TOPUP_RESPONSE, result, true);
    } catch (err) {
      this.logger.error('Error handling ESCROW_MILESTONE_TOPUP', err);
      await this.requestResponseService.respond(event.requestId, MessagePattern.ESCROW_MILESTONE_TOPUP_RESPONSE, null, false,
        { message: err.message || 'Failed to top up milestone', statusCode: err.status || 500 });
    }
  }

  // ─── Platform fee handlers ────────────────────────────────────────────────

  private async handleWithdrawFees(event: any): Promise<void> {
    try {
      const { amount } = event.data as any;
      const result = await this.escrowService.withdrawPlatformFees(BigInt(amount));
      await this.requestResponseService.respond(event.requestId, MessagePattern.ESCROW_WITHDRAW_FEES_RESPONSE, result, true);
    } catch (err) {
      this.logger.error('Error handling ESCROW_WITHDRAW_FEES', err);
      await this.requestResponseService.respond(event.requestId, MessagePattern.ESCROW_WITHDRAW_FEES_RESPONSE, null, false,
        { message: err.message || 'Failed to withdraw platform fees', statusCode: err.status || 500 });
    }
  }

  private async handleGetOnChainContract(event: any): Promise<void> {
    try {
      const { jobId } = event.data as any;
      const result = await this.escrowService.getOnChainContract(jobId);
      await this.requestResponseService.respond(event.requestId, MessagePattern.ONCHAIN_CONTRACT_GET_RESPONSE, result, true);
    } catch (err) {
      this.logger.error('Error reading on-chain contract', err);
      await this.requestResponseService.respond(event.requestId, MessagePattern.ONCHAIN_CONTRACT_GET_RESPONSE, null, false,
        { message: err.message || 'Failed to read on-chain contract', statusCode: err.status || 500 });
    }
  }

  private async handleCompleteOnChainContract(event: any): Promise<void> {
    try {
      const { jobId, completionUri, completionPdfHash } = event.data as any;
      const result = await this.escrowService.completeOnChainContract(jobId, completionUri, completionPdfHash);
      await this.requestResponseService.respond(event.requestId, MessagePattern.ONCHAIN_CONTRACT_COMPLETE_RESPONSE, result, true);
    } catch (err) {
      this.logger.error('Error completing on-chain contract', err);
      await this.requestResponseService.respond(event.requestId, MessagePattern.ONCHAIN_CONTRACT_COMPLETE_RESPONSE, null, false,
        { message: err.message || 'Failed to complete on-chain contract', statusCode: err.status || 500 });
    }
  }

  private async handleCreateOnChainContract(event: any): Promise<void> {
    try {
      const { jobId, clientWallet, freelancerWallet, metadataUri, pdfHash } = event.data as any;
      const result = await this.escrowService.createOnChainContract(jobId, clientWallet, freelancerWallet, metadataUri, pdfHash);
      await this.requestResponseService.respond(event.requestId, MessagePattern.ONCHAIN_CONTRACT_CREATE_RESPONSE, result, true);
    } catch (err) {
      this.logger.error('Error creating on-chain contract', err);
      await this.requestResponseService.respond(event.requestId, MessagePattern.ONCHAIN_CONTRACT_CREATE_RESPONSE, null, false,
        { message: err.message || 'Failed to create on-chain contract', statusCode: err.status || 500 });
    }
  }

  private async handleGetFeeBalance(event: any): Promise<void> {
    try {
      const result = await this.escrowService.getPlatformFeeBalance();
      await this.requestResponseService.respond(event.requestId, MessagePattern.ESCROW_GET_FEE_BALANCE_RESPONSE, result, true);
    } catch (err) {
      this.logger.error('Error handling ESCROW_GET_FEE_BALANCE', err);
      await this.requestResponseService.respond(event.requestId, MessagePattern.ESCROW_GET_FEE_BALANCE_RESPONSE, null, false,
        { message: err.message || 'Failed to get fee balance', statusCode: err.status || 500 });
    }
  }
}
