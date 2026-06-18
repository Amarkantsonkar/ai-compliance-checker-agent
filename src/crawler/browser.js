import { chromium } from "playwright";
import { config } from "../config/env.js";

export const launchBrowser = async () =>
  chromium.launch({
    headless: config.headless
  });

export const createBrowserPage = async (browser, options = {}) => {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1100 },
    deviceScaleFactor: 1,
    ignoreHTTPSErrors: true,
    storageState: options.storageState
  });
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  page.setDefaultNavigationTimeout(45000);
  return { context, page };
};
