import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConsumerService, RequestResponseService, PublisherService } from '@mintjobs/messaging';
import { MessagePattern, QueueName } from '@mintjobs/constants';
import { ProposalService } from './proposal.service';
import { ProposalStatus } from './entities/proposal.entity';

@Injectable()
export class ProposalMessageHandler implements OnModuleInit {
  private readonly logger = new Logger(ProposalMessageHandler.name);

  constructor(
    private readonly consumerService: ConsumerService,
    private readonly requestResponseService: RequestResponseService,
    private readonly proposalService: ProposalService,
    private readonly publisherService: PublisherService,
  ) {}

  async onModuleInit() {
    await this.consumerService.subscribe(QueueName.PROPOSAL_QUEUE, [
      MessagePattern.PROPOSAL_CREATE,
      MessagePattern.PROPOSAL_GET_MY,
      MessagePattern.PROPOSAL_GET_BY_JOB,
      MessagePattern.PROPOSAL_GET_ONE,
      MessagePattern.PROPOSAL_GET_BY_CLIENT,
      MessagePattern.PROPOSAL_UPDATE_STATUS,
      MessagePattern.PROPOSAL_ACCEPT,
      MessagePattern.PROPOSAL_GET_FREELANCER_STATS,
      MessagePattern.PROPOSAL_COUNT_BY_JOB,
    ]);

    this.consumerService.registerHandler(
      MessagePattern.PROPOSAL_CREATE,
      this.handleCreate.bind(this),
    );
    this.consumerService.registerHandler(
      MessagePattern.PROPOSAL_GET_MY,
      this.handleGetMy.bind(this),
    );
    this.consumerService.registerHandler(
      MessagePattern.PROPOSAL_GET_BY_JOB,
      this.handleGetByJob.bind(this),
    );
    this.consumerService.registerHandler(
      MessagePattern.PROPOSAL_GET_ONE,
      this.handleGetOne.bind(this),
    );

    this.consumerService.registerHandler(
      MessagePattern.PROPOSAL_GET_BY_CLIENT,
      this.handleGetByClient.bind(this),
    );

    this.consumerService.registerHandler(
      MessagePattern.PROPOSAL_UPDATE_STATUS,
      this.handleUpdateStatus.bind(this),
    );

    this.consumerService.registerHandler(
      MessagePattern.PROPOSAL_ACCEPT,
      this.handleAcceptProposal.bind(this),
    );

    this.consumerService.registerHandler(
      MessagePattern.PROPOSAL_GET_FREELANCER_STATS,
      this.handleGetFreelancerStats.bind(this),
    );

    this.consumerService.registerHandler(
      MessagePattern.PROPOSAL_COUNT_BY_JOB,
      this.handleCountByJob.bind(this),
    );

    this.logger.log('Proposal message handlers registered');
  }

  private async handleCreate(event: any) {
    try {
      const { applicantId, ...dto } = event.data as any;
      const result = await this.proposalService.create(applicantId, dto);
      await this.requestResponseService.respond(
        event.requestId,
        MessagePattern.PROPOSAL_CREATE_RESPONSE,
        result,
        true,
      );

      // Notify the client that a new proposal was received
      const proposal = result.proposal ?? result;
      const clientId = proposal?.job?.userId ?? null;
      if (clientId) {
        void this.publisherService.publish(MessagePattern.NOTIFICATION_SEND, {
          recipientId: clientId,
          type: 'proposal.received',
          title: 'New application received',
          body: `Someone applied to your job${proposal?.job?.title ? ` "${proposal.job.title}"` : ''}.`,
          metadata: { jobId: proposal?.jobId, applicantId },
        });
      }
    } catch (error) {
      this.logger.error('Error handling proposal create', error);
      await this.requestResponseService.respond(
        event.requestId,
        MessagePattern.PROPOSAL_CREATE_RESPONSE,
        null,
        false,
        { message: error.message || 'Failed to create proposal', statusCode: error.status || 500 },
      );
    }
  }

  private async handleGetMy(event: any) {
    try {
      const { applicantId, ...filter } = event.data as any;
      const result = await this.proposalService.findMyProposals(applicantId, filter);
      await this.requestResponseService.respond(
        event.requestId,
        MessagePattern.PROPOSAL_GET_MY_RESPONSE,
        result,
        true,
      );
    } catch (error) {
      this.logger.error('Error handling get my proposals', error);
      await this.requestResponseService.respond(
        event.requestId,
        MessagePattern.PROPOSAL_GET_MY_RESPONSE,
        null,
        false,
        { message: error.message || 'Failed to get proposals', statusCode: error.status || 500 },
      );
    }
  }

  private async handleGetByJob(event: any) {
    try {
      const { jobId, callerId, ...filter } = event.data as any;
      const result = await this.proposalService.findByJob(jobId, callerId, filter);
      await this.requestResponseService.respond(
        event.requestId,
        MessagePattern.PROPOSAL_GET_BY_JOB_RESPONSE,
        result,
        true,
      );
    } catch (error) {
      this.logger.error('Error handling get proposals by job', error);
      await this.requestResponseService.respond(
        event.requestId,
        MessagePattern.PROPOSAL_GET_BY_JOB_RESPONSE,
        null,
        false,
        { message: error.message || 'Failed to get proposals', statusCode: error.status || 500 },
      );
    }
  }

  private async handleGetByClient(event: any) {
    try {
      const { clientId, ...filter } = event.data as any;
      const result = await this.proposalService.findByClient(clientId, filter);
      await this.requestResponseService.respond(
        event.requestId,
        MessagePattern.PROPOSAL_GET_BY_CLIENT_RESPONSE,
        result,
        true,
      );
    } catch (error) {
      this.logger.error('Error handling get proposals by client', error);
      await this.requestResponseService.respond(
        event.requestId,
        MessagePattern.PROPOSAL_GET_BY_CLIENT_RESPONSE,
        null,
        false,
        { message: error.message || 'Failed to get proposals', statusCode: error.status || 500 },
      );
    }
  }

  private async handleGetOne(event: any) {
    try {
      const { proposalId, callerId } = event.data as any;
      const proposal = await this.proposalService.findById(proposalId, callerId);
      await this.requestResponseService.respond(
        event.requestId,
        MessagePattern.PROPOSAL_GET_ONE_RESPONSE,
        proposal,
        true,
      );
    } catch (error) {
      this.logger.error('Error handling get proposal', error);
      await this.requestResponseService.respond(
        event.requestId,
        MessagePattern.PROPOSAL_GET_ONE_RESPONSE,
        null,
        false,
        { message: error.message || 'Proposal not found', statusCode: error.status || 404 },
      );
    }
  }

  private async handleUpdateStatus(event: any) {
    try {
      const { proposalId, callerId, status, clientWallet, clientSignature } = event.data as any;
      const proposal = await this.proposalService.updateStatus(
        proposalId,
        callerId,
        { status, clientWallet, clientSignature },
      );
      await this.requestResponseService.respond(
        event.requestId,
        MessagePattern.PROPOSAL_UPDATE_STATUS_RESPONSE,
        proposal,
        true,
      );
      // PROPOSAL_HIRED is now published from handleAcceptProposal (after freelancer accepts)
    } catch (error) {
      this.logger.error('Error handling update proposal status', error);
      await this.requestResponseService.respond(
        event.requestId,
        MessagePattern.PROPOSAL_UPDATE_STATUS_RESPONSE,
        null,
        false,
        { message: error.message || 'Failed to update status', statusCode: error.status || 500 },
      );
    }
  }

  private async handleAcceptProposal(event: any) {
    try {
      const { proposalId, applicantId, freelancerWallet, freelancerSignature } = event.data as any;
      const proposal = await this.proposalService.acceptProposal(
        proposalId,
        applicantId,
        freelancerWallet,
        freelancerSignature,
      );

      await this.requestResponseService.respond(
        event.requestId,
        MessagePattern.PROPOSAL_ACCEPT_RESPONSE,
        proposal,
        true,
      );

      // Fire-and-forget: publish PROPOSAL_HIRED now that both parties have signed
      try {
        await this.publisherService.publish(MessagePattern.PROPOSAL_HIRED, {
          proposalId: proposal.id,
          applicantId: proposal.applicantId,
          coverLetter: proposal.coverLetter ?? null,
          resumeUrl: proposal.resumeUrl ?? null,
          links: proposal.links,
          jobId: proposal.job.id,
          jobTitle: proposal.job.title,
          jobDescription: proposal.job.description,
          jobCategory: proposal.job.category,
          jobSkills: proposal.job.skills,
          jobLanguages: proposal.job.languages,
          jobStartDate: proposal.job.startDate instanceof Date
            ? proposal.job.startDate.toISOString().split('T')[0]
            : String(proposal.job.startDate),
          jobEndDate: proposal.job.endDate instanceof Date
            ? proposal.job.endDate.toISOString().split('T')[0]
            : String(proposal.job.endDate),
          jobDuration: proposal.job.duration,
          jobLocation: proposal.job.location,
          jobExperienceLevel: proposal.job.experienceLevel,
          paymentType: proposal.job.paymentType,
          payRangeMin: proposal.job.payRangeMin,
          payRangeMax: proposal.job.payRangeMax,
          payFromCurrency: proposal.job.payFromCurrency ?? null,
          payToCurrency: proposal.job.payToCurrency ?? null,
          milestones: proposal.job.milestones ?? null,
          clientId: proposal.job.userId,
          clientWallet: proposal.clientWallet ?? null,
          clientSignature: proposal.clientSignature ?? null,
          freelancerWallet: proposal.freelancerWallet ?? null,
          freelancerSignature: proposal.freelancerSignature ?? null,
          hiredAt: new Date().toISOString(),
        });
        this.logger.log(`Published PROPOSAL_HIRED event for proposal ${proposal.id}`);
      } catch (publishError) {
        this.logger.error(
          `Failed to publish PROPOSAL_HIRED for proposal ${proposal.id}`,
          publishError,
        );
      }
    } catch (error) {
      this.logger.error('Error handling accept proposal', error);
      await this.requestResponseService.respond(
        event.requestId,
        MessagePattern.PROPOSAL_ACCEPT_RESPONSE,
        null,
        false,
        { message: error.message || 'Failed to accept proposal', statusCode: error.status || 500 },
      );
    }
  }

  private async handleCountByJob(event: any) {
    try {
      const { jobId, callerId } = event.data as any;
      const result = await this.proposalService.countByJob(jobId, callerId);
      await this.requestResponseService.respond(
        event.requestId,
        MessagePattern.PROPOSAL_COUNT_BY_JOB_RESPONSE,
        result,
        true,
      );
    } catch (error) {
      this.logger.error('Error handling proposal count by job', error);
      await this.requestResponseService.respond(
        event.requestId,
        MessagePattern.PROPOSAL_COUNT_BY_JOB_RESPONSE,
        null,
        false,
        { message: error.message || 'Failed to count proposals', statusCode: error.status || 500 },
      );
    }
  }

  private async handleGetFreelancerStats(event: any) {
    try {
      const { applicantId } = event.data as any;
      const stats = await this.proposalService.getFreelancerStats(applicantId);
      await this.requestResponseService.respond(
        event.requestId,
        MessagePattern.PROPOSAL_GET_FREELANCER_STATS_RESPONSE,
        stats,
        true,
      );
    } catch (error) {
      this.logger.error('Error handling get freelancer stats', error);
      await this.requestResponseService.respond(
        event.requestId,
        MessagePattern.PROPOSAL_GET_FREELANCER_STATS_RESPONSE,
        null,
        false,
        { message: error.message || 'Failed to get stats', statusCode: error.status || 500 },
      );
    }
  }
}
