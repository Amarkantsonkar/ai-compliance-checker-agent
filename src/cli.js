import { config } from "./config/env.js";
import { parseGuidelinesPdf } from "./parser/pdfParser.js";
import { extractGuidelineRules } from "./parser/ruleExtractor.js";
import { indexGuidelines } from "./embeddings/indexGuidelines.js";
import { indexWebsiteSummaries } from "./embeddings/indexWebsite.js";
import { summarizeGuidelines } from "./summarizer/guidelineSummarizer.js";
import { summarizeWebsiteComponents } from "./summarizer/websiteSummarizer.js";
import { crawlWaiverPro } from "./crawler/crawler.js";
import { crawlWebsitePages } from "./crawler/websiteCrawler.js";
import { extractCanonicalComponents } from "./crawler/canonicalExtractor.js";
import { authenticateWithSessionReuse } from "./crawler/auth.js";
import { launchBrowser } from "./crawler/browser.js";
import { compareUiToGuidelines } from "./compliance/complianceAgent.js";
import { answerComplianceQuestion, formatQaAnswerMarkdown, QA_EXAMPLE_QUESTIONS } from "./qa/qaAgent.js";
import { writeFinalReport } from "./reports/reportWriter.js";
import { logger } from "./utils/logger.js";

const command = process.argv[2];
const args = process.argv.slice(3);

const commands = {
  async auth() {
    const browser = await launchBrowser();
    try {
      const { context, sessionReused } = await authenticateWithSessionReuse(browser);
      logger.info("Authentication module completed", { sessionReused });
      await context.close();
    } finally {
      await browser.close();
    }
  },
  async ingest() {
    await parseGuidelinesPdf(args[0] || config.guidelinesPdfPath);
    await extractGuidelineRules();
    await indexGuidelines();
  },
  async "index:guidelines"() {
    await indexGuidelines();
  },
  async "index:website"() {
    await indexWebsiteSummaries();
  },
  async summarize() {
    await summarizeGuidelines();
  },
  async "summarize:website"() {
    await summarizeWebsiteComponents();
  },
  async crawl() {
    await crawlWaiverPro();
  },
  async "crawl:pages"() {
    const result = await crawlWebsitePages();
    if (result?.skipped && result.message) {
      console.log(result.message);
    }
  },
  async "extract:components"() {
    await extractCanonicalComponents();
  },
  async compare() {
    await compareUiToGuidelines();
  },
  async report() {
    await writeFinalReport();
  },
  async ask() {
    const question = args.join(" ");
    if (!question) throw new Error("Usage: npm run ask -- \"Does the landing page match the guidelines?\"");
    const answer = await answerComplianceQuestion(question);
    console.log(formatQaAnswerMarkdown(answer));
  },
  async "ask:examples"() {
    console.log(QA_EXAMPLE_QUESTIONS.map((question, index) => `${index + 1}. ${question}`).join("\n"));
  },
  async pipeline() {
    await commands.ingest();
    await commands.summarize();
    await commands.crawl();
    await commands["extract:components"]();
    await commands["summarize:website"]();
    await commands.compare();
    await commands.report();
  }
};

if (!commands[command]) {
  console.log(`Usage: node src/cli.js <${Object.keys(commands).join("|")}>`);
  process.exitCode = 1;
} else {
  commands[command]().catch((error) => {
    logger.error(error.message, { stack: error.stack });
    process.exitCode = 1;
  });
}
