import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { config, requireGeminiApiKey } from "../config/env.js";
import { paths } from "../config/paths.js";
import { readJson, writeJson } from "../utils/fs.js";
import { logger } from "../utils/logger.js";
import { normalizeWhitespace } from "../utils/text.js";
import { retrieveGuidelineContext } from "../embeddings/indexGuidelines.js";
import { retrieveWebsiteContext } from "../embeddings/indexWebsite.js";
import { buildDiscrepancyRecord, validateDiscrepancyRecord } from "./schema.js";

const MAX_RULES_PER_RUN = 120;
const MAX_COMPONENTS_PER_PAGE = 80;

const parseJsonResponse = (content) => {
  const text = Array.isArray(content) ? content.map((part) => part.text || "").join("") : String(content);
  return JSON.parse(
    text
      .trim()
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/```$/i, "")
      .trim()
  );
};

const ruleReference = (rule) =>
  normalizeWhitespace(
    [rule.section, rule.subsection, rule.source_page ? `Page ${rule.source_page}` : ""].filter(Boolean).join(" > ")
  );

const ruleToQuery = (rule) =>
  normalizeWhitespace([rule.section, rule.subsection, rule.guideline_text, rule.source_page].filter(Boolean).join(" "));

const isUsefulComplianceRule = (rule) => {
  const text = normalizeWhitespace(rule.guideline_text || "").toLowerCase();
  const subsection = normalizeWhitespace(rule.subsection || "").toLowerCase();

  if (!rule.section || rule.section === "Unknown section") return false;
  if (Number(rule.source_page || 0) <= 2) return false;
  if (subsection === "table of contents") return false;
  if (/^(document version|effective date|applies to)$/i.test(text)) return false;

  return Boolean(text);
};

const normalizePageUrl = (value = "") => {
  try {
    const url = new URL(value);
    return `${url.origin}${url.pathname}`.replace(/\/$/, "") || url.origin;
  } catch {
    return String(value).replace(/\/$/, "");
  }
};

const groupComponentsByPage = (components) => {
  const grouped = new Map();

  for (const component of components) {
    const pageUrl = component.page_url || "";
    if (!grouped.has(pageUrl)) grouped.set(pageUrl, []);
    grouped.get(pageUrl).push(component);
  }

  return grouped;
};

const pageEvidenceFromRetrieval = ({ websiteContext, summaries, componentsByPage }) => {
  const pageUrls = new Set();

  for (const result of websiteContext) {
    const pageUrl = result.metadata?.page_url;
    if (pageUrl) pageUrls.add(pageUrl);
  }

  if (!pageUrls.size) {
    for (const summary of summaries.slice(0, 3)) {
      if (summary.page_url) pageUrls.add(summary.page_url);
    }
  }

  return [...pageUrls].slice(0, 5).map((pageUrl) => {
    const summary = summaries.find((item) => normalizePageUrl(item.page_url) === normalizePageUrl(pageUrl)) || {};
    const components = componentsByPage.get(pageUrl) || [];

    return {
      page_url: pageUrl,
      title: summary.title || "",
      semantic_summary: summary.semantic_summary || "",
      key_elements: summary.key_elements || [],
      workflows: summary.workflows || [],
      screenshot_path: summary.screenshot_path || components[0]?.screenshot_path || null,
      components: components.slice(0, MAX_COMPONENTS_PER_PAGE).map((component) => ({
        component_type: component.component_type,
        component_selector: component.component_selector,
        actual_text_content: component.actual_text_content,
        screenshot_path: component.screenshot_path
      }))
    };
  });
};

const buildPrompt = ({ rule, guidelineContext, websiteContext, pageEvidence }) => `
Compare one official WaiverPro guideline rule against retrieved live website evidence.

Return JSON only using this exact schema:
{
  "discrepancies": [
    {
      "page_url": "URL from page_evidence only",
      "guideline_reference": "Guideline section/subsection/source page citation",
      "expected_text_content": "Expected UI text or behavior from the guideline",
      "actual_text_content": "Actual visible UI text or clear absence observed in supplied components/summaries",
      "discrepancy_flag": true,
      "discrepancy_reason": "Concrete explanation of the mismatch",
      "screenshot_path": "Screenshot path from page_evidence",
      "retrieved_at": "${new Date().toISOString()}"
    }
  ]
}

Rules:
- Never invent UI content, page URLs, screenshots, or guideline requirements.
- Only return a discrepancy when both the guideline expectation and website evidence are present enough to support it.
- If evidence is insufficient, ambiguous, unrelated, or compliant, return {"discrepancies":[]}.
- Cite the guideline using section, subsection, and source page when available.
- Cite only page URLs present in page_evidence.
- Use the screenshot_path from the cited page or component.
- Keep actual_text_content grounded in supplied component text. If a required element is absent, write "Not found in supplied UI evidence".

Guideline rule:
${JSON.stringify(
  {
    section: rule.section,
    subsection: rule.subsection,
    guideline_text: rule.guideline_text,
    source_page: rule.source_page
  },
  null,
  2
)}

Retrieved guideline sections:
${JSON.stringify(guidelineContext, null, 2)}

Retrieved website summaries:
${JSON.stringify(websiteContext, null, 2)}

Page evidence:
${JSON.stringify(pageEvidence, null, 2)}
`;

const isKnownPage = (pageUrl, pageEvidence) =>
  pageEvidence.some((page) => normalizePageUrl(page.page_url) === normalizePageUrl(pageUrl));

const knownScreenshotForPage = (pageUrl, pageEvidence) => {
  const page = pageEvidence.find((item) => normalizePageUrl(item.page_url) === normalizePageUrl(pageUrl));
  return page?.screenshot_path || page?.components?.find((component) => component.screenshot_path)?.screenshot_path || null;
};

const normalizeFinding = ({ finding, rule, pageEvidence }) => {
  if (!finding?.discrepancy_flag || !isKnownPage(finding.page_url, pageEvidence)) {
    return null;
  }

  const screenshotPath = finding.screenshot_path || knownScreenshotForPage(finding.page_url, pageEvidence);
  const record = buildDiscrepancyRecord({
    pageUrl: finding.page_url,
    guidelineReference: finding.guideline_reference || ruleReference(rule),
    expectedTextContent: finding.expected_text_content || rule.guideline_text,
    actualTextContent: finding.actual_text_content || "Not found in supplied UI evidence",
    discrepancyFlag: true,
    discrepancyReason: finding.discrepancy_reason,
    screenshotPath,
    retrievedAt: finding.retrieved_at
  });

  return validateDiscrepancyRecord(record) ? record : null;
};

const deduplicateDiscrepancies = (records) => {
  const seen = new Set();
  const unique = [];

  for (const record of records) {
    const key = [
      normalizePageUrl(record.page_url),
      record.guideline_reference,
      record.expected_text_content,
      record.actual_text_content,
      record.discrepancy_reason
    ].join("|");

    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(record);
  }

  return unique;
};

const isQuotaError = (error) =>
  /429|Too Many Requests|quota|Quota exceeded/i.test(`${error?.message || ""} ${error?.stack || ""}`);

export const compareUiToGuidelines = async () => {
  requireGeminiApiKey();

  const [rules, components, websiteSummaries] = await Promise.all([
    readJson(paths.rules, []),
    readJson(paths.components, []),
    readJson(paths.websiteSummaries, [])
  ]);

  if (!rules.length) {
    throw new Error(`No guideline rules found at ${paths.rules}. Run ingest first.`);
  }

  if (!components.length) {
    throw new Error(`No UI components found at ${paths.components}. Run extract:components first.`);
  }

  if (!websiteSummaries.length) {
    throw new Error(`No website summaries found at ${paths.websiteSummaries}. Run summarize:website first.`);
  }

  const model = new ChatGoogleGenerativeAI({
    apiKey: config.geminiApiKey,
    model: "gemini-2.5-flash",
    temperature: 0
  });

  const componentsByPage = groupComponentsByPage(components);
  const discrepancies = [];

  const usefulRules = rules.filter(isUsefulComplianceRule);

  for (const rule of usefulRules.slice(0, MAX_RULES_PER_RUN)) {
    const query = ruleToQuery(rule);
    const [guidelineContext, websiteContext] = await Promise.all([
      retrieveGuidelineContext(query, 5),
      retrieveWebsiteContext(query, 5)
    ]);

    const pageEvidence = pageEvidenceFromRetrieval({
      websiteContext,
      summaries: websiteSummaries,
      componentsByPage
    });

    if (!pageEvidence.length) {
      logger.warn("No page evidence found for guideline rule", {
        guidelineReference: ruleReference(rule)
      });
      continue;
    }

    logger.info("Comparing guideline rule to UI evidence", {
      guidelineReference: ruleReference(rule),
      pageEvidence: pageEvidence.length
    });

    let response;
    try {
      response = await model.invoke([
        [
          "system",
          "You are a conservative AI documentation compliance comparison agent. You only report discrepancies that are directly supported by provided RAG context and UI evidence."
        ],
        ["human", buildPrompt({ rule, guidelineContext, websiteContext, pageEvidence })]
      ]);
    } catch (error) {
      logger.warn("Gemini compliance comparison failed for rule", {
        guidelineReference: ruleReference(rule),
        error: error.message
      });
      if (isQuotaError(error)) {
        logger.warn("Stopping compliance comparison because Gemini quota is exhausted");
        break;
      }
      continue;
    }

    let parsed;
    try {
      parsed = parseJsonResponse(response.content);
    } catch (error) {
      logger.warn("Gemini compliance response was not valid JSON", {
        guidelineReference: ruleReference(rule),
        error: error.message
      });
      continue;
    }

    const findings = Array.isArray(parsed) ? parsed : parsed.discrepancies || [];
    for (const finding of findings) {
      const record = normalizeFinding({ finding, rule, pageEvidence });
      if (record) discrepancies.push(record);
    }
  }

  const uniqueDiscrepancies = deduplicateDiscrepancies(discrepancies);
  await writeJson(paths.discrepancies, uniqueDiscrepancies);

  logger.info("Compliance comparison completed", {
    discrepancies: uniqueDiscrepancies.length,
    rulesCompared: Math.min(usefulRules.length, MAX_RULES_PER_RUN),
    rulesSkipped: rules.length - usefulRules.length,
    output: paths.discrepancies
  });

  return uniqueDiscrepancies;
};
