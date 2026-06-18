import express from "express";
import fs from "node:fs";
import path from "node:path";
import { config } from "./config/env.js";
import { paths } from "./config/paths.js";
import { notFound, errorMiddleware } from "./middleware/errorMiddleware.js";
import { parseGuidelinesPdf } from "./parser/pdfParser.js";
import { extractGuidelineRules } from "./parser/ruleExtractor.js";
import { indexGuidelines } from "./embeddings/indexGuidelines.js";
import { indexWebsiteSummaries } from "./embeddings/indexWebsite.js";
import { deleteDocuments, searchDocuments } from "./embeddings/vectorStoreService.js";
import { summarizeGuidelines } from "./summarizer/guidelineSummarizer.js";
import { summarizeWebsiteComponents } from "./summarizer/websiteSummarizer.js";
import { crawlWaiverPro } from "./crawler/crawler.js";
import { crawlWebsitePages } from "./crawler/websiteCrawler.js";
import { extractCanonicalComponents } from "./crawler/canonicalExtractor.js";
import { compareUiToGuidelines } from "./compliance/complianceAgent.js";
import { answerComplianceQuestion, QA_EXAMPLE_QUESTIONS } from "./qa/qaAgent.js";
import { generateComplianceReport } from "./reports/reportWriter.js";
import { readJson, readText } from "./utils/fs.js";
import { logger } from "./utils/logger.js";

const toScreenshotUrl = (screenshotPath) => {
  if (!screenshotPath) return null;
  const normalized = String(screenshotPath).replaceAll("\\", "/");
  const marker = "/screenshots/";
  const markerIndex = normalized.lastIndexOf(marker);
  if (markerIndex >= 0) return normalized.slice(markerIndex);
  return `/screenshots/${path.basename(normalized)}`;
};

const summarizeArtifacts = async () => {
  const [pages, components, rules, summaries, discrepancies, report, crawlCoverage] = await Promise.all([
    readJson(paths.pages, []),
    readJson(paths.components, []),
    readJson(paths.rules, []),
    readJson(paths.websiteSummaries, []),
    readJson(paths.discrepancies, []),
    readJson(paths.jsonReport, null),
    readJson(paths.crawlCoverage, null)
  ]);

  const screenshots = fs.existsSync(paths.screenshots)
    ? fs.readdirSync(paths.screenshots).filter((file) => /\.(png|jpg|jpeg|webp)$/i.test(file)).length
    : 0;

  return {
    generated_at: new Date().toISOString(),
    counts: {
      pages: pages.length,
      components: components.length,
      rules: rules.length,
      summaries: summaries.length,
      discrepancies: discrepancies.length,
      screenshots
    },
    report_overall: report?.overall || null,
    crawl_coverage: crawlCoverage || null
  };
};

export const createServer = () => {
  const app = express();
  app.use(express.json({ limit: "2mb" }));
  app.use("/screenshots", express.static(paths.screenshots));

  app.get("/health", (req, res) => {
    res.json({
      status: "ok",
      service: "ai-documentation-compliance-agent",
      timestamp: new Date().toISOString()
    });
  });

  app.post("/api/ingest", async (req, res, next) => {
    try {
      const pdfPath = req.body?.pdfPath || config.guidelinesPdfPath;
      const parsed = await parseGuidelinesPdf(pdfPath);
      const rules = await extractGuidelineRules();
      res.json({ chunks: parsed.chunks.length, rules: rules.length });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/index", async (req, res, next) => {
    try {
      res.json(await indexGuidelines());
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/index/website", async (req, res, next) => {
    try {
      res.json(await indexWebsiteSummaries());
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/vector/search", async (req, res, next) => {
    try {
      const { collectionName, query, limit, where, whereDocument } = req.body || {};
      res.json({
        results: await searchDocuments(collectionName, query, { limit, where, whereDocument })
      });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/vector/delete", async (req, res, next) => {
    try {
      const { collectionName, ids, where, whereDocument } = req.body || {};
      res.json(await deleteDocuments(collectionName, { ids, where, whereDocument }));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/summarize", async (req, res, next) => {
    try {
      const summary = await summarizeGuidelines();
      res.json({ summary });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/summarize/website", async (req, res, next) => {
    try {
      const result = await summarizeWebsiteComponents({ index: req.body?.index !== false });
      res.json({
        summaries: result.summaries.length,
        indexed: result.indexed,
        collection: result.collection
      });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/crawl", async (req, res, next) => {
    try {
      const states = await crawlWaiverPro();
      res.json({ states: states.length });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/crawl/pages", async (req, res, next) => {
    try {
      res.json(await crawlWebsitePages());
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/extract/components", async (req, res, next) => {
    try {
      const components = await extractCanonicalComponents();
      res.json({ components: components.length });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/compare", async (req, res, next) => {
    try {
      const discrepancies = await compareUiToGuidelines();
      res.json({ discrepancies });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/report", async (req, res, next) => {
    try {
      const result = await generateComplianceReport();
      if (req.body?.format === "json") {
        res.json({
          report: result.report,
          paths: result.paths
        });
        return;
      }
      res.type("text/markdown").send(result.markdown);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/ask", async (req, res, next) => {
    try {
      if (!req.body?.question) {
        res.status(400).json({ error: { message: "question is required", statusCode: 400 } });
        return;
      }
      const answer = await answerComplianceQuestion(req.body.question);
      res.json(answer);
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/ask/examples", (req, res) => {
    res.json({ questions: QA_EXAMPLE_QUESTIONS });
  });

  app.get("/api/artifacts/summary", async (req, res, next) => {
    try {
      res.json(await summarizeArtifacts());
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/artifacts/pages", async (req, res, next) => {
    try {
      const pages = await readJson(paths.pages, []);
      res.json({ pages: pages.map((page) => ({ ...page, screenshot_url: toScreenshotUrl(page.screenshot_path) })) });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/artifacts/components", async (req, res, next) => {
    try {
      const components = await readJson(paths.components, []);
      res.json({
        components: components.map((component) => ({
          ...component,
          screenshot_url: toScreenshotUrl(component.screenshot_path)
        }))
      });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/artifacts/rules", async (req, res, next) => {
    try {
      res.json({ rules: await readJson(paths.rules, []) });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/artifacts/summaries", async (req, res, next) => {
    try {
      const summaries = await readJson(paths.websiteSummaries, []);
      res.json({
        summaries: summaries.map((summary) => ({
          ...summary,
          screenshot_url: toScreenshotUrl(summary.screenshot_path)
        }))
      });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/artifacts/discrepancies", async (req, res, next) => {
    try {
      const discrepancies = await readJson(paths.discrepancies, []);
      res.json({
        discrepancies: discrepancies.map((item) => ({
          ...item,
          screenshot_url: toScreenshotUrl(item.screenshot_path)
        }))
      });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/artifacts/report", async (req, res, next) => {
    try {
      const report = await readJson(paths.jsonReport, null);
      const markdown = await readText(paths.markdownReport, "");
      res.json({ report, markdown });
    } catch (error) {
      next(error);
    }
  });

  app.use(notFound);
  app.use(errorMiddleware);
  return app;
};

export const startServer = () => {
  const app = createServer();
  app.listen(config.port, () => {
    logger.info("Server started", { port: config.port });
  });
};
