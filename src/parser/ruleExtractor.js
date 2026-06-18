import { GoogleGenerativeAI } from "@google/generative-ai";
import { config, requireGeminiApiKey } from "../config/env.js";
import { paths } from "../config/paths.js";
import { readJson, writeJson } from "../utils/fs.js";
import { logger } from "../utils/logger.js";
import { normalizeWhitespace } from "../utils/text.js";

const safeJsonParse = (text) => {
  const withoutFence = text
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();
  return JSON.parse(withoutFence);
};

const sleep = (delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs));

const normalizeRule = (rule, fallback = {}) => ({
  section: normalizeWhitespace(rule.section || fallback.section || "Unknown section"),
  subsection: normalizeWhitespace(rule.subsection || fallback.subsection || "") || null,
  guideline_text: normalizeWhitespace(rule.guideline_text || rule.text || fallback.guideline_text || ""),
  source_page: Number(rule.source_page || fallback.source_page || 0)
});

export const validateGuidelineRule = (rule) => {
  const errors = [];

  if (!rule || typeof rule !== "object" || Array.isArray(rule)) {
    return ["Rule must be an object."];
  }
  if (!rule.section || typeof rule.section !== "string") errors.push("section is required.");
  if (rule.subsection !== null && rule.subsection !== undefined && typeof rule.subsection !== "string") {
    errors.push("subsection must be a string or null.");
  }
  if (!rule.guideline_text || typeof rule.guideline_text !== "string") {
    errors.push("guideline_text is required.");
  }
  if (!Number.isInteger(rule.source_page) || rule.source_page < 1) {
    errors.push("source_page must be a positive integer.");
  }

  return errors;
};

const validateRules = (rules) => {
  const validRules = [];
  const invalidRules = [];

  for (const [index, rule] of rules.entries()) {
    const normalized = normalizeRule(rule);
    const errors = validateGuidelineRule(normalized);
    if (errors.length) {
      invalidRules.push({ index, rule, errors });
    } else {
      validRules.push(normalized);
    }
  }

  return { validRules, invalidRules };
};

const fallbackRulesFromChunks = (chunks) =>
  chunks
    .map((chunk) =>
      normalizeRule(
        {},
        {
          section: chunk.section_title || "Unknown section",
          subsection: chunk.subsection || null,
          guideline_text: chunk.content,
          source_page: chunk.source_page
        }
      )
    )
    .filter((rule) => validateGuidelineRule(rule).length === 0);

const chunkPrompt = (chunk) => `
Convert this WaiverPro guideline text into structured compliance rules.

Return JSON only as an array. Every item must use exactly this schema:
{
  "section": "Section name or number",
  "subsection": "Subheading or null",
  "guideline_text": "One clear checkable requirement from the guide",
  "source_page": ${chunk.source_page}
}

Rules:
- Preserve the section and subsection from the source metadata.
- Split separate UI expectations into separate rules.
- Do not invent requirements not present in the text.
- source_page must be ${chunk.source_page}.

Source metadata:
${JSON.stringify({
  section: chunk.section_title,
  subsection: chunk.subsection,
  source_page: chunk.source_page
})}

Guideline text:
${chunk.content}
`;

export const extractGuidelineRules = async () => {
  const chunks = await readJson(paths.guidelineChunks, []);
  if (!chunks.length) {
    throw new Error(`No guideline chunks found at ${paths.guidelineChunks}. Run ingest first.`);
  }

  if (!config.geminiApiKey) {
    logger.warn("GEMINI_API_KEY is missing; writing fallback rules from parsed PDF chunks.");
    const fallbackRules = fallbackRulesFromChunks(chunks);
    await writeJson(paths.rules, fallbackRules);
    await writeJson(paths.guidelineRules, fallbackRules);
    return fallbackRules;
  }

  requireGeminiApiKey();
  const genAI = new GoogleGenerativeAI(config.geminiApiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
  const rules = [];
  const invalidRules = [];

  for (const [chunkIndex, chunk] of chunks.entries()) {
    try {
      const response = await model.generateContent(chunkPrompt(chunk));
      const parsed = safeJsonParse(response.response.text());

      if (!Array.isArray(parsed)) {
        throw new Error("Gemini response must be a JSON array.");
      }

      const normalized = parsed.map((rule) =>
        normalizeRule(rule, {
          section: chunk.section_title,
          subsection: chunk.subsection,
          source_page: chunk.source_page
        })
      );
      const validation = validateRules(normalized);
      rules.push(...validation.validRules);
      invalidRules.push(
        ...validation.invalidRules.map((invalid) => ({
          ...invalid,
          source_chunk_id: chunk.id
        }))
      );

      if (validation.invalidRules.length) {
        logger.warn("Some Gemini rules failed validation", {
          chunkId: chunk.id,
          invalidRules: validation.invalidRules.length
        });
      }
    } catch (error) {
      logger.warn("Rule extraction failed for chunk; using fallback rule", {
        chunkId: chunk.id,
        sourcePage: chunk.source_page,
        error: error.message
      });
      rules.push(...fallbackRulesFromChunks([chunk]));
    }

    if (config.ruleExtractionDelayMs > 0 && chunkIndex < chunks.length - 1) {
      logger.info("Waiting before next Gemini rule extraction request", {
        delayMs: config.ruleExtractionDelayMs,
        nextChunk: chunks[chunkIndex + 1]?.id
      });
      await sleep(config.ruleExtractionDelayMs);
    }
  }

  if (!rules.length) {
    throw new Error("No valid guideline rules were extracted from the PDF.");
  }

  await writeJson(paths.rules, rules);
  await writeJson(paths.guidelineRules, rules);

  if (invalidRules.length) {
    await writeJson(`${paths.rules}.invalid.json`, invalidRules);
  }

  logger.info("Guideline rules extracted", {
    rules: rules.length,
    invalidRules: invalidRules.length,
    output: paths.rules
  });

  return rules;
};
