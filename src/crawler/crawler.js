import path from "node:path";
import { config } from "../config/env.js";
import { paths } from "../config/paths.js";
import { ensureDir, writeJson } from "../utils/fs.js";
import { logger } from "../utils/logger.js";
import { retry } from "../utils/retry.js";
import { launchBrowser, createBrowserPage } from "./browser.js";
import { authenticateWithSessionReuse } from "./auth.js";
import { extractCanonicalUiState } from "./extractors.js";
import { crawlWebsitePages } from "./websiteCrawler.js";

export const crawlWaiverPro = async () => {
  await ensureDir(paths.screenshots);
  const { pages } = await crawlWebsitePages();
  const browser = await launchBrowser();
  const uiStates = [];

  try {
    const { page: publicPage, context: publicContext } = await createBrowserPage(browser);

    await retry(() => publicPage.goto(config.targetUrl, { waitUntil: "domcontentloaded" }));
    const landingScreenshot = path.join(paths.screenshots, "landing.png");
    await publicPage.screenshot({ path: landingScreenshot, fullPage: true });
    uiStates.push(await extractCanonicalUiState(publicPage, landingScreenshot));
    await publicContext.close();

    const { page, context, sessionReused } = await authenticateWithSessionReuse(browser);
    logger.info("Authenticated crawl context ready", { sessionReused });

    for (const crawledPage of pages) {
      const url = new URL(crawledPage.page_url, config.targetUrl).toString();
      logger.info("Extracting canonical UI state", { pageUrl: crawledPage.page_url, url });
      try {
        await retry(() => page.goto(url, { waitUntil: "domcontentloaded" }));
        await page.waitForLoadState("networkidle").catch(() => undefined);
        uiStates.push(await extractCanonicalUiState(page, crawledPage.screenshot_path));
      } catch (error) {
        logger.warn("Canonical UI extraction failed", { pageUrl: crawledPage.page_url, error: error.message });
      }
    }

    await context.close();
  } finally {
    await browser.close();
  }

  await writeJson(paths.uiStates, uiStates);
  logger.info("Crawl completed", { states: uiStates.length, output: paths.uiStates });
  return uiStates;
};
