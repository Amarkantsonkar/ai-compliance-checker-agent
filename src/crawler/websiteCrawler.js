import fs from "node:fs/promises";
import path from "node:path";
import { config } from "../config/env.js";
import { paths } from "../config/paths.js";
import { ensureDir, readJson, writeJson } from "../utils/fs.js";
import { logger } from "../utils/logger.js";
import { retry } from "../utils/retry.js";
import { slugify } from "../utils/text.js";
import { authenticateWithSessionReuse } from "./auth.js";
import { launchBrowser } from "./browser.js";

const DEFAULT_SEED_ROUTES = [
  "/dashboard",
  "/dashboard/applications",
  "/dashboard/facilities",
  "/dashboard/action-items",
  "/dashboard/users",
  "/dashboard/announcements",
  "/dashboard/settings",
  "/dashboard/faqs",
  "/dashboard/tickets",
  "/dashboard/contact"
];

const isSameOriginUrl = (url) => {
  try {
    return new URL(url, config.targetUrl).origin === new URL(config.targetUrl).origin;
  } catch {
    return false;
  }
};

const normalizeRoute = (value) => {
  try {
    const url = new URL(value, config.targetUrl);
    if (!isSameOriginUrl(url)) return null;
    const normalizedPath = url.pathname.replace(/\/+$/, "") || "/";
    return `${normalizedPath}${url.search}${url.hash}`;
  } catch {
    return null;
  }
};

const waitForSpaIdle = async (page) => {
  await page.waitForLoadState("domcontentloaded").catch(() => undefined);
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => undefined);
};

const getRouteUrl = (route) => new URL(route, config.targetUrl).toString();

const discoverRoutesFromDom = async (page) => {
  const hrefs = await page.evaluate(() => {
    const anchors = [...document.querySelectorAll("a[href]")].map((anchor) => anchor.getAttribute("href"));
    const linkLikeElements = [...document.querySelectorAll("[role='link'][href], [data-href], [data-route], [to]")]
      .map((element) =>
        element.getAttribute("href") ||
        element.getAttribute("data-href") ||
        element.getAttribute("data-route") ||
        element.getAttribute("to")
      );

    return [...anchors, ...linkLikeElements].filter(Boolean);
  });

  return hrefs.map(normalizeRoute).filter(Boolean);
};

const discoverRoutesByClickingNavigation = async (page) => {
  const beforeRoute = normalizeRoute(page.url());
  const discovered = new Set();
  const navSelectors = [
    "nav a",
    "aside a",
    "[role='navigation'] a",
    "a[href^='/']",
    "button:has-text('My Applications')",
    "button:has-text('Facilities')",
    "button:has-text('Action Items')",
    "button:has-text('User Management')",
    "button:has-text('Announcements')",
    "button:has-text('Settings')",
    "button:has-text('FAQs')",
    "button:has-text('Tickets')",
    "button:has-text('Contact')"
  ];

  for (const selector of navSelectors) {
    const locators = page.locator(selector);
    const count = Math.min(await locators.count().catch(() => 0), 25);

    for (let index = 0; index < count; index += 1) {
      const locator = locators.nth(index);
      if (!(await locator.isVisible().catch(() => false))) continue;

      const currentBeforeClick = normalizeRoute(page.url());
      try {
        await locator.click({ timeout: 5000 });
        await waitForSpaIdle(page);
        const afterRoute = normalizeRoute(page.url());
        if (afterRoute) discovered.add(afterRoute);
      } catch (error) {
        logger.debug("Navigation click discovery skipped element", {
          selector,
          index,
          error: error.message
        });
      } finally {
        const returnRoute = currentBeforeClick || beforeRoute;
        if (returnRoute && normalizeRoute(page.url()) !== returnRoute) {
          await page.goto(getRouteUrl(returnRoute), { waitUntil: "domcontentloaded" }).catch(() => undefined);
          await waitForSpaIdle(page);
        }
      }
    }
  }

  return [...discovered];
};

const capturePage = async (page, route) => {
  const pageUrl = normalizeRoute(page.url()) || route;
  const title = await page.title().catch(() => "");
  const screenshotName = `${slugify(pageUrl) || "root"}.png`;
  const screenshotPath = path.join(paths.screenshots, screenshotName);

  await page.screenshot({ path: screenshotPath, fullPage: true });

  return {
    page_url: pageUrl,
    title,
    screenshot_path: screenshotPath,
    crawled_at: new Date().toISOString()
  };
};

const screenshotExists = async (screenshotPath) => {
  if (!screenshotPath) return false;
  try {
    await fs.access(screenshotPath);
    return true;
  } catch {
    return false;
  }
};

const loadExistingPagesWithScreenshots = async () => {
  const pages = await readJson(paths.pages, []);
  if (!pages.length) return null;

  const screenshotChecks = await Promise.all(pages.map((page) => screenshotExists(page.screenshot_path)));
  if (!screenshotChecks.every(Boolean)) return null;

  const coverage = await readJson(paths.crawlCoverage, {
    pages_discovered: pages.length,
    pages_crawled: pages.length,
    pages_failed: 0,
    screenshots_captured: pages.length
  });

  return {
    pages,
    failed: await readJson(paths.crawlFailures, []),
    coverage,
    skipped: true,
    message: "Screenshots already exist for this PDF."
  };
};

export const crawlWebsitePages = async () => {
  await ensureDir(paths.ui);
  await ensureDir(paths.screenshots);

  const existing = await loadExistingPagesWithScreenshots();
  if (existing) {
    logger.info(existing.message, {
      pages: existing.pages.length,
      screenshots: existing.coverage.screenshots_captured
    });
    return existing;
  }

  const browser = await launchBrowser();
  const queue = [...DEFAULT_SEED_ROUTES];
  const discovered = new Set(queue.map(normalizeRoute).filter(Boolean));
  const visited = new Set();
  const pages = [];
  const failed = [];

  try {
    const { page, context, sessionReused } = await authenticateWithSessionReuse(browser);
    logger.info("Website crawler authenticated", { sessionReused });

    const initialRoute = normalizeRoute(page.url());
    if (initialRoute && !discovered.has(initialRoute)) {
      discovered.add(initialRoute);
      queue.push(initialRoute);
    }

    const initialRoutes = await discoverRoutesFromDom(page);
    for (const route of initialRoutes) {
      if (!discovered.has(route)) {
        discovered.add(route);
        queue.push(route);
      }
    }

    while (queue.length > 0 && visited.size < config.crawlMaxPages) {
      const route = queue.shift();
      const normalizedRoute = normalizeRoute(route);
      if (!normalizedRoute || visited.has(normalizedRoute)) continue;

      logger.info("Crawling page", { route: normalizedRoute });

      try {
        const pageRecord = await retry(
          async () => {
            await page.goto(getRouteUrl(normalizedRoute), { waitUntil: "domcontentloaded" });
            await waitForSpaIdle(page);

            const routesFromDom = await discoverRoutesFromDom(page);
            for (const discoveredRoute of routesFromDom) {
              if (!discovered.has(discoveredRoute)) {
                discovered.add(discoveredRoute);
                queue.push(discoveredRoute);
              }
            }

            const routesFromClicks = await discoverRoutesByClickingNavigation(page);
            for (const discoveredRoute of routesFromClicks) {
              if (!discovered.has(discoveredRoute)) {
                discovered.add(discoveredRoute);
                queue.push(discoveredRoute);
              }
            }

            if (normalizeRoute(page.url()) !== normalizedRoute) {
              await page.goto(getRouteUrl(normalizedRoute), { waitUntil: "domcontentloaded" });
              await waitForSpaIdle(page);
            }

            return capturePage(page, normalizedRoute);
          },
          { retries: 3, delayMs: 1000 }
        );

        visited.add(normalizedRoute);
        pages.push(pageRecord);
      } catch (error) {
        visited.add(normalizedRoute);
        const failureScreenshotPath = path.join(
          paths.screenshots,
          `failed-${slugify(normalizedRoute) || "page"}-${Date.now()}.png`
        );
        await page.screenshot({ path: failureScreenshotPath, fullPage: true }).catch(() => undefined);
        failed.push({
          page_url: normalizedRoute,
          error: error.message,
          screenshot_path: failureScreenshotPath,
          failed_at: new Date().toISOString()
        });
        logger.warn("Page crawl failed", {
          route: normalizedRoute,
          error: error.message,
          screenshotPath: failureScreenshotPath
        });
      }
    }

    await context.close();
  } finally {
    await browser.close();
  }

  const coverage = {
    pages_discovered: discovered.size,
    pages_crawled: pages.length,
    pages_failed: failed.length,
    screenshots_captured: pages.length + failed.filter((item) => item.screenshot_path).length
  };

  await writeJson(paths.pages, pages);
  await writeJson(paths.discoveredRoutes, [...discovered]);
  await writeJson(paths.crawlCoverage, coverage);
  await writeJson(paths.crawlFailures, failed);

  logger.info("Website crawl completed", {
    output: paths.pages,
    coverageOutput: paths.crawlCoverage,
    ...coverage
  });

  return { pages, failed, coverage };
};
