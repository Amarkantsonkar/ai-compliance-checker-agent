import { paths } from "../config/paths.js";
import { readJson } from "../utils/fs.js";
import { logger } from "../utils/logger.js";
import { createWebsiteVectorStore } from "./vectorStoreService.js";
import { websiteSummaryToDocument } from "../summarizer/websiteSummarizer.js";

const pageToSummaryDocument = (page) => ({
  id: `website-page-${encodeURIComponent(page.page_url || page.full_url || "unknown")}`,
  text: [
    `Page: ${page.page_url || page.full_url || "unknown"}`,
    `Title: ${page.title || ""}`,
    `Screenshot: ${page.screenshot_path || ""}`
  ].join("\n"),
  metadata: {
    type: "website_page_summary",
    page_url: page.page_url || "",
    title: page.title || "",
    screenshot_path: page.screenshot_path || ""
  }
});

const componentSummaryDocuments = (components) => {
  const byPage = new Map();

  for (const component of components) {
    const pageUrl = component.page_url || "unknown";
    if (!byPage.has(pageUrl)) byPage.set(pageUrl, []);
    byPage.get(pageUrl).push(component);
  }

  return [...byPage.entries()].map(([pageUrl, pageComponents]) => {
    const notable = pageComponents
      .filter((component) => component.actual_text_content)
      .slice(0, 80)
      .map((component) => `${component.component_type}: ${component.actual_text_content}`);
    const counts = pageComponents.reduce((acc, component) => {
      acc[component.component_type] = (acc[component.component_type] || 0) + 1;
      return acc;
    }, {});

    return {
      id: `website-components-${encodeURIComponent(pageUrl)}`,
      text: [
        `Page: ${pageUrl}`,
        `Component counts: ${Object.entries(counts)
          .map(([type, count]) => `${type}=${count}`)
          .join(", ")}`,
        `Visible component evidence: ${notable.join("; ")}`
      ].join("\n"),
      metadata: {
        type: "website_component_page_summary",
        page_url: pageUrl,
        screenshot_path: pageComponents.find((component) => component.screenshot_path)?.screenshot_path || ""
      }
    };
  });
};

export const indexWebsiteSummaries = async () => {
  const [semanticSummaries, pages, components] = await Promise.all([
    readJson(paths.websiteSummaries, []),
    readJson(paths.pages, []),
    readJson(paths.components, [])
  ]);

  const documents = [
    ...semanticSummaries.map(websiteSummaryToDocument),
    ...pages.map(pageToSummaryDocument),
    ...componentSummaryDocuments(components)
  ];

  if (!documents.length) {
    throw new Error(`No website summaries found. Run crawl:pages and extract:components first.`);
  }

  const vectorStore = createWebsiteVectorStore();
  const result = await vectorStore.addDocuments(documents);
  logger.info("Website summaries indexed in ChromaDB", result);
  return { indexed: result.added, collection: result.collection };
};

export const retrieveWebsiteContext = async (query, k = 5) => {
  const vectorStore = createWebsiteVectorStore();
  return vectorStore.searchDocuments(query, { limit: k });
};
