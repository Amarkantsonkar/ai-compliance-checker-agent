import fs from "node:fs/promises";
import pdf from "pdf-parse/lib/pdf-parse.js";
import { paths } from "../config/paths.js";
import { normalizeWhitespace } from "../utils/text.js";
import { writeJson, writeText } from "../utils/fs.js";
import { logger } from "../utils/logger.js";

const PDF_HEADER = "%PDF";

const assertValidPdfBuffer = (buffer, pdfPath) => {
  if (!buffer?.length) {
    const error = new Error(`PDF is empty: ${pdfPath}`);
    error.code = "EMPTY_PDF";
    throw error;
  }

  const header = buffer.subarray(0, 4).toString("utf8");
  if (header !== PDF_HEADER) {
    const error = new Error(`Malformed PDF: expected %PDF header at ${pdfPath}`);
    error.code = "MALFORMED_PDF";
    throw error;
  }
};

const createPageRenderer = () => {
  let pageNumber = 0;

  return async (pageData) => {
    pageNumber += 1;
    const textContent = await pageData.getTextContent({
      normalizeWhitespace: false,
      disableCombineTextItems: false
    });

    const lines = new Map();
    for (const item of textContent.items) {
      const y = Math.round(item.transform[5]);
      const existing = lines.get(y) || [];
      existing.push({
        x: item.transform[4],
        text: item.str
      });
      lines.set(y, existing);
    }

    const pageText = [...lines.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([, items]) =>
        normalizeWhitespace(
          items
            .sort((a, b) => a.x - b.x)
            .map((item) => item.text)
            .join(" ")
        )
      )
      .filter(Boolean)
      .join("\n");

    return `\n\n[[PAGE ${pageNumber}]]\n${pageText}`;
  };
};

const splitPages = (text) => {
  const pages = [];
  const pagePattern = /\[\[PAGE\s+(\d+)]]\n([\s\S]*?)(?=\n\n\[\[PAGE\s+\d+]]|$)/g;
  let match;

  while ((match = pagePattern.exec(text)) !== null) {
    pages.push({
      page_number: Number(match[1]),
      text: match[2].trim()
    });
  }

  return pages;
};

const detectHeading = (line) => {
  const normalized = normalizeWhitespace(line);
  if (!normalized) return null;

  const sectionMatch = normalized.match(/^SECTION\s+(\d+)(?:\s+(.+))?$/i);
  if (sectionMatch) {
    return {
      type: "section",
      number: sectionMatch[1],
      title: normalizeWhitespace(sectionMatch[2] || "")
    };
  }

  if (/^[A-Z][A-Za-z0-9 &,—'/?-]{2,80}$/.test(normalized) && normalized.length < 90) {
    return {
      type: "heading",
      title: normalized
    };
  }

  return null;
};

const buildStructuredPages = (pages) => {
  let currentSection = null;
  let currentSubsection = null;

  return pages.map((page) => {
    const blocks = [];
    const lines = page.text.split("\n").map(normalizeWhitespace).filter(Boolean);

    for (const line of lines) {
      const heading = detectHeading(line);
      if (heading?.type === "section") {
        currentSection = heading.title
          ? `Section ${heading.number}: ${heading.title}`
          : `Section ${heading.number}`;
        currentSubsection = null;
        blocks.push({
          type: "section",
          text: currentSection,
          source_page: page.page_number
        });
        continue;
      }

      if (heading?.type === "heading") {
        currentSubsection = heading.title;
        blocks.push({
          type: "heading",
          text: currentSubsection,
          section: currentSection,
          source_page: page.page_number
        });
        continue;
      }

      blocks.push({
        type: "paragraph",
        text: line,
        section: currentSection,
        subsection: currentSubsection,
        source_page: page.page_number
      });
    }

    return {
      page_number: page.page_number,
      section: currentSection,
      subsection: currentSubsection,
      text: page.text,
      blocks
    };
  });
};

const buildChunks = (structuredPages, pdfPath) =>
  structuredPages.flatMap((page) => {
    const chunks = [];
    let currentSection = page.section || "Unknown section";
    let currentSubsection = page.subsection || null;
    let buffer = [];

    const flush = () => {
      const content = buffer.join("\n").trim();
      if (!content) return;
      chunks.push({
        id: `guideline-page-${page.page_number}-chunk-${chunks.length + 1}`,
        chunk_index: chunks.length,
        section_number: currentSection?.match(/Section\s+(\d+)/i)?.[1] || null,
        section_title: currentSection || "Unknown section",
        subsection: currentSubsection,
        source_page: page.page_number,
        content,
        source_path: pdfPath
      });
      buffer = [];
    };

    for (const block of page.blocks) {
      if (block.type === "section") {
        flush();
        currentSection = block.text;
        currentSubsection = null;
      } else if (block.type === "heading") {
        flush();
        currentSubsection = block.text;
      } else {
        buffer.push(block.text);
      }
    }
    flush();

    return chunks;
  });

export const parseGuidelinesPdf = async (pdfPath) => {
  logger.info("Parsing guideline PDF", { pdfPath });

  let buffer;
  try {
    buffer = await fs.readFile(pdfPath);
    assertValidPdfBuffer(buffer, pdfPath);
  } catch (error) {
    logger.error("Unable to read guideline PDF", {
      pdfPath,
      code: error.code,
      error: error.message
    });
    throw error;
  }

  let parsed;
  try {
    parsed = await pdf(buffer, {
      pagerender: createPageRenderer(),
      max: 0
    });
  } catch (error) {
    logger.error("PDF parsing failed", {
      pdfPath,
      error: error.message
    });
    const wrapped = new Error(`Malformed or unreadable PDF: ${pdfPath}. ${error.message}`);
    wrapped.cause = error;
    throw wrapped;
  }

  const rawText = parsed.text.replace(/\u0000/g, "").trim();
  const pages = splitPages(rawText);

  if (!pages.length) {
    throw new Error(`No text pages were extracted from PDF: ${pdfPath}`);
  }

  const structuredPages = buildStructuredPages(pages);
  const chunks = buildChunks(structuredPages, pdfPath).map((chunk, index) => ({
    ...chunk,
    id: `guideline-chunk-${index + 1}`,
    chunk_index: index
  }));

  await writeText(paths.rawGuidelineText, rawText);
  await writeJson(paths.guidelinePages, structuredPages);
  await writeJson(paths.guidelineChunks, chunks);

  logger.info("Guideline PDF parsed", {
    pages: structuredPages.length,
    chunks: chunks.length,
    textLength: rawText.length,
    pagesOutput: paths.guidelinePages,
    chunksOutput: paths.guidelineChunks
  });

  return {
    rawText,
    pages: structuredPages,
    chunks,
    metadata: {
      page_count: parsed.numpages,
      info: parsed.info || {}
    }
  };
};
