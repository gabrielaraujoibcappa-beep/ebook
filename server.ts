import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import PDFDocument from "pdfkit";
import { Document, Packer, Paragraph, TextRun, HeadingLevel, ImageRun, AlignmentType } from "docx";
import epub from "epub-gen-memory";
import { marked } from "marked";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper to strip markdown for plain text exports
const stripMarkdown = (text: string) => {
  return text
    .replace(/^#+\s+/gm, '') // Remove headers
    .replace(/[*_]{1,3}/g, '') // Remove bold/italic
    .replace(/\[(.*?)\]\(.*?\)/g, '$1') // Remove links
    .replace(/`{1,3}.*?`{1,3}/gs, '') // Remove code blocks
    .replace(/^\s*[-*+]\s+/gm, '• ') // Convert lists to bullets
    .replace(/\n{3,}/g, '\n\n') // Normalize multiple newlines
    .trim();
};

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '50mb' }));

  // API Routes
  app.post("/api/export/pdf", async (req, res) => {
    const { title, subtitle, author, dedication, logo, coverImage, chapters } = req.body;
    const doc = new PDFDocument({
      margin: 50,
      size: 'A4',
      bufferPages: true
    });
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${title || 'ebook'}.pdf"`);
    
    doc.pipe(res);
    
    const year = new Date().getFullYear();
    const city = "Goiânia";

    // --- PAGE 1: COVER ---
    if (coverImage) {
      try {
        const coverBuffer = Buffer.from(coverImage.split(',')[1], 'base64');
        doc.image(coverBuffer, 0, 0, { width: doc.page.width, height: doc.page.height });
      } catch (e) {
        console.error("Failed to add cover image to PDF", e);
      }
    } else {
      doc.moveDown(10);
      doc.font('Times-Italic').fontSize(18).text(author, { align: 'center' });
      doc.moveDown(4);
      const titleSize = title.length > 20 ? 36 : 48;
      doc.font('Helvetica-Bold').fontSize(titleSize).text(title.toUpperCase(), { align: 'center', lineGap: 10 });
      if (subtitle) {
        doc.font('Helvetica').fontSize(20).text(subtitle.toUpperCase(), { align: 'center' });
      }
      
      if (logo) {
        try {
          const logoBuffer = Buffer.from(logo.split(',')[1], 'base64');
          doc.image(logoBuffer, doc.page.width / 2 - 40, doc.page.height - 150, { width: 80 });
        } catch (e) {}
      }
    }
    doc.addPage();

    // --- PAGE 2: BLANK ---
    doc.addPage();

    // --- PAGE 3: TITLE PAGE ---
    doc.font('Times-Italic').fontSize(18).text(author, { align: 'center' });
    doc.moveDown(6);
    const titleSize = title.length > 20 ? 36 : 48;
    doc.font('Helvetica-Bold').fontSize(titleSize).text(title.toUpperCase(), { align: 'center' });
    if (subtitle) {
      doc.font('Helvetica').fontSize(20).text(subtitle.toUpperCase(), { align: 'center' });
    }
    
    // Position city/year at the bottom
    doc.font('Helvetica').fontSize(14).text(`${city}, ${year}`, 0, doc.page.height - 100, { align: 'center' });
    doc.addPage();

    // --- PAGE 4: COPYRIGHT ---
    doc.font('Helvetica').fontSize(10);
    doc.text(`© ${year} – ${author.toUpperCase()}`, { align: 'left' });
    doc.text(`Todos os direitos reservados.`, { align: 'left' });
    doc.moveDown(2);
    doc.text(`Dados internacionais de catalogação na publicação (CIP)`, { align: 'left' });
    doc.moveTo(50, doc.y).lineTo(450, doc.y).stroke();
    doc.moveDown();
    doc.text(`${author.split(' ').reverse().join(', ')}`, { align: 'left' });
    doc.text(`${title}: ${subtitle || ''} [livro eletrônico] / ${author}. – 1. Ed. – ${city}: Editora Pro, ${year}.`, { align: 'left' });
    doc.moveDown();
    doc.text(`ISBN: 978-00-000000-0-0 (livro digital)`, { align: 'left' });
    doc.moveDown(2);
    doc.text(`Proibida a reprodução total ou parcial sem permissão expressa do Editor.`, { align: 'left' });
    doc.addPage();

    // --- PAGE 5: DEDICATION ---
    if (dedication) {
      doc.moveDown(12);
      doc.font('Times-Italic').fontSize(16).text(dedication, { align: 'center', width: 400 });
      doc.addPage();
    }

    // --- PAGE 6: SUMÁRIO (Placeholder) ---
    const summaryPageIdx = doc.bufferedPageRange().count - 1;
    doc.font('Helvetica-Bold').fontSize(24).text('Sumário', { align: 'left' });
    doc.moveDown();
    doc.addPage();

    // --- CHAPTERS ---
    const chapterPageStarts: number[] = [];
    chapters.forEach((chapter: any, i: number) => {
      chapterPageStarts.push(doc.bufferedPageRange().count);
      
      // Chapter Header
      doc.font('Helvetica-Bold').fontSize(22).text(`${i + 1}  ${chapter.title.toUpperCase()}`, { align: 'left' });
      doc.moveDown(2);
      
      // Content with better paragraph handling
      const content = stripMarkdown(chapter.content);
      const paragraphs = content.split('\n\n');
      
      paragraphs.forEach(p => {
        if (p.trim()) {
          doc.font('Times-Roman').fontSize(12).text(p.trim(), {
            align: 'justify',
            lineGap: 4,
            paragraphGap: 10
          });
        }
      });
      
      doc.addPage();
    });

    // --- FILL SUMMARY ---
    doc.switchToPage(summaryPageIdx);
    doc.font('Helvetica').fontSize(12);
    chapters.forEach((chapter: any, i: number) => {
      const pageNum = chapterPageStarts[i];
      doc.text(`${i + 1}  ${chapter.title.toUpperCase()}`, { continued: true });
      doc.text(` ${'.'.repeat(60)} ${pageNum}`, { align: 'right' });
      doc.moveDown(0.5);
    });

    // --- ADD FOOTERS TO ALL PAGES ---
    const range = doc.bufferedPageRange();
    for (let i = 1; i < range.count; i++) { // Skip cover
      doc.switchToPage(i);
      doc.font('Helvetica').fontSize(9).text(
        `[ ${i + 1} ]`,
        0,
        doc.page.height - 40,
        { align: 'center' }
      );
    }
    
    doc.end();
  });

  app.post("/api/export/docx", async (req, res) => {
    const { title, subtitle, author, dedication, logo, coverImage, chapters } = req.body;
    
    const children: any[] = [];

    // --- COVER ---
    if (coverImage) {
      try {
        children.push(new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new ImageRun({
              data: Buffer.from(coverImage.split(',')[1], 'base64') as any,
              transformation: { width: 595, height: 842 }, // A4 size approx
            } as any),
          ],
        }));
      } catch (e) {}
    } else {
      children.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: author, italics: true, size: 36 })],
          spacing: { after: 2000 },
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: title.toUpperCase(), bold: true, size: 120 })],
        })
      );

      if (subtitle) {
        children.push(new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: subtitle.toUpperCase(), size: 48 })],
          spacing: { after: 2000 },
        }));
      }

      if (logo) {
        try {
          children.push(new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new ImageRun({
                data: Buffer.from(logo.split(',')[1], 'base64') as any,
                transformation: { width: 100, height: 100 },
              } as any),
            ],
            spacing: { before: 2000 },
          }));
        } catch (e) {}
      }
    }

    // --- TITLE PAGE ---
    children.push(
      new Paragraph({ pageBreakBefore: true, alignment: AlignmentType.CENTER, children: [new TextRun({ text: author, italics: true, size: 36 })], spacing: { before: 1000 } }),
      new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: title.toUpperCase(), bold: true, size: 120 })] }),
      new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: `${new Date().getFullYear()}`, size: 28 })], spacing: { before: 4000 } })
    );

    // --- DEDICATION ---
    if (dedication) {
      children.push(new Paragraph({
        pageBreakBefore: true,
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: dedication, italics: true, size: 32 })],
        spacing: { before: 4000 },
      }));
    }

    // --- CHAPTERS ---
    chapters.forEach((chapter: any, i: number) => {
      children.push(
        new Paragraph({
          text: `${i + 1}  ${chapter.title.toUpperCase()}`,
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 400, after: 400 },
          pageBreakBefore: true,
        }),
        new Paragraph({
          alignment: AlignmentType.JUSTIFIED,
          children: [new TextRun({ text: stripMarkdown(chapter.content), size: 24 })],
        })
      );
    });

    const doc = new Document({
      sections: [{
        properties: {
          page: {
            pageNumbers: {
              start: 1,
            }
          }
        },
        children: children,
      }],
    });

    const buffer = await Packer.toBuffer(doc);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${title || 'ebook'}.docx"`);
    res.send(buffer);
  });

  app.post("/api/export/epub", async (req, res) => {
    const { title, subtitle, author, dedication, logo, coverImage, chapters } = req.body;
    
    const options: any = {
      title: title,
      author: author,
      description: subtitle || '',
    };

    if (coverImage) {
      options.cover = coverImage;
    } else if (logo) {
      options.cover = logo;
    }

    const content = [];

    if (dedication) {
      content.push({
        title: 'Dedicatória',
        data: `<div style="text-align: center; margin-top: 100px; font-style: italic;">${dedication}</div>`
      });
    }

    chapters.forEach((c: any, i: number) => {
      content.push({
        title: c.title,
        data: `<h1>${i + 1}  ${c.title.toUpperCase()}</h1><div>${marked.parse(c.content)}</div>`
      });
    });

    try {
      const buffer = await epub(options, content);
      res.setHeader('Content-Type', 'application/epub+zip');
      res.setHeader('Content-Disposition', `attachment; filename="${title || 'ebook'}.epub"`);
      res.send(buffer);
    } catch (error) {
      console.error("EPUB generation error:", error);
      res.status(500).send("Failed to generate EPUB");
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
