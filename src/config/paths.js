import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "./env.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const projectRoot = path.resolve(__dirname, "../..");

export const paths = Object.freeze({
  projectRoot,
  data: path.join(projectRoot, config.dataDir),
  ui: path.join(projectRoot, config.dataDir, "ui"),
  session: path.join(projectRoot, config.dataDir, "session"),
  guidelines: path.join(projectRoot, config.dataDir, "guidelines"),
  summaries: path.join(projectRoot, config.dataDir, "summaries"),
  reports: path.join(projectRoot, config.dataDir, "reports"),
  screenshots: path.join(projectRoot, config.screenshotDir),
  rawGuidelineText: path.join(projectRoot, config.dataDir, "guidelines", "waiverpro-guidelines.raw.txt"),
  guidelinePages: path.join(projectRoot, config.dataDir, "guidelines", "guideline-pages.json"),
  guidelineChunks: path.join(projectRoot, config.dataDir, "guidelines", "guideline-chunks.json"),
  rules: path.join(projectRoot, config.dataDir, "guidelines", "rules.json"),
  guidelineRules: path.join(projectRoot, config.dataDir, "guidelines", "guideline-rules.json"),
  pages: path.join(projectRoot, config.dataDir, "ui", "pages.json"),
  components: path.join(projectRoot, config.dataDir, "ui", "components.json"),
  uiStates: path.join(projectRoot, config.dataDir, "ui", "ui-states.json"),
  discoveredRoutes: path.join(projectRoot, config.dataDir, "ui", "discovered-routes.json"),
  crawlCoverage: path.join(projectRoot, config.dataDir, "ui", "coverage.json"),
  crawlFailures: path.join(projectRoot, config.dataDir, "ui", "crawl-failures.json"),
  authStorageState: path.join(projectRoot, config.dataDir, "session", "auth-storage-state.json"),
  summary: path.join(projectRoot, config.dataDir, "summaries", "guideline-summary.md"),
  websiteSummaries: path.join(projectRoot, config.dataDir, "summaries", "website-summaries.json"),
  discrepancies: path.join(projectRoot, config.dataDir, "reports", "discrepancies.json"),
  coverage: path.join(projectRoot, config.dataDir, "reports", "coverage.json"),
  jsonReport: path.join(projectRoot, config.dataDir, "reports", "report.json"),
  markdownReport: path.join(projectRoot, config.dataDir, "reports", "report.md"),
  legacyMarkdownReport: path.join(projectRoot, config.dataDir, "reports", "final-report.md")
});
