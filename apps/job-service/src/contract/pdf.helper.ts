import PDFDocument from 'pdfkit';
import * as path from 'path';
import * as fs from 'fs';

export interface PdfHeaderOptions {
  title: string;
  subtitle?: string;
  date?: string;
  refId?: string;
}

/**
 * Reusable PDF layout helper for all MintJobs documents.
 *
 * Usage pattern:
 *   const doc = PdfHelper.createDocument();
 *   PdfHelper.drawHeader(doc, { title: 'My Document', ... });
 *   // ... write content using PdfHelper.drawSectionHeading / drawSectionDivider ...
 *   PdfHelper.drawFooterOnAllPages(doc);   // MUST be called before doc.end()
 *   doc.end();
 */
export class PdfHelper {
  // A4 dimensions in points
  static readonly PAGE_W = 595.28;
  static readonly PAGE_H = 841.89;
  static readonly MARGIN_H = 50;
  static readonly MARGIN_TOP = 50;
  static readonly MARGIN_BOTTOM = 62; // taller bottom margin reserves space for footer
  static readonly CONTENT_W = PdfHelper.PAGE_W - PdfHelper.MARGIN_H * 2;

  private static readonly LOGO_PATH = path.join(process.cwd(), 'assets', 'logo.png');
  private static readonly SUBTLE = '#6b7280';

  // ─────────────────────────────────────────────────────────────────────────
  // Document factory
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Create an A4 PDFDocument with buffered pages (required for footer stamping).
   */
  static createDocument(): PDFKit.PDFDocument {
    return new PDFDocument({
      size: 'A4',
      bufferPages: true,
      margins: {
        top: PdfHelper.MARGIN_TOP,
        bottom: PdfHelper.MARGIN_BOTTOM,
        left: PdfHelper.MARGIN_H,
        right: PdfHelper.MARGIN_H,
      },
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Header
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Draw the branded page header. Call once at the start of the first page.
   * Automatically advances doc.y below the header ready for content.
   */
  static drawHeader(doc: PDFKit.PDFDocument, options: PdfHeaderOptions): void {
    const { title, subtitle, date, refId } = options;
    const left = PdfHelper.MARGIN_H;
    const right = PdfHelper.PAGE_W - PdfHelper.MARGIN_H;
    const logoH = 38;
    const topY = PdfHelper.MARGIN_TOP;

    // ── Logo ────────────────────────────────────────────────────────────────
    if (fs.existsSync(PdfHelper.LOGO_PATH)) {
      doc.image(PdfHelper.LOGO_PATH, left, topY, { height: logoH });
    } else {
      // Fallback text brand if logo file is missing
      doc
        .fontSize(18)
        .font('Helvetica-Bold')
        .fillColor('#000000')
        .text('MintJobs', left, topY + 8);
    }

    // ── Document title (right-aligned, vertically centred to logo) ──────────
    doc
      .fontSize(14)
      .font('Helvetica-Bold')
      .fillColor('#111111')
      .text(title, left + 160, topY + 6, {
        width: right - left - 160,
        align: 'right',
      });

    if (subtitle) {
      doc
        .fontSize(8.5)
        .font('Helvetica')
        .fillColor(PdfHelper.SUBTLE)
        .text(subtitle, left + 160, topY + 24, {
          width: right - left - 160,
          align: 'right',
        });
    }

    // ── Bold divider ─────────────────────────────────────────────────────────
    const divY = topY + logoH + 8;
    doc
      .moveTo(left, divY)
      .lineTo(right, divY)
      .strokeColor('#111111')
      .lineWidth(1.8)
      .stroke()
      .lineWidth(1);

    // ── Metadata row (Ref / Date) ─────────────────────────────────────────────
    const metaY = divY + 7;
    doc.fontSize(7.5).font('Helvetica').fillColor(PdfHelper.SUBTLE);
    if (refId) doc.text(`Ref: ${refId}`, left, metaY);
    if (date)  doc.text(`Date: ${date}`, left, metaY, { width: PdfHelper.CONTENT_W, align: 'right' });

    // Reset state and advance cursor below header
    doc.fillColor('#000000');
    doc.y = metaY + 20;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Footer  (stamped AFTER all content, before doc.end())
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Stamp a consistent footer on every page.
   * MUST be called after all content is written and BEFORE doc.end().
   * Relies on bufferPages:true (set by createDocument).
   */
  static drawFooterOnAllPages(doc: PDFKit.PDFDocument): void {
    const range = doc.bufferedPageRange();
    const total = range.count;
    for (let i = 0; i < total; i++) {
      doc.switchToPage(range.start + i);
      PdfHelper._drawFooter(doc, i + 1, total);
    }
    // Reset cursor to the last page's top margin so pdfkit doesn't treat
    // the post-footer y position as "page full" and append blank pages.
    doc.switchToPage(range.start + total - 1);
    doc.y = doc.page.margins.top;
  }

  private static _drawFooter(
    doc: PDFKit.PDFDocument,
    pageNum: number,
    total: number,
  ): void {
    const left = PdfHelper.MARGIN_H;
    const lineY = PdfHelper.PAGE_H - PdfHelper.MARGIN_BOTTOM + 16;
    const textY = lineY + 5;

    // Thin separator line (path ops are not affected by the margin check)
    doc
      .moveTo(left, lineY)
      .lineTo(PdfHelper.PAGE_W - left, lineY)
      .strokeColor('#d1d5db')
      .lineWidth(0.5)
      .stroke()
      .lineWidth(1);

    // Zero the bottom margin so doc.text() doesn't see textY as "past maxY()"
    // and auto-add a new page for each footer text call.
    const savedBottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;

    doc.fontSize(7).font('Helvetica').fillColor(PdfHelper.SUBTLE);

    // Left — confidentiality notice
    doc.text(
      'Confidential — MintJobs Freelance Agreement',
      left,
      textY,
      { width: 230, lineBreak: false },
    );

    // Centre — website
    doc.text('mintjobs.fun', left, textY, {
      width: PdfHelper.CONTENT_W,
      align: 'center',
      lineBreak: false,
    });

    // Right — page number
    doc.text(`Page ${pageNum} of ${total}`, left, textY, {
      width: PdfHelper.CONTENT_W,
      align: 'right',
      lineBreak: false,
    });

    doc.fillColor('#000000');
    doc.page.margins.bottom = savedBottom;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Content helpers  (reusable across all document types)
  // ─────────────────────────────────────────────────────────────────────────

  /** Draw a light horizontal rule between sections. */
  static drawSectionDivider(doc: PDFKit.PDFDocument): void {
    doc
      .moveTo(PdfHelper.MARGIN_H, doc.y)
      .lineTo(PdfHelper.PAGE_W - PdfHelper.MARGIN_H, doc.y)
      .strokeColor('#e5e7eb')
      .lineWidth(0.75)
      .stroke()
      .lineWidth(1)
      .moveDown(0.8);
  }

  /** Draw a bold section heading, then reset to body font. */
  static drawSectionHeading(doc: PDFKit.PDFDocument, title: string): void {
    doc
      .fontSize(11)
      .font('Helvetica-Bold')
      .fillColor('#111111')
      .text(title.toUpperCase())
      .moveDown(0.4);
    doc.fontSize(10).font('Helvetica').fillColor('#000000');
  }

  /** Write a key/value row in the body font. */
  static drawField(doc: PDFKit.PDFDocument, label: string, value: string): void {
    doc.fontSize(10).font('Helvetica').fillColor('#000000');
    doc.text(`${label}${value}`);
  }
}
