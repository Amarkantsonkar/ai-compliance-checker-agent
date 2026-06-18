import path from "node:path";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { config, requireGeminiApiKey } from "../config/env.js";
import { paths } from "../config/paths.js";
import { ensureDir, readJson, writeJson, writeText } from "../utils/fs.js";
import { logger } from "../utils/logger.js";
import { normalizeWhitespace, slugify } from "../utils/text.js";
import { createWebsiteVectorStore } from "../embeddings/vectorStoreService.js";

const safeJsonParse = (text) =>
  JSON.parse(
    text
      .trim()
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/```$/i, "")
      .trim()
  );

const groupComponentsByPage = (components) => {
  const grouped = new Map();

  for (const component of components) {
    const pageUrl = component.page_url || "/";
    if (!grouped.has(pageUrl)) grouped.set(pageUrl, []);
    grouped.get(pageUrl).push(component);
  }

  return grouped;
};

const compactComponents = (components) =>
  components.slice(0, 180).map((component) => ({
    component_type: component.component_type,
    component_selector: component.component_selector,
    actual_text_content: component.actual_text_content,
    screenshot_path: component.screenshot_path
  }));

const fallbackSummary = ({ page, pageUrl, components }) => {
  const byType = components.reduce((acc, component) => {
    acc[component.component_type] = (acc[component.component_type] || 0) + 1;
    return acc;
  }, {});
  const notable = components
    .filter((component) => component.actual_text_content)
    .slice(0, 12)
    .map((component) => `${component.component_type}: ${component.actual_text_content}`);

  return {
    page_url: pageUrl,
    title: page?.title || "",
    semantic_summary: normalizeWhitespace(
      `Page ${pageUrl} contains ${Object.entries(byType)
        .map(([type, count]) => `${count} ${type}`)
        .join(", ")}. Notable visible content includes ${notable.join("; ")}.`
    ),
    key_elements: notable,
    workflows: [],
    forms: components
      .filter((component) => component.component_type === "input")
      .map((component) => component.actual_text_content || component.component_selector),
    tables: components
      .filter((component) => component.component_type === "table")
      .map((component) => component.actual_text_content || component.component_selector),
    screenshot_path: page?.screenshot_path || components[0]?.screenshot_path || null,
    generated_at: new Date().toISOString()
  };
};

const promptForPage = ({ page, pageUrl, components }) => `
Summarize this WaiverPro web application page from extracted UI components.

Return JSON only using this schema:
{
  "page_url": "${pageUrl}",
  "title": "${page?.title || ""}",
  "semantic_summary": "Concise semantic description of what the page contains and supports.",
  "key_elements": ["Important visible buttons, links, inputs, tables, cards, navigation items, or modals."],
  "workflows": ["Likely user actions supported by this page."],
  "forms": ["Inputs/search/filter fields and their purpose."],
  "tables": ["Tables or tabular content visible on the page."],
  "screenshot_path": "${page?.screenshot_path || components[0]?.screenshot_path || ""}"
}

Guidance:
- Use only the provided UI components.
- Mention meaningful controls such as Create Application button, Search input, Applications table, and Filters when present.
- Do not invent hidden product behavior.
- Keep the summary useful for semantic retrieval.

Components:
${JSON.stringify(compactComponents(components), null, 2)}
`;

export const websiteSummaryToDocument = (summary) => ({
  id: `website-summary-${encodeURIComponent(summary.page_url || "unknown")}`,
  text: [
    `Page: ${summary.page_url}`,
    `Title: ${summary.title || ""}`,
    `Summary: ${summary.semantic_summary || ""}`,
    `Key elements: ${(summary.key_elements || []).join("; ")}`,
    `Workflows: ${(summary.workflows || []).join("; ")}`,
    `Forms: ${(summary.forms || []).join("; ")}`,
    `Tables: ${(summary.tables || []).join("; ")}`
  ].join("\n"),
  metadata: {
    type: "website_semantic_summary",
    page_url: summary.page_url || "",
    title: summary.title || "",
    screenshot_path: summary.screenshot_path || ""
  }
});

export const summarizeWebsiteComponents = async ({ index = true } = {}) => {
  requireGeminiApiKey();
  await ensureDir(paths.summaries);

  const [components, pages] = await Promise.all([
    readJson(paths.components, []),
    readJson(paths.pages, [])
  ]);

  if (!components.length) {
    throw new Error(`No UI components found at ${paths.components}. Run extract:components first.`);
  }

  const pagesByUrl = new Map(pages.map((page) => [page.page_url, page]));
  const componentsByPage = groupComponentsByPage(components);
  const model = new GoogleGenerativeAI(config.geminiApiKey).getGenerativeModel({
    model: "gemini-2.5-flash"
  });

  const summaries = [];

  for (const [pageUrl, pageComponents] of componentsByPage.entries()) {
    const page = pagesByUrl.get(pageUrl) || {
      page_url: pageUrl,
      title: "",
      screenshot_path: pageComponents[0]?.screenshot_path || null
    };

    logger.info("Generating website semantic summary", {
      pageUrl,
      components: pageComponents.length
    });

    let summary;
    try {
      const response = await model.generateContent(promptForPage({ page, pageUrl, components: pageComponents }));
      summary = safeJsonParse(response.response.text());
    } catch (error) {
      logger.warn("Gemini website summary failed; using deterministic fallback", {
        pageUrl,
        error: error.message
      });
      summary = fallbackSummary({ page, pageUrl, components: pageComponents });
    }

    const normalizedSummary = {
      page_url: pageUrl,
      title: normalizeWhitespace(summary.title || page.title || ""),
      semantic_summary: normalizeWhitespace(summary.semantic_summary || ""),
      key_elements: Array.isArray(summary.key_elements) ? summary.key_elements.map(normalizeWhitespace).filter(Boolean) : [],
      workflows: Array.isArray(summary.workflows) ? summary.workflows.map(normalizeWhitespace).filter(Boolean) : [],
      forms: Array.isArray(summary.forms) ? summary.forms.map(normalizeWhitespace).filter(Boolean) : [],
      tables: Array.isArray(summary.tables) ? summary.tables.map(normalizeWhitespace).filter(Boolean) : [],
      screenshot_path: summary.screenshot_path || page.screenshot_path || pageComponents[0]?.screenshot_path || null,
      component_count: pageComponents.length,
      generated_at: new Date().toISOString()
    };

    summaries.push(normalizedSummary);

    const markdownPath = path.join(paths.summaries, `website-${slugify(pageUrl) || "root"}.md`);
    await writeText(
      markdownPath,
      [
        `# ${normalizedSummary.title || normalizedSummary.page_url}`,
        "",
        `Page: ${normalizedSummary.page_url}`,
        `Screenshot: ${normalizedSummary.screenshot_path || ""}`,
        "",
        normalizedSummary.semantic_summary,
        "",
        "## Key Elements",
        ...normalizedSummary.key_elements.map((item) => `- ${item}`),
        "",
        "## Workflows",
        ...normalizedSummary.workflows.map((item) => `- ${item}`),
        "",
        "## Forms",
        ...normalizedSummary.forms.map((item) => `- ${item}`),
        "",
        "## Tables",
        ...normalizedSummary.tables.map((item) => `- ${item}`),
        ""
      ].join("\n")
    );
  }

  await writeJson(paths.websiteSummaries, summaries);

  let indexingResult = null;
  if (index) {
    const vectorStore = createWebsiteVectorStore();
    indexingResult = await vectorStore.addDocuments(summaries.map(websiteSummaryToDocument));
  }

  logger.info("Website summaries generated", {
    summaries: summaries.length,
    output: paths.websiteSummaries,
    indexed: indexingResult?.added || 0
  });

  return {
    summaries,
    indexed: indexingResult?.added || 0,
    collection: indexingResult?.collection || null
  };
};
