import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, IsNull } from 'typeorm';
import { createHash } from 'crypto';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { ConfigService } from '@mintjobs/config';
import { PublisherService } from '@mintjobs/messaging';
import { MessagePattern } from '@mintjobs/constants';
import { Contract, ContractStatus, ContractProgress, deriveProgress } from './entities/contract.entity';
import { Job, PaymentType } from '../entities/job.entity';
import { PdfHelper } from './pdf.helper';
import { PinataService } from './pinata.service';

export interface ContractTerminationData {
  contractId: string;
  proposalId: string;
  jobTitle: string;
  clientId: string;
  applicantId: string;
  terminatedBy: string;
  terminationReason: string;
  terminatedAt: string;
  originalContractDate: string;
  workCompletedDescription?: string;
  compensationDue?: number;
  currency?: string;
}

export interface ContractCompletionData {
  contractId: string;
  proposalId: string;
  jobTitle: string;
  jobCategory: string;
  clientId: string;
  applicantId: string;
  completedAt: string;
  originalContractDate: string;
  startDate: string;
  endDate: string;
  totalAmount: number;
  currency: string;
  paymentType: string;
  milestones?: Array<{
    name: string;
    amount: string | number;
    completedAt?: string;
  }>;
}

export interface ProposalHiredEvent {
  proposalId: string;
  applicantId: string;
  coverLetter?: string | null;
  resumeUrl?: string | null;
  links: string[];
  jobId: string;
  jobTitle: string;
  jobDescription: string;
  jobCategory: string;
  jobSkills: string[];
  jobLanguages: string[];
  jobStartDate: string;
  jobEndDate: string;
  jobDuration: number;
  jobLocation: string;
  jobExperienceLevel: string;
  paymentType: PaymentType;
  payRangeMin: number;
  payRangeMax: number;
  payFromCurrency?: string | null;
  payToCurrency?: string | null;
  milestones?: Array<{
    name: string;
    amount: string | number;
    description?: string;
    dueDate?: string | null;
    duration?: number;
  }> | null;
  clientId: string;
  clientWallet?: string | null;
  clientSignature?: string | null;
  freelancerWallet?: string | null;
  freelancerSignature?: string | null;
  hiredAt: string;
}

@Injectable()
export class ContractService {
  private readonly logger = new Logger(ContractService.name);
  private readonly s3: S3Client;
  private readonly bucket: string;
  private readonly region: string;

  constructor(
    @InjectRepository(Contract)
    private readonly contractRepository: Repository<Contract>,
    @InjectRepository(Job)
    private readonly jobRepository: Repository<Job>,
    private readonly configService: ConfigService,
    private readonly pinataService: PinataService,
    private readonly publisherService: PublisherService,
  ) {
    const s3Config = this.configService.s3;
    this.bucket = s3Config.bucket;
    this.region = s3Config.region;
    this.s3 = new S3Client({
      region: s3Config.region,
      credentials: {
        accessKeyId: s3Config.accessKeyId,
        secretAccessKey: s3Config.secretAccessKey,
      },
    });
  }

  async createAndGenerate(data: ProposalHiredEvent): Promise<Contract> {
    // Idempotency: skip if contract already exists for this proposal
    const existing = await this.contractRepository.findOne({
      where: { proposalId: data.proposalId },
    });
    if (existing) {
      this.logger.warn(
        `Contract already exists for proposal ${data.proposalId}, skipping generation`,
      );
      return existing;
    }

    // Insert with GENERATING status
    const contract = await this.contractRepository.save(
      this.contractRepository.create({
        proposalId: data.proposalId,
        jobId: data.jobId,
        clientId: data.clientId,
        applicantId: data.applicantId,
        status: ContractStatus.GENERATING,
      }),
    );

    try {
      const pdfBuffer = await this.generatePdfBuffer(data, contract.id);

      // 1. Upload PDF to S3 (existing)
      const key = `contracts/${contract.id}.pdf`;
      await this.s3.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: pdfBuffer,
          ContentType: 'application/pdf',
          ContentLength: pdfBuffer.length,
        }),
      );
      const contractUrl = `https://${this.bucket}.s3.${this.region}.amazonaws.com/${key}`;

      // 2. Upload PDF to Pinata/IPFS
      let ipfsPdfCid: string | undefined;
      let ipfsPdfUrl: string | undefined;
      try {
        const ipfsResult = await this.pinataService.uploadFile(pdfBuffer, `contract-${contract.id}.pdf`);
        ipfsPdfCid = ipfsResult.cid;
        ipfsPdfUrl = ipfsResult.url;
      } catch (err) {
        this.logger.warn(`Pinata PDF upload failed for contract ${contract.id} — continuing with S3 only`, err);
      }

      // 3. Compute SHA-256 hash of the PDF
      const pdfHash = createHash('sha256').update(pdfBuffer).digest('hex');

      // 4. Build metadata JSON
      const metadata = {
        name: `MintJobs Contract — ${data.jobTitle}`,
        description: 'Freelance service agreement on MintJobs',
        properties: {
          contractId: contract.id,
          jobId: data.jobId,
          jobTitle: data.jobTitle,
          jobCategory: data.jobCategory,
          client: {
            wallet: data.clientWallet ?? null,
            id: data.clientId,
          },
          freelancer: {
            wallet: data.freelancerWallet ?? null,
            id: data.applicantId,
          },
          compensation: {
            paymentType: data.paymentType,
            min: data.payRangeMin,
            max: data.payRangeMax,
            fromCurrency: data.payFromCurrency ?? null,
            toCurrency: data.payToCurrency ?? null,
          },
          timeline: {
            startDate: data.jobStartDate,
            endDate: data.jobEndDate,
            duration: data.jobDuration,
          },
          pdfUrl: ipfsPdfUrl ? `ipfs://${ipfsPdfCid}` : contractUrl,
          pdfHash,
          createdAt: new Date().toISOString(),
        },
      };

      // 5. Upload metadata JSON to Pinata/IPFS
      let ipfsMetadataCid: string | undefined;
      let ipfsMetadataUrl: string | undefined;
      try {
        const metaResult = await this.pinataService.uploadJson(metadata, `contract-${contract.id}-metadata.json`);
        ipfsMetadataCid = metaResult.cid;
        ipfsMetadataUrl = metaResult.url;
      } catch (err) {
        this.logger.warn(`Pinata metadata upload failed for contract ${contract.id}`, err);
      }

      // 6. Save contract with IPFS data — on-chain creation happens async
      contract.status = ContractStatus.GENERATED;
      contract.contractUrl = contractUrl;
      contract.ipfsPdfCid = ipfsPdfCid;
      contract.ipfsPdfUrl = ipfsPdfUrl;
      contract.ipfsMetadataCid = ipfsMetadataCid;
      contract.ipfsMetadataUrl = ipfsMetadataUrl;
      contract.pdfHash = pdfHash;
      contract.clientWallet = data.clientWallet ?? undefined;
      contract.freelancerWallet = data.freelancerWallet ?? undefined;
      const saved = await this.contractRepository.save(contract);

      // 7. Fire-and-forget on-chain creation — result comes back via ONCHAIN_CONTRACT_CREATE_RESULT
      if (ipfsMetadataUrl && data.clientWallet && data.freelancerWallet) {
        try {
          await this.publisherService.publish(MessagePattern.ONCHAIN_CONTRACT_CREATE, {
            contractId: contract.id,
            jobId: data.jobId,
            clientWallet: data.clientWallet,
            freelancerWallet: data.freelancerWallet,
            metadataUri: ipfsMetadataUrl,
            pdfHash,
          });
        } catch (err) {
          this.logger.warn(`Failed to publish ONCHAIN_CONTRACT_CREATE for ${contract.id}`, err);
        }
      }

      return saved;
    } catch (error) {
      this.logger.error(
        `Failed to generate contract for proposal ${data.proposalId}`,
        error,
      );
      contract.status = ContractStatus.FAILED;
      contract.failureReason = (error as Error)?.message ?? 'Unknown error';
      return await this.contractRepository.save(contract);
    }
  }

  async applyOnChainCreateResult(contractId: string, txSignature: string, contractPda: string): Promise<void> {
    await this.contractRepository.update(contractId, {
      onchainTxSignature: txSignature,
      contractPda,
    });
    this.logger.log(`On-chain contract created for ${contractId} | PDA: ${contractPda} | sig: ${txSignature}`);
  }

  async applyOnChainCompleteResult(contractId: string, txSignature: string): Promise<void> {
    await this.contractRepository.update(contractId, {
      completionOnchainTxSignature: txSignature,
    });
    this.logger.log(`On-chain contract completed for ${contractId} | sig: ${txSignature}`);
  }

  async findByProposalId(proposalId: string): Promise<Contract & { job: Job | null; progress: ContractProgress }> {
    const contract = await this.contractRepository.findOne({ where: { proposalId } });
    if (!contract) throw new NotFoundException('Contract not found');
    return this.enrichContract(contract);
  }

  async findById(contractId: string): Promise<Contract & { job: Job | null; progress: ContractProgress }> {
    const contract = await this.contractRepository.findOne({ where: { id: contractId } });
    if (!contract) throw new NotFoundException('Contract not found');
    return this.enrichContract(contract);
  }

  async findByApplicantId(
    applicantId: string,
  ): Promise<Array<Contract & { job: Job | null; progress: ContractProgress }>> {
    const contracts = await this.contractRepository.find({
      where: { applicantId, deletedAt: IsNull() },
      order: { createdAt: 'DESC' },
    });

    if (!contracts.length) return [];

    const jobIds = [...new Set(contracts.map((c) => c.jobId))];
    const jobs = await this.jobRepository.find({ where: { id: In(jobIds) } });
    const jobMap = new Map(jobs.map((j) => [j.id, j]));

    return contracts.map((contract) => ({
      ...contract,
      job: jobMap.get(contract.jobId) ?? null,
      progress: deriveProgress(contract.status),
    }));
  }

  private async enrichContract(
    contract: Contract,
  ): Promise<Contract & { job: Job | null; progress: ContractProgress }> {
    const job = await this.jobRepository.findOne({ where: { id: contract.jobId } });
    return {
      ...contract,
      job: job ?? null,
      progress: deriveProgress(contract.status),
    };
  }

  // ─── Termination Notice ────────────────────────────────────────────────────

  async generateTerminationNotice(data: ContractTerminationData): Promise<Contract> {
    const contract = await this.contractRepository.findOne({
      where: { id: data.contractId },
    });
    if (!contract) throw new NotFoundException('Contract not found');

    try {
      const pdfBuffer = await this.buildPdfBuffer((doc) =>
        this.writeTerminationContent(doc, data),
      );

      const key = `contracts/${data.contractId}-termination.pdf`;
      await this.s3.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: pdfBuffer,
          ContentType: 'application/pdf',
          ContentLength: pdfBuffer.length,
        }),
      );

      contract.status = ContractStatus.TERMINATED;
      contract.terminationUrl = `https://${this.bucket}.s3.${this.region}.amazonaws.com/${key}`;
      contract.terminatedAt = new Date(data.terminatedAt);
      contract.terminatedBy = data.terminatedBy;
      contract.terminationReason = data.terminationReason;
      return await this.contractRepository.save(contract);
    } catch (error) {
      this.logger.error(`Failed to generate termination notice for contract ${data.contractId}`, error);
      throw error;
    }
  }

  // ─── Completion Certificate ────────────────────────────────────────────────

  async generateCompletionCertificate(data: ContractCompletionData): Promise<Contract> {
    const contract = await this.contractRepository.findOne({
      where: { id: data.contractId },
    });
    if (!contract) throw new NotFoundException('Contract not found');

    try {
      const pdfBuffer = await this.buildPdfBuffer((doc) =>
        this.writeCompletionContent(doc, data),
      );

      // Upload to S3
      const key = `contracts/${data.contractId}-completion.pdf`;
      await this.s3.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: pdfBuffer,
          ContentType: 'application/pdf',
          ContentLength: pdfBuffer.length,
        }),
      );
      const completionUrl = `https://${this.bucket}.s3.${this.region}.amazonaws.com/${key}`;

      // Upload to Pinata/IPFS
      let completionIpfsPdfCid: string | undefined;
      let completionIpfsPdfUrl: string | undefined;
      try {
        const ipfsResult = await this.pinataService.uploadFile(pdfBuffer, `completion-${data.contractId}.pdf`);
        completionIpfsPdfCid = ipfsResult.cid;
        completionIpfsPdfUrl = ipfsResult.url;
      } catch (err) {
        this.logger.warn(`Pinata completion upload failed for contract ${data.contractId}`, err);
      }

      // Hash the completion PDF
      const completionPdfHash = createHash('sha256').update(pdfBuffer).digest('hex');

      // Build completion metadata JSON
      const completionMetadata = {
        name: `MintJobs Completion — ${data.jobTitle}`,
        description: 'Freelance service completion certificate on MintJobs',
        properties: {
          contractId: data.contractId,
          jobId: data.proposalId,
          jobTitle: data.jobTitle,
          completedAt: data.completedAt,
          totalAmount: data.totalAmount,
          currency: data.currency,
          pdfUrl: completionIpfsPdfUrl ? `ipfs://${completionIpfsPdfCid}` : completionUrl,
          pdfHash: completionPdfHash,
        },
      };

      let completionMetadataCid: string | undefined;
      let completionMetadataUrl: string | undefined;
      try {
        const metaResult = await this.pinataService.uploadJson(completionMetadata, `completion-${data.contractId}-metadata.json`);
        completionMetadataCid = metaResult.cid;
        completionMetadataUrl = metaResult.url;
      } catch (err) {
        this.logger.warn(`Pinata completion metadata upload failed for ${data.contractId}`, err);
      }

      contract.status = ContractStatus.COMPLETED;
      contract.completionUrl = completionUrl;
      contract.completedAt = new Date(data.completedAt);
      contract.completionIpfsPdfUrl = completionIpfsPdfUrl;
      contract.completionIpfsPdfCid = completionIpfsPdfCid;
      contract.completionIpfsMetadataUrl = completionMetadataUrl;
      contract.completionPdfHash = completionPdfHash;
      const completedContract = await this.contractRepository.save(contract);

      // Fire-and-forget on-chain completion — result comes back via ONCHAIN_CONTRACT_COMPLETE_RESULT
      if (completionMetadataUrl && contract.jobId) {
        try {
          await this.publisherService.publish(MessagePattern.ONCHAIN_CONTRACT_COMPLETE, {
            contractId: contract.id,
            jobId: contract.jobId,
            completionUri: completionMetadataUrl,
            completionPdfHash,
          });
        } catch (err) {
          this.logger.warn(`Failed to publish ONCHAIN_CONTRACT_COMPLETE for ${contract.id}`, err);
        }
      }

      return completedContract;
    } catch (error) {
      this.logger.error(`Failed to generate completion certificate for contract ${data.contractId}`, error);
      throw error;
    }
  }

  /**
   * Triggered by JOB_COMPLETED event from escrow-service after escrow release.
   * Looks up the contract by jobId and generates the completion certificate.
   */
  async completeByJobId(jobId: string, amountLamports: number | null = null): Promise<void> {
    const contract = await this.contractRepository.findOne({ where: { jobId } });
    if (!contract) {
      this.logger.warn(`JOB_COMPLETED received but no contract found for job ${jobId}`);
      return;
    }
    if (contract.status === ContractStatus.COMPLETED) {
      this.logger.warn(`Contract for job ${jobId} already completed — skipping`);
      return;
    }

    const job = await this.jobRepository.findOne({ where: { id: jobId } });
    const completedAt = new Date().toISOString();
    // Convert lamports → SOL (1 SOL = 1_000_000_000 lamports)
    const totalAmount = amountLamports != null ? amountLamports / 1_000_000_000 : 0;

    await this.generateCompletionCertificate({
      contractId: contract.id,
      proposalId: contract.proposalId,
      jobTitle: job?.title ?? 'MintJobs Project',
      jobCategory: job?.category ?? '',
      clientId: contract.clientId,
      applicantId: contract.applicantId,
      completedAt,
      originalContractDate: contract.createdAt.toISOString(),
      startDate: job?.startDate ? String(job.startDate) : completedAt,
      endDate: completedAt,
      totalAmount,
      currency: 'SOL',
      paymentType: job?.paymentType ?? 'fixed',
    });
  }

  // ─── PDF Generation ────────────────────────────────────────────────────────

  private generatePdfBuffer(data: ProposalHiredEvent, contractId: string): Promise<Buffer> {
    return this.buildPdfBuffer((doc) => this.writePdfContent(doc, data, contractId));
  }

  private writePdfContent(
    doc: PDFKit.PDFDocument,
    data: ProposalHiredEvent,
    contractId: string,
  ): void {
    const contractDate = new Date(data.hiredAt).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    // ── Branded header ───────────────────────────────────────────────────────
    PdfHelper.drawHeader(doc, {
      title: 'Freelance Service Agreement',
      subtitle: 'This document is a binding service agreement between the parties listed below.',
      date: contractDate,
      refId: contractId,
    });

    // ── Parties ──────────────────────────────────────────────────────────────
    PdfHelper.drawSectionHeading(doc, 'Parties');
    doc.text(`Client ID:     ${data.clientId}`);
    doc.text(`Freelancer ID: ${data.applicantId}`);
    doc.moveDown(1);

    PdfHelper.drawSectionDivider(doc);

    // ── Project Details ──────────────────────────────────────────────────────
    PdfHelper.drawSectionHeading(doc, 'Project Details');
    doc.text(`Title:       ${data.jobTitle}`);
    doc.text(`Category:    ${data.jobCategory}`);
    doc.text(`Location:    ${data.jobLocation}`);
    doc.text(`Experience:  ${data.jobExperienceLevel}`);
    doc.moveDown(0.5);
    doc.font('Helvetica-Bold').text('Description:').font('Helvetica');
    doc.text(data.jobDescription, { width: PdfHelper.CONTENT_W }).moveDown(0.5);
    if (data.jobSkills?.length) {
      doc.text(`Skills:     ${data.jobSkills.join(', ')}`);
    }
    if (data.jobLanguages?.length) {
      doc.text(`Languages:  ${data.jobLanguages.join(', ')}`);
    }
    doc.moveDown(1);

    PdfHelper.drawSectionDivider(doc);

    // ── Timeline ─────────────────────────────────────────────────────────────
    PdfHelper.drawSectionHeading(doc, 'Timeline');
    doc.text(`Start Date: ${data.jobStartDate}`);
    doc.text(`End Date:   ${data.jobEndDate}`);
    doc.text(`Duration:   ${data.jobDuration} day(s)`);
    doc.moveDown(1);

    PdfHelper.drawSectionDivider(doc);

    // ── Compensation ─────────────────────────────────────────────────────────
    PdfHelper.drawSectionHeading(doc, 'Compensation');
    doc.text(`Payment Type: ${data.paymentType}`);

    const currency = data.payFromCurrency
      ? ` ${data.payFromCurrency.toUpperCase()}${
          data.payToCurrency && data.payToCurrency !== data.payFromCurrency
            ? ` → ${data.payToCurrency.toUpperCase()}`
            : ''
        }`
      : '';
    doc.text(`Pay Range:    ${data.payRangeMin} – ${data.payRangeMax}${currency}`);
    doc.moveDown(0.5);

    if (data.paymentType === PaymentType.MILESTONE && data.milestones?.length) {
      doc.font('Helvetica-Bold').text('Milestones:').moveDown(0.3);
      data.milestones.forEach((m, i) => {
        const due = m.dueDate
          ? `  Due: ${m.dueDate}`
          : m.duration
          ? `  Duration: ${m.duration}d`
          : '';
        const desc = m.description ? `  (${m.description})` : '';
        doc
          .font('Helvetica')
          .text(`  ${i + 1}. ${m.name} — Amount: ${m.amount}${desc}${due}`);
      });
    }
    doc.moveDown(1);

    PdfHelper.drawSectionDivider(doc);

    // ── Proposal Notes ───────────────────────────────────────────────────────
    if (data.coverLetter) {
      PdfHelper.drawSectionHeading(doc, 'Proposal Notes');
      doc.text(data.coverLetter, { width: PdfHelper.CONTENT_W });
      doc.moveDown(1);
      PdfHelper.drawSectionDivider(doc);
    }

    // ── Terms & Conditions ───────────────────────────────────────────────────
    PdfHelper.drawSectionHeading(doc, 'Terms & Conditions');
    doc.fontSize(9).font('Helvetica');
    const terms = [
      '1. The Freelancer agrees to deliver the services described above by the agreed end date.',
      '2. The Client agrees to pay the Freelancer the agreed compensation upon satisfactory completion of deliverables.',
      '3. All deliverables created under this Agreement shall become the property of the Client upon receipt of full payment.',
      '4. Either party may terminate this Agreement with 7 days written notice. Work completed prior to termination must be compensated.',
      '5. The Freelancer agrees to keep all Client information strictly confidential during and after the engagement.',
      '6. Disputes shall first be resolved through good-faith negotiation. If unresolved within 30 days, disputes shall be submitted to binding arbitration.',
      '7. This Agreement constitutes the entire agreement between the parties and supersedes all prior discussions or representations.',
    ];
    terms.forEach((term) => {
      doc.text(term, { width: PdfHelper.CONTENT_W }).moveDown(0.4);
    });
    doc.moveDown(1);

    // ── On-Chain Verification ─────────────────────────────────────────────────
    if (data.clientWallet || data.freelancerWallet) {
      PdfHelper.drawSectionDivider(doc);
      PdfHelper.drawSectionHeading(doc, 'On-Chain Verification');
      if (data.clientWallet) {
        doc.text(`Client Wallet:        ${data.clientWallet}`);
      }
      if (data.freelancerWallet) {
        doc.text(`Freelancer Wallet:    ${data.freelancerWallet}`);
      }
      if (data.clientSignature) {
        const truncSig = data.clientSignature.length > 64
          ? data.clientSignature.substring(0, 64) + '...'
          : data.clientSignature;
        doc.text(`Client Signature:     ${truncSig}`);
      }
      if (data.freelancerSignature) {
        const truncSig = data.freelancerSignature.length > 64
          ? data.freelancerSignature.substring(0, 64) + '...'
          : data.freelancerSignature;
        doc.text(`Freelancer Signature: ${truncSig}`);
      }
      doc.moveDown(1);
    }

    // ── Digital Acceptance ───────────────────────────────────────────────────
    PdfHelper.drawSectionDivider(doc);
    doc
      .fontSize(8.5)
      .font('Helvetica')
      .fillColor('#6b7280')
      .text(
        `This agreement was digitally accepted by both parties on ${new Date(data.hiredAt).toUTCString()}. ` +
        `Acceptance is recorded on the MintJobs platform and verified on the Solana blockchain.`,
        { width: PdfHelper.CONTENT_W, align: 'center' },
      )
      .fillColor('#000000');
  }

  // ─── Shared PDF builder ────────────────────────────────────────────────────

  private buildPdfBuffer(writeFn: (doc: PDFKit.PDFDocument) => void): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = PdfHelper.createDocument();
      const chunks: Buffer[] = [];

      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      writeFn(doc);

      PdfHelper.drawFooterOnAllPages(doc);
      doc.end();
    });
  }

  // ─── Termination PDF content ───────────────────────────────────────────────

  private writeTerminationContent(doc: PDFKit.PDFDocument, data: ContractTerminationData): void {
    const terminatedDate = new Date(data.terminatedAt).toLocaleDateString('en-US', {
      year: 'numeric', month: 'long', day: 'numeric',
    });
    const originalDate = new Date(data.originalContractDate).toLocaleDateString('en-US', {
      year: 'numeric', month: 'long', day: 'numeric',
    });

    PdfHelper.drawHeader(doc, {
      title: 'Contract Termination Notice',
      subtitle: 'This document formally records the termination of the service agreement below.',
      date: terminatedDate,
      refId: data.contractId,
    });

    // ── Parties ───────────────────────────────────────────────────────────────
    PdfHelper.drawSectionHeading(doc, 'Parties');
    doc.text(`Client ID:     ${data.clientId}`);
    doc.text(`Freelancer ID: ${data.applicantId}`);
    doc.moveDown(1);
    PdfHelper.drawSectionDivider(doc);

    // ── Contract Reference ────────────────────────────────────────────────────
    PdfHelper.drawSectionHeading(doc, 'Contract Reference');
    doc.text(`Job Title:              ${data.jobTitle}`);
    doc.text(`Original Contract Date: ${originalDate}`);
    doc.text(`Contract ID:            ${data.contractId}`);
    doc.text(`Proposal ID:            ${data.proposalId}`);
    doc.moveDown(1);
    PdfHelper.drawSectionDivider(doc);

    // ── Termination Details ───────────────────────────────────────────────────
    PdfHelper.drawSectionHeading(doc, 'Termination Details');
    doc.text(`Termination Date:   ${terminatedDate}`);
    doc.text(`Terminated By:      ${data.terminatedBy}`);
    doc.moveDown(0.5);
    doc.font('Helvetica-Bold').text('Reason for Termination:').font('Helvetica');
    doc.text(data.terminationReason, { width: PdfHelper.CONTENT_W }).moveDown(0.5);

    if (data.workCompletedDescription) {
      doc.font('Helvetica-Bold').text('Work Completed to Date:').font('Helvetica');
      doc.text(data.workCompletedDescription, { width: PdfHelper.CONTENT_W }).moveDown(0.5);
    }
    if (data.compensationDue != null) {
      const currency = data.currency?.toUpperCase() ?? 'USD';
      doc.text(`Compensation Due: ${data.compensationDue} ${currency}`);
    }
    doc.moveDown(1);
    PdfHelper.drawSectionDivider(doc);

    // ── Termination Terms ─────────────────────────────────────────────────────
    PdfHelper.drawSectionHeading(doc, 'Termination Terms');
    doc.fontSize(9).font('Helvetica');
    [
      '1. This notice serves as the formal written termination of the Freelance Service Agreement referenced above.',
      '2. Any work completed prior to the termination date must be compensated in accordance with the original agreement.',
      '3. All deliverables produced up to the termination date shall be handed over to the Client within 7 days.',
      '4. All confidential information obtained during the engagement must remain strictly confidential after termination.',
      '5. Both parties release each other from future obligations under the original agreement, except for payment of work already performed.',
      '6. Any outstanding disputes arising from this termination shall be resolved through binding arbitration as stipulated in the original agreement.',
    ].forEach((t) => doc.text(t, { width: PdfHelper.CONTENT_W }).moveDown(0.4));
    doc.moveDown(1);
    PdfHelper.drawSectionDivider(doc);

    // ── Digital Record ────────────────────────────────────────────────────────
    doc
      .fontSize(8.5)
      .font('Helvetica')
      .fillColor('#6b7280')
      .text(
        `This termination notice was recorded on the MintJobs platform on ${new Date(data.terminatedAt).toUTCString()}. ` +
        `It is binding on both parties without a wet signature.`,
        { width: PdfHelper.CONTENT_W, align: 'center' },
      )
      .fillColor('#000000');
  }

  // ─── Completion Certificate content ───────────────────────────────────────

  private writeCompletionContent(doc: PDFKit.PDFDocument, data: ContractCompletionData): void {
    const completedDate = new Date(data.completedAt).toLocaleDateString('en-US', {
      year: 'numeric', month: 'long', day: 'numeric',
    });
    const originalDate = new Date(data.originalContractDate).toLocaleDateString('en-US', {
      year: 'numeric', month: 'long', day: 'numeric',
    });

    PdfHelper.drawHeader(doc, {
      title: 'Contract Completion Certificate',
      subtitle: 'This document certifies the successful completion of the service agreement below.',
      date: completedDate,
      refId: data.contractId,
    });

    // ── Parties ───────────────────────────────────────────────────────────────
    PdfHelper.drawSectionHeading(doc, 'Parties');
    doc.text(`Client ID:     ${data.clientId}`);
    doc.text(`Freelancer ID: ${data.applicantId}`);
    doc.moveDown(1);
    PdfHelper.drawSectionDivider(doc);

    // ── Project Summary ───────────────────────────────────────────────────────
    PdfHelper.drawSectionHeading(doc, 'Project Summary');
    doc.text(`Job Title:    ${data.jobTitle}`);
    doc.text(`Category:     ${data.jobCategory}`);
    doc.text(`Contract ID:  ${data.contractId}`);
    doc.text(`Proposal ID:  ${data.proposalId}`);
    doc.moveDown(1);
    PdfHelper.drawSectionDivider(doc);

    // ── Timeline ─────────────────────────────────────────────────────────────
    PdfHelper.drawSectionHeading(doc, 'Timeline');
    doc.text(`Contract Issued:  ${originalDate}`);
    doc.text(`Work Start Date:  ${data.startDate}`);
    doc.text(`Work End Date:    ${data.endDate}`);
    doc.text(`Completion Date:  ${completedDate}`);
    doc.moveDown(1);
    PdfHelper.drawSectionDivider(doc);

    // ── Payment Summary ───────────────────────────────────────────────────────
    PdfHelper.drawSectionHeading(doc, 'Payment Summary');
    doc.text(`Payment Type:   ${data.paymentType}`);
    doc.text(`Total Amount:   ${data.totalAmount} ${data.currency.toUpperCase()}`);

    if (data.milestones?.length) {
      doc.moveDown(0.5);
      doc.font('Helvetica-Bold').text('Milestones Delivered:').moveDown(0.3);
      data.milestones.forEach((m, i) => {
        const completedOn = m.completedAt
          ? `  (completed ${new Date(m.completedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })})`
          : '';
        doc.font('Helvetica').text(`  ${i + 1}. ${m.name} — ${m.amount} ${data.currency.toUpperCase()}${completedOn}`);
      });
    }
    doc.moveDown(1);
    PdfHelper.drawSectionDivider(doc);

    // ── Certification ─────────────────────────────────────────────────────────
    PdfHelper.drawSectionHeading(doc, 'Certification');
    doc.fontSize(9).font('Helvetica');
    [
      '1. Both parties confirm that all deliverables described in the original Service Agreement have been received and accepted.',
      '2. The Client confirms that the agreed compensation has been paid in full to the Freelancer.',
      '3. All intellectual property rights for delivered work are hereby transferred to the Client upon full payment.',
      '4. Both parties are released from all future obligations under the original Service Agreement.',
      '5. This certificate does not affect any confidentiality obligations which remain in force.',
    ].forEach((t) => doc.text(t, { width: PdfHelper.CONTENT_W }).moveDown(0.4));
    doc.moveDown(1);
    PdfHelper.drawSectionDivider(doc);

    // ── Digital Record ────────────────────────────────────────────────────────
    doc
      .fontSize(8.5)
      .font('Helvetica')
      .fillColor('#6b7280')
      .text(
        `This completion certificate was issued on the MintJobs platform on ${new Date(data.completedAt).toUTCString()}. ` +
        `It is binding on both parties without a wet signature.`,
        { width: PdfHelper.CONTENT_W, align: 'center' },
      )
      .fillColor('#000000');
  }
}
