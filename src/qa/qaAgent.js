import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { config, requireGeminiApiKey } from "../config/env.js";
import { paths } from "../config/paths.js";
import { readJson } from "../utils/fs.js";
import { logger } from "../utils/logger.js";
import { normalizeWhitespace } from "../utils/text.js";
import { retrieveGuidelineContext } from "../embeddings/indexGuidelines.js";
import { retrieveWebsiteContext } from "../embeddings/indexWebsite.js";

export const QA_EXAMPLE_QUESTIONS = [
  "Does the live landing page match the official guidelines?",
  "List all UI discrepancies found on the My Applications dashboard.",
  "Is the support contact information on the live site correct according to the manual?",
  "Which pages violate the documentation?",
  "Show all failed checks.",
  "Show evidence for each discrepancy."
];

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

const normalizePageUrl = (value = "") => {
  try {
    const url = new URL(value);
    return `${url.origin}${url.pathname}`.replace(/\/$/, "") || url.origin;
  } catch {
    return String(value || "").replace(/\/$/, "");
  }
};

const includesAny = (text, terms) => terms.some((term) => text.includes(term));

const questionIntent = (question) => {
  const text = question.toLowerCase();

  if (includesAny(text, ["failed checks", "all failed", "fail checks"])) return "failed_checks";
  if (includesAny(text, ["evidence", "screenshot"])) return "evidence";
  if (includesAny(text, ["which pages", "pages violate", "violate the documentation"])) return "violating_pages";
  if (includesAny(text, ["my applications", "dashboard", "applications dashboard"])) return "dashboard_discrepancies";
  if (includesAny(text, ["support", "contact"])) return "support_contact";
  if (includesAny(text, ["landing page", "live landing"])) return "landing_page_match";

  return "general";
};

const pageMatchesIntent = (pageUrl = "", intent) => {
  const normalized = normalizePageUrl(pageUrl).toLowerCase();

  if (intent === "landing_page_match") {
    return normalized === "" || normalized.endsWith("/") || normalized.includes("landing") || normalized.includes("login");
  }

  if (intent === "dashboard_discrepancies") {
    return normalized.includes("dashboard") || normalized.includes("application");
  }

  if (intent === "support_contact") {
    return normalized.includes("support") || normalized.includes("contact") || normalized.includes("help");
  }

  return true;
};

const compactDiscrepancy = (item) => ({
  page_url: item.page_url,
  guideline_reference: item.guideline_reference,
  expected_text_content: item.expected_text_content,
  actual_text_content: item.actual_text_content,
  discrepancy_flag: item.discrepancy_flag,
  discrepancy_reason: item.discrepancy_reason,
  screenshot_path: item.screenshot_path,
  retrieved_at: item.retrieved_at
});

const compactComponent = (component) => ({
  page_url: component.page_url,
  component_type: component.component_type,
  actual_text_content: component.actual_text_content,
  screenshot_path: component.screenshot_path
});

const compactSummary = (summary) => ({
  page_url: summary.page_url,
  title: summary.title,
  semantic_summary: summary.semantic_summary,
  key_elements: summary.key_elements,
  screenshot_path: summary.screenshot_path
});

const compactReport = (report) => ({
  overall: report?.overall || null,
  page_scores: (report?.page_scores || []).slice(0, 80),
  violations: (report?.violations || []).slice(0, 120)
});

const localEvidenceForQuestion = ({ question, discrepancies, components, summaries, report }) => {
  const intent = questionIntent(question);
  const query = question.toLowerCase();
  const relevantDiscrepancies = discrepancies.filter((item) => {
    if (["failed_checks", "evidence", "violating_pages"].includes(intent)) return true;
    if (!pageMatchesIntent(item.page_url, intent)) return false;

    const haystack = [
      item.page_url,
      item.guideline_reference,
      item.expected_text_content,
      item.actual_text_content,
      item.discrepancy_reason
    ]
      .join(" ")
      .toLowerCase();

    if (intent !== "general") return true;
    return query
      .split(/\s+/)
      .filter((token) => token.length > 3)
      .some((token) => haystack.includes(token));
  });

  const relevantPages = new Set(relevantDiscrepancies.map((item) => normalizePageUrl(item.page_url)));
  const relevantSummaries = summaries.filter((summary) => {
    if (relevantPages.has(normalizePageUrl(summary.page_url))) return true;
    if (intent === "general") return false;
    return pageMatchesIntent(summary.page_url, intent);
  });

  const relevantComponents = components.filter((component) => {
    if (relevantPages.has(normalizePageUrl(component.page_url))) return true;
    if (!pageMatchesIntent(component.page_url, intent)) return false;
    if (intent === "support_contact") {
      return /support|contact|email|phone|help/i.test(component.actual_text_content || "");
    }
    return ["landing_page_match", "dashboard_discrepancies"].includes(intent);
  });

  return {
    intent,
    discrepancies: relevantDiscrepancies.slice(0, 80).map(compactDiscrepancy),
    components: relevantComponents.slice(0, 80).map(compactComponent),
    summaries: relevantSummaries.slice(0, 20).map(compactSummary),
    report: compactReport(report)
  };
};

const buildPrompt = ({ question, guidelineContext, websiteContext, localEvidence }) => `
Answer the compliance question using only the supplied retrieved evidence.

Question:
${question}

Return JSON only using this exact schema:
{
  "answer": "Direct answer grounded in evidence.",
  "confidence": "high | medium | low",
  "citations": {
    "guideline_sections": ["Guideline section/subsection/source page from retrieved evidence or discrepancy records"],
    "page_urls": ["Page URLs from retrieved evidence or discrepancy records"],
    "screenshots": ["Screenshot paths from retrieved evidence or discrepancy records"]
  },
  "failed_checks": [
    {
      "page_url": "Cited page URL",
      "expected": "Expected text or behavior",
      "actual": "Actual text or observed absence",
      "reference": "Guideline reference",
      "screenshot": "Screenshot path",
      "explanation": "Mismatch explanation"
    }
  ],
  "limitations": ["Any missing evidence that prevents a stronger answer."]
}

Strict rules:
- Use retrieved evidence only.
- Never fabricate guideline requirements, UI text, page URLs, or screenshot paths.
- If evidence is insufficient, say that explicitly in answer and limitations.
- Cite guideline sections when making guideline claims.
- Cite page URLs when making live-site claims.
- Cite screenshot evidence for discrepancies.
- For "show all failed checks" or "show evidence", enumerate supplied discrepancy records.
- Include this exact disclaimer in the answer: "This is an automated compliance check, not a replacement for manual QA."

Retrieved guideline context from ChromaDB:
${JSON.stringify(guidelineContext, null, 2)}

Retrieved website context from ChromaDB:
${JSON.stringify(websiteContext, null, 2)}

Local compliance evidence:
${JSON.stringify(localEvidence, null, 2)}
`;

const citationSet = (values) => [...new Set(values.filter(Boolean).map(normalizeWhitespace).filter(Boolean))];

const discrepancyToFailedCheck = (item) => ({
  page_url: item.page_url,
  expected: item.expected_text_content,
  actual: item.actual_text_content,
  reference: item.guideline_reference,
  screenshot: item.screenshot_path,
  explanation: item.discrepancy_reason
});

const deterministicAnswerFromReport = ({ question, intent, discrepancies, report }) => {
  if (!["failed_checks", "evidence", "violating_pages"].includes(intent)) return null;
  if (!report?.overall && !discrepancies.length) return null;

  const failedChecks = discrepancies.map(discrepancyToFailedCheck);
  const violatingPages = [...new Set(discrepancies.map((item) => item.page_url).filter(Boolean))];
  const guidelineSections = citationSet(discrepancies.map((item) => item.guideline_reference));
  const screenshots = citationSet(discrepancies.map((item) => item.screenshot_path));
  const pageUrls = citationSet([
    ...violatingPages,
    ...((report?.page_scores || []).map((page) => page.page_url) || [])
  ]);
  const totalChecks = report?.overall?.total_checks ?? 0;
  const failedCount = report?.overall?.failed_checks ?? discrepancies.length;
  const violationsCount = report?.overall?.violations_count ?? discrepancies.length;

  let answer;
  if (intent === "violating_pages") {
    answer = violatingPages.length
      ? `The pages that violate the documentation are: ${violatingPages.join(", ")}. This is an automated compliance check, not a replacement for manual QA.`
      : `No pages violate the documentation in the generated compliance report. The report shows ${violationsCount} violations and ${failedCount} failed checks out of ${totalChecks} total checks. This is an automated compliance check, not a replacement for manual QA.`;
  } else if (intent === "failed_checks") {
    answer = failedChecks.length
      ? `There are ${failedChecks.length} failed checks in the generated compliance report. This is an automated compliance check, not a replacement for manual QA.`
      : `There are no failed checks in the generated compliance report. The report shows 0 failed checks out of ${totalChecks} total checks. This is an automated compliance check, not a replacement for manual QA.`;
  } else {
    answer = failedChecks.length
      ? `There are ${failedChecks.length} discrepancies with screenshot evidence in the generated compliance report. This is an automated compliance check, not a replacement for manual QA.`
      : `There are no discrepancies in the generated compliance report, so there is no discrepancy evidence to enumerate. This is an automated compliance check, not a replacement for manual QA.`;
  }

  return {
    question,
    answer,
    confidence: "high",
    citations: {
      guideline_sections: guidelineSections,
      page_urls: pageUrls,
      screenshots
    },
    failed_checks: failedChecks,
    limitations: failedChecks.length ? [] : ["No discrepancy records were present in data/reports/discrepancies.json."],
    evidence_counts: {
      guideline_context: 0,
      website_context: 0,
      discrepancies: discrepancies.length,
      components: 0,
      summaries: 0
    }
  };
};

const normalizeAnswer = ({ question, parsed, guidelineContext, websiteContext, localEvidence }) => {
  const discrepancies = localEvidence.discrepancies || [];
  const guidelineSections = citationSet([
    ...(parsed?.citations?.guideline_sections || []),
    ...discrepancies.map((item) => item.guideline_reference),
    ...guidelineContext.map((item) =>
      [item.metadata?.section_title, item.metadata?.subsection, item.metadata?.source_page ? `Page ${item.metadata.source_page}` : ""]
        .filter(Boolean)
        .join(" > ")
    )
  ]);
  const pageUrls = citationSet([
    ...(parsed?.citations?.page_urls || []),
    ...discrepancies.map((item) => item.page_url),
    ...websiteContext.map((item) => item.metadata?.page_url),
    ...localEvidence.summaries.map((item) => item.page_url)
  ]);
  const screenshots = citationSet([
    ...(parsed?.citations?.screenshots || []),
    ...discrepancies.map((item) => item.screenshot_path),
    ...websiteContext.map((item) => item.metadata?.screenshot_path),
    ...localEvidence.summaries.map((item) => item.screenshot_path)
  ]);

  const failedChecks =
    Array.isArray(parsed?.failed_checks) && parsed.failed_checks.length
      ? parsed.failed_checks
      : discrepancies.map((item) => ({
          page_url: item.page_url,
          expected: item.expected_text_content,
          actual: item.actual_text_content,
          reference: item.guideline_reference,
          screenshot: item.screenshot_path,
          explanation: item.discrepancy_reason
        }));

  const answer =
    parsed?.answer ||
    "There is not enough retrieved evidence to answer this question. This is an automated compliance check, not a replacement for manual QA.";

  return {
    question,
    answer,
    confidence: parsed?.confidence || (discrepancies.length ? "medium" : "low"),
    citations: {
      guideline_sections: guidelineSections,
      page_urls: pageUrls,
      screenshots
    },
    failed_checks: failedChecks,
    limitations: Array.isArray(parsed?.limitations) ? parsed.limitations : [],
    evidence_counts: {
      guideline_context: guidelineContext.length,
      website_context: websiteContext.length,
      discrepancies: discrepancies.length,
      components: localEvidence.components.length,
      summaries: localEvidence.summaries.length
    }
  };
};

export const formatQaAnswerMarkdown = (result) => {
  const lines = [
    `Question: ${result.question}`,
    "",
    result.answer,
    "",
    `Confidence: ${result.confidence}`,
    "",
    "Guideline citations:",
    ...(result.citations.guideline_sections.length
      ? result.citations.guideline_sections.map((item) => `- ${item}`)
      : ["- No guideline citation available in retrieved evidence."]),
    "",
    "Page citations:",
    ...(result.citations.page_urls.length ? result.citations.page_urls.map((item) => `- ${item}`) : ["- No page citation available."]),
    "",
    "Screenshot evidence:",
    ...(result.citations.screenshots.length
      ? result.citations.screenshots.map((item) => `- ${item}`)
      : ["- No screenshot evidence available."])
  ];

  if (result.failed_checks.length) {
    lines.push("", "Failed checks:");
    for (const check of result.failed_checks) {
      lines.push(
        "",
        `- Page: ${check.page_url}`,
        `  Expected: ${check.expected}`,
        `  Actual: ${check.actual}`,
        `  Reference: ${check.reference}`,
        `  Screenshot: ${check.screenshot}`,
        `  Explanation: ${check.explanation}`
      );
    }
  }

  if (result.limitations.length) {
    lines.push("", "Limitations:", ...result.limitations.map((item) => `- ${item}`));
  }

  return `${lines.join("\n")}\n`;
};

export const answerComplianceQuestion = async (question) => {
  const normalizedQuestion = normalizeWhitespace(question);
  if (!normalizedQuestion) {
    throw new Error("question is required.");
  }

  const intent = questionIntent(normalizedQuestion);
  if (["failed_checks", "evidence", "violating_pages"].includes(intent)) {
    const [discrepancies, report] = await Promise.all([
      readJson(paths.discrepancies, []),
      readJson(paths.jsonReport, null)
    ]);
    const deterministicAnswer = deterministicAnswerFromReport({
      question: normalizedQuestion,
      intent,
      discrepancies,
      report
    });
    if (deterministicAnswer) {
      logger.info("Compliance Q&A answered from report without Gemini", {
        question: normalizedQuestion,
        intent,
        evidenceCounts: deterministicAnswer.evidence_counts
      });
      return deterministicAnswer;
    }
  }

  requireGeminiApiKey();

  const [discrepancies, components, summaries, report, guidelineContext, websiteContext] = await Promise.all([
    readJson(paths.discrepancies, []),
    readJson(paths.components, []),
    readJson(paths.websiteSummaries, []),
    readJson(paths.jsonReport, null),
    retrieveGuidelineContext(normalizedQuestion, 8),
    retrieveWebsiteContext(normalizedQuestion, 8)
  ]);

  const localEvidence = localEvidenceForQuestion({
    question: normalizedQuestion,
    discrepancies,
    components,
    summaries,
    report
  });

  const model = new ChatGoogleGenerativeAI({
    apiKey: config.geminiApiKey,
    model: "gemini-2.5-flash",
    temperature: 0
  });

  const response = await model.invoke([
    [
      "system",
      "You are a conservative compliance Q&A agent. You answer only from supplied RAG context, discrepancy records, website summaries, UI components, reports, and screenshot evidence."
    ],
    ["human", buildPrompt({ question: normalizedQuestion, guidelineContext, websiteContext, localEvidence })]
  ]);

  let parsed;
  try {
    parsed = parseJsonResponse(response.content);
  } catch (error) {
    logger.warn("Gemini QA response was not valid JSON; returning evidence summary", {
      question: normalizedQuestion,
      error: error.message
    });
    parsed = {
      answer:
        "The retrieved evidence is available, but the model response could not be parsed. Review the cited failed checks and evidence below. This is an automated compliance check, not a replacement for manual QA.",
      confidence: "low",
      citations: {},
      failed_checks: [],
      limitations: ["The model response was not valid JSON."]
    };
  }

  const result = normalizeAnswer({
    question: normalizedQuestion,
    parsed,
    guidelineContext,
    websiteContext,
    localEvidence
  });

  logger.info("Compliance Q&A answered", {
    question: normalizedQuestion,
    confidence: result.confidence,
    evidenceCounts: result.evidence_counts
  });

  return result;
};
