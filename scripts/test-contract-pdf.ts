/**
 * Manual test script — generates a sample contract PDF and uploads it to S3.
 *
 * Run with:
 *   npx ts-node -r tsconfig-paths/register scripts/test-contract-pdf.ts
 */

import 'dotenv/config';
import * as path from 'path';
import * as fs from 'fs';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { PdfHelper } from '../apps/job-service/src/contract/pdf.helper';
import { PaymentType } from '../apps/job-service/src/entities/job.entity';

// ─── Config from .env ─────────────────────────────────────────────────────────

const REGION   = process.env.AWS_S3_REGION || process.env.AWS_REGION || '';
const KEY_ID   = process.env.AWS_ACCESS_KEY_ID || '';
const SECRET   = process.env.AWS_SECRET_ACCESS_KEY || '';
const BUCKET   = process.env.AWS_S3_BUCKET || '';

if (!REGION || !KEY_ID || !SECRET || !BUCKET) {
  console.error(
    '\n❌  Missing AWS credentials.\n' +
    '   Make sure .env has AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_S3_BUCKET\n',
  );
  process.exit(1);
}

// ─── Mock contract data ───────────────────────────────────────────────────────

const CONTRACT_ID = `test-${Date.now()}`;

const MOCK_DATA = {
  proposalId:        'prop-test-001',
  applicantId:       'did:privy:freelancer-alice-001',
  coverLetter:       'I am excited to work on this DeFi dashboard project. I have 5+ years of experience building Web3 interfaces with React and have previously delivered similar projects for leading L2 protocols.',
  resumeUrl:         null,
  links:             ['https://github.com/alice', 'https://portfolio.alice.dev'],
  jobId:             'job-test-001',
  jobTitle:          'DeFi Dashboard — Senior Frontend Engineer',
  jobDescription:    'Build a full-featured DeFi analytics dashboard covering liquidity pools, yield farming positions, token swaps, and wallet portfolio tracking. The UI should support real-time data via WebSockets and be mobile-responsive.',
  jobCategory:       'Frontend Development',
  jobSkills:         ['React', 'TypeScript', 'ethers.js', 'Tailwind CSS', 'WebSockets'],
  jobLanguages:      ['English'],
  jobStartDate:      '2026-05-01',
  jobEndDate:        '2026-07-31',
  jobDuration:       91,
  jobLocation:       'Remote — Global',
  jobExperienceLevel:'Expert',
  paymentType:        PaymentType.MILESTONE,
  payRangeMin:        4500,
  payRangeMax:        6000,
  payFromCurrency:    'usd',
  payToCurrency:      'sol',
  milestones: [
    { name: 'Design System & Component Library',  amount: 1200, description: 'Figma → code, shared UI kit', dueDate: '2026-05-21' },
    { name: 'Data Layer Integration',              amount: 1800, description: 'API + on-chain hooks wired up', dueDate: '2026-06-15' },
    { name: 'Dashboard Pages (all views)',         amount: 1800, description: 'All routes implemented', dueDate: '2026-07-10' },
    { name: 'QA, Audit & Delivery',                amount: 1200, description: 'Accessibility + security review', dueDate: '2026-07-31' },
  ],
  clientId:  'did:privy:client-bob-002',
  hiredAt:   new Date().toISOString(),
};

// ─── Generate PDF buffer ───────────────────────────────────────────────────────

function generatePdf(): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = PdfHelper.createDocument();
    const chunks: Buffer[] = [];

    doc.on('data',  (chunk: Buffer) => chunks.push(chunk));
    doc.on('end',   () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const contractDate = new Date(MOCK_DATA.hiredAt).toLocaleDateString('en-US', {
      year: 'numeric', month: 'long', day: 'numeric',
    });

    // ── Header ──────────────────────────────────────────────────────────────
    PdfHelper.drawHeader(doc, {
      title:    'Freelance Service Agreement',
      subtitle: 'This document is a binding service agreement between the parties listed below.',
      date:     contractDate,
      refId:    CONTRACT_ID,
    });

    // ── Parties ──────────────────────────────────────────────────────────────
    PdfHelper.drawSectionHeading(doc, 'Parties');
    doc.text(`Client ID:     ${MOCK_DATA.clientId}`);
    doc.text(`Freelancer ID: ${MOCK_DATA.applicantId}`);
    doc.moveDown(1);
    PdfHelper.drawSectionDivider(doc);

    // ── Project Details ───────────────────────────────────────────────────────
    PdfHelper.drawSectionHeading(doc, 'Project Details');
    doc.text(`Title:       ${MOCK_DATA.jobTitle}`);
    doc.text(`Category:    ${MOCK_DATA.jobCategory}`);
    doc.text(`Location:    ${MOCK_DATA.jobLocation}`);
    doc.text(`Experience:  ${MOCK_DATA.jobExperienceLevel}`);
    doc.moveDown(0.5);
    doc.font('Helvetica-Bold').text('Description:').font('Helvetica');
    doc.text(MOCK_DATA.jobDescription, { width: PdfHelper.CONTENT_W }).moveDown(0.5);
    doc.text(`Skills:    ${MOCK_DATA.jobSkills.join(', ')}`);
    doc.text(`Languages: ${MOCK_DATA.jobLanguages.join(', ')}`);
    doc.moveDown(1);
    PdfHelper.drawSectionDivider(doc);

    // ── Timeline ──────────────────────────────────────────────────────────────
    PdfHelper.drawSectionHeading(doc, 'Timeline');
    doc.text(`Start Date: ${MOCK_DATA.jobStartDate}`);
    doc.text(`End Date:   ${MOCK_DATA.jobEndDate}`);
    doc.text(`Duration:   ${MOCK_DATA.jobDuration} day(s)`);
    doc.moveDown(1);
    PdfHelper.drawSectionDivider(doc);

    // ── Compensation ──────────────────────────────────────────────────────────
    PdfHelper.drawSectionHeading(doc, 'Compensation');
    doc.text(`Payment Type: ${MOCK_DATA.paymentType}`);
    doc.text(`Pay Range:    ${MOCK_DATA.payRangeMin} – ${MOCK_DATA.payRangeMax} ${MOCK_DATA.payFromCurrency?.toUpperCase()} → ${MOCK_DATA.payToCurrency?.toUpperCase()}`);
    doc.moveDown(0.5);
    doc.font('Helvetica-Bold').text('Milestones:').moveDown(0.3);
    MOCK_DATA.milestones.forEach((m, i) => {
      doc.font('Helvetica').text(
        `  ${i + 1}. ${m.name} — $${m.amount}  (${m.description})  Due: ${m.dueDate}`,
      );
    });
    doc.moveDown(1);
    PdfHelper.drawSectionDivider(doc);

    // ── Proposal Notes ────────────────────────────────────────────────────────
    PdfHelper.drawSectionHeading(doc, 'Proposal Notes');
    doc.text(MOCK_DATA.coverLetter, { width: PdfHelper.CONTENT_W });
    doc.moveDown(1);
    PdfHelper.drawSectionDivider(doc);

    // ── Terms & Conditions ────────────────────────────────────────────────────
    PdfHelper.drawSectionHeading(doc, 'Terms & Conditions');
    doc.fontSize(9).font('Helvetica');
    [
      '1. The Freelancer agrees to deliver the services described above by the agreed end date.',
      '2. The Client agrees to pay the Freelancer the agreed compensation upon satisfactory completion of deliverables.',
      '3. All deliverables created under this Agreement shall become the property of the Client upon receipt of full payment.',
      '4. Either party may terminate this Agreement with 7 days written notice. Work completed prior to termination must be compensated.',
      '5. The Freelancer agrees to keep all Client information strictly confidential during and after the engagement.',
      '6. Disputes shall first be resolved through good-faith negotiation. If unresolved within 30 days, disputes shall be submitted to binding arbitration.',
      '7. This Agreement constitutes the entire agreement between the parties and supersedes all prior discussions or representations.',
    ].forEach((t) => doc.text(t, { width: PdfHelper.CONTENT_W }).moveDown(0.4));
    doc.moveDown(1);
    PdfHelper.drawSectionDivider(doc);

    // ── Digital Acceptance ────────────────────────────────────────────────────
    PdfHelper.drawSectionDivider(doc);
    doc
      .fontSize(8.5)
      .font('Helvetica')
      .fillColor('#6b7280')
      .text(
        `This agreement was digitally accepted by both parties on ${new Date(MOCK_DATA.hiredAt).toUTCString()}. ` +
        `Acceptance is recorded on the MintJobs platform and is binding without a wet signature.`,
        { width: PdfHelper.CONTENT_W, align: 'center' },
      )
      .fillColor('#000000');

    // ── Footer on all pages ───────────────────────────────────────────────────
    PdfHelper.drawFooterOnAllPages(doc);
    doc.end();
  });
}

// ─── Upload to S3 ─────────────────────────────────────────────────────────────

async function uploadToS3(buffer: Buffer, key: string): Promise<string> {
  const s3 = new S3Client({
    region: REGION,
    credentials: { accessKeyId: KEY_ID, secretAccessKey: SECRET },
  });

  await s3.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key:    key,
    Body:   buffer,
    ContentType:   'application/pdf',
    ContentLength: buffer.length,
  }));

  return `https://${BUCKET}.s3.${REGION}.amazonaws.com/${key}`;
}

// ─── Termination PDF ──────────────────────────────────────────────────────────

function generateTerminationPdf(): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = PdfHelper.createDocument();
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const terminatedAt = new Date().toISOString();
    const terminatedDate = new Date(terminatedAt).toLocaleDateString('en-US', {
      year: 'numeric', month: 'long', day: 'numeric',
    });

    PdfHelper.drawHeader(doc, {
      title: 'Contract Termination Notice',
      subtitle: 'This document formally records the termination of the service agreement below.',
      date: terminatedDate,
      refId: `${CONTRACT_ID}-termination`,
    });

    PdfHelper.drawSectionHeading(doc, 'Parties');
    doc.text(`Client ID:     ${MOCK_DATA.clientId}`);
    doc.text(`Freelancer ID: ${MOCK_DATA.applicantId}`);
    doc.moveDown(1);
    PdfHelper.drawSectionDivider(doc);

    PdfHelper.drawSectionHeading(doc, 'Contract Reference');
    doc.text(`Job Title:              ${MOCK_DATA.jobTitle}`);
    doc.text(`Original Contract Date: ${new Date(MOCK_DATA.hiredAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`);
    doc.text(`Contract ID:            ${CONTRACT_ID}`);
    doc.moveDown(1);
    PdfHelper.drawSectionDivider(doc);

    PdfHelper.drawSectionHeading(doc, 'Termination Details');
    doc.text(`Termination Date:   ${terminatedDate}`);
    doc.text(`Terminated By:      ${MOCK_DATA.clientId}`);
    doc.moveDown(0.5);
    doc.font('Helvetica-Bold').text('Reason for Termination:').font('Helvetica');
    doc.text(
      'The client has decided to put the project on hold due to budget reallocation for Q3. ' +
      'All work completed to date has been satisfactory and the freelancer will be compensated accordingly.',
      { width: PdfHelper.CONTENT_W },
    ).moveDown(0.5);
    doc.font('Helvetica-Bold').text('Work Completed to Date:').font('Helvetica');
    doc.text('Design System & Component Library milestone fully delivered and approved.', { width: PdfHelper.CONTENT_W }).moveDown(0.5);
    doc.text(`Compensation Due: 1200 USD`);
    doc.moveDown(1);
    PdfHelper.drawSectionDivider(doc);

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

    doc
      .fontSize(8.5).font('Helvetica').fillColor('#6b7280')
      .text(
        `This termination notice was recorded on the MintJobs platform on ${new Date(terminatedAt).toUTCString()}. ` +
        `It is binding on both parties without a wet signature.`,
        { width: PdfHelper.CONTENT_W, align: 'center' },
      )
      .fillColor('#000000');

    PdfHelper.drawFooterOnAllPages(doc);
    doc.end();
  });
}

// ─── Completion Certificate PDF ───────────────────────────────────────────────

function generateCompletionPdf(): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = PdfHelper.createDocument();
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const completedAt = new Date().toISOString();
    const completedDate = new Date(completedAt).toLocaleDateString('en-US', {
      year: 'numeric', month: 'long', day: 'numeric',
    });

    PdfHelper.drawHeader(doc, {
      title: 'Contract Completion Certificate',
      subtitle: 'This document certifies the successful completion of the service agreement below.',
      date: completedDate,
      refId: `${CONTRACT_ID}-completion`,
    });

    PdfHelper.drawSectionHeading(doc, 'Parties');
    doc.text(`Client ID:     ${MOCK_DATA.clientId}`);
    doc.text(`Freelancer ID: ${MOCK_DATA.applicantId}`);
    doc.moveDown(1);
    PdfHelper.drawSectionDivider(doc);

    PdfHelper.drawSectionHeading(doc, 'Project Summary');
    doc.text(`Job Title:    ${MOCK_DATA.jobTitle}`);
    doc.text(`Category:     ${MOCK_DATA.jobCategory}`);
    doc.text(`Contract ID:  ${CONTRACT_ID}`);
    doc.moveDown(1);
    PdfHelper.drawSectionDivider(doc);

    PdfHelper.drawSectionHeading(doc, 'Timeline');
    doc.text(`Contract Issued:  ${new Date(MOCK_DATA.hiredAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`);
    doc.text(`Work Start Date:  ${MOCK_DATA.jobStartDate}`);
    doc.text(`Work End Date:    ${MOCK_DATA.jobEndDate}`);
    doc.text(`Completion Date:  ${completedDate}`);
    doc.moveDown(1);
    PdfHelper.drawSectionDivider(doc);

    PdfHelper.drawSectionHeading(doc, 'Payment Summary');
    doc.text(`Payment Type:  ${MOCK_DATA.paymentType}`);
    doc.text(`Total Amount:  6000 USD`);
    doc.moveDown(0.5);
    doc.font('Helvetica-Bold').text('Milestones Delivered:').moveDown(0.3);
    MOCK_DATA.milestones.forEach((m, i) => {
      doc.font('Helvetica').text(`  ${i + 1}. ${m.name} — $${m.amount}  (completed ${m.dueDate})`);
    });
    doc.moveDown(1);
    PdfHelper.drawSectionDivider(doc);

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

    doc
      .fontSize(8.5).font('Helvetica').fillColor('#6b7280')
      .text(
        `This completion certificate was issued on the MintJobs platform on ${new Date(completedAt).toUTCString()}. ` +
        `It is binding on both parties without a wet signature.`,
        { width: PdfHelper.CONTENT_W, align: 'center' },
      )
      .fillColor('#000000');

    PdfHelper.drawFooterOnAllPages(doc);
    doc.end();
  });
}

// ─── Save local copy ───────────────────────────────────────────────────────────

function saveLocal(buffer: Buffer, filename: string): string {
  const outDir  = path.join(process.cwd(), 'scripts', 'output');
  fs.mkdirSync(outDir, { recursive: true });
  const filePath = path.join(outDir, filename);
  fs.writeFileSync(filePath, buffer);
  return filePath;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function runTest(
  label: string,
  suffix: string,
  generator: () => Promise<Buffer>,
  s3Key: string,
) {
  console.log(`\n🔨  Generating ${label}...`);
  const buffer   = await generator();
  const filename = `${CONTRACT_ID}${suffix}.pdf`;
  console.log(`✅  ${label} generated — ${(buffer.length / 1024).toFixed(1)} KB`);
  const localPath = saveLocal(buffer, filename);
  console.log(`📄  Local copy → ${localPath}`);
  console.log(`☁️   Uploading to S3...`);
  const url = await uploadToS3(buffer, s3Key);
  console.log(`    S3 URL: ${url}`);
}

(async () => {
  await runTest(
    'Service Agreement',
    '',
    generatePdf,
    `contracts/${CONTRACT_ID}.pdf`,
  );

  await runTest(
    'Termination Notice',
    '-termination',
    generateTerminationPdf,
    `contracts/${CONTRACT_ID}-termination.pdf`,
  );

  await runTest(
    'Completion Certificate',
    '-completion',
    generateCompletionPdf,
    `contracts/${CONTRACT_ID}-completion.pdf`,
  );

  console.log('\n✅  All three documents generated and uploaded.\n');
})();
