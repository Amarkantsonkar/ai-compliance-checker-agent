import fs from "node:fs/promises";
import path from "node:path";
import { config } from "../config/env.js";
import { paths } from "../config/paths.js";
import { ensureDir } from "../utils/fs.js";
import { logger } from "../utils/logger.js";

const AUTH_RETRIES = 3;

const selectors = {
  emailPlaceholder: /m@example\.com|email/i,
  passwordLabel: /password/i,
  loginButton: /login|sign in/i,
  loginNavigation: /getting started|login|sign in/i,
  dashboardText: /my applications|new application|facilities|action items|dashboard/i
};

const screenshotOnFailure = async (page, label, attempt) => {
  await ensureDir(paths.screenshots);
  const screenshotPath = path.join(
    paths.screenshots,
    `auth-${label}-attempt-${attempt}-${Date.now()}.png`
  );
  await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => undefined);
  logger.warn("Authentication failure screenshot captured", { screenshotPath });
  return screenshotPath;
};

const isVisible = async (locator) => locator.isVisible().catch(() => false);

const waitForSettledPage = async (page) => {
  await page.waitForLoadState("domcontentloaded").catch(() => undefined);
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => undefined);
};

const openLoginForm = async (page) => {
  logger.info("Opening target website", { targetUrl: config.targetUrl });
  await page.goto(config.targetUrl, { waitUntil: "domcontentloaded" });
  await waitForSettledPage(page);

  if (await detectLoginForm(page)) {
    return;
  }

  const loginLink = page.getByRole("link", { name: selectors.loginNavigation }).first();
  const loginButton = page.getByRole("button", { name: selectors.loginNavigation }).first();

  if (await isVisible(loginLink)) {
    logger.info("Navigating to login via link");
    await loginLink.click();
  } else if (await isVisible(loginButton)) {
    logger.info("Navigating to login via button");
    await loginButton.click();
  } else {
    const loginUrl = new URL("/login", config.targetUrl).toString();
    logger.info("Login navigation control not found; opening login route directly", { loginUrl });
    await page.goto(loginUrl, { waitUntil: "domcontentloaded" });
  }

  await waitForSettledPage(page);
};

export const detectLoginForm = async (page) => {
  const emailField = page.getByPlaceholder(selectors.emailPlaceholder).first();
  const passwordField = page.getByLabel(selectors.passwordLabel).first();
  const submitButton = page.getByRole("button", { name: selectors.loginButton }).first();

  return (await isVisible(emailField)) && (await isVisible(passwordField)) && (await isVisible(submitButton));
};

export const saveSession = async (context, sessionPath = paths.authStorageState) => {
  await ensureDir(path.dirname(sessionPath));
  await context.storageState({ path: sessionPath });
  logger.info("Authenticated session saved", { sessionPath });
  return sessionPath;
};

export const loadSession = async (sessionPath = paths.authStorageState) => {
  try {
    await fs.access(sessionPath);
    logger.info("Authenticated session found", { sessionPath });
    return sessionPath;
  } catch (error) {
    if (error.code === "ENOENT") {
      logger.info("No persisted session found", { sessionPath });
      return null;
    }
    throw error;
  }
};

export const verifyAuthentication = async (page) => {
  await waitForSettledPage(page);

  const loginFormVisible = await detectLoginForm(page);
  if (loginFormVisible) {
    logger.warn("Authentication verification failed: login form is visible", { currentUrl: page.url() });
    return false;
  }

  const dashboardSignals = [
    page.getByText(selectors.dashboardText).first(),
    page.getByRole("button", { name: /\+?\s*new application/i }).first(),
    page.getByRole("link", { name: /my applications|facilities|action items/i }).first()
  ];

  for (const signal of dashboardSignals) {
    if (await isVisible(signal)) {
      logger.info("Authentication verified", { currentUrl: page.url() });
      return true;
    }
  }

  const pathName = new URL(page.url()).pathname;
  const authenticatedByRoute = pathName.startsWith("/dashboard");
  logger[authenticatedByRoute ? "info" : "warn"]("Authentication route verification completed", {
    authenticated: authenticatedByRoute,
    currentUrl: page.url()
  });
  return authenticatedByRoute;
};

export const login = async (page, options = {}) => {
  const email = options.email || config.loginEmail;
  const password = options.password || config.loginPassword;
  const sessionPath = options.sessionPath || paths.authStorageState;

  let lastError;

  for (let attempt = 1; attempt <= AUTH_RETRIES; attempt += 1) {
    try {
      logger.info("Starting authentication attempt", { attempt, maxAttempts: AUTH_RETRIES });
      await openLoginForm(page);

      if (!(await detectLoginForm(page))) {
        if (await verifyAuthentication(page)) {
          await saveSession(page.context(), sessionPath);
          return { authenticated: true, reusedExistingBrowserState: true, sessionPath };
        }
        throw new Error("Login form was not detected and authenticated dashboard was not visible.");
      }

      await page.getByPlaceholder(selectors.emailPlaceholder).first().fill(email);
      await page.getByLabel(selectors.passwordLabel).first().fill(password);
      await page.getByRole("button", { name: selectors.loginButton }).first().click();

      await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 20000 }).catch(() => undefined);
      await waitForSettledPage(page);

      const authenticated = await verifyAuthentication(page);
      if (!authenticated) {
        throw new Error("Dashboard did not load after login submission.");
      }

      await saveSession(page.context(), sessionPath);
      logger.info("Authentication completed", { currentUrl: page.url(), sessionPath });
      return { authenticated: true, reusedExistingBrowserState: false, sessionPath };
    } catch (error) {
      lastError = error;
      logger.warn("Authentication attempt failed", {
        attempt,
        maxAttempts: AUTH_RETRIES,
        error: error.message
      });
      await screenshotOnFailure(page, "login", attempt);
    }
  }

  throw new Error(`Authentication failed after ${AUTH_RETRIES} attempts: ${lastError?.message || "unknown error"}`);
};

export const authenticateWithSessionReuse = async (browser) => {
  const sessionPath = await loadSession();

  if (sessionPath) {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1100 },
      deviceScaleFactor: 1,
      ignoreHTTPSErrors: true,
      storageState: sessionPath
    });
    const page = await context.newPage();
    page.setDefaultTimeout(30000);
    page.setDefaultNavigationTimeout(45000);
    await page.goto(new URL("/dashboard", config.targetUrl).toString(), { waitUntil: "domcontentloaded" });

    if (await verifyAuthentication(page)) {
      logger.info("Reused persisted authenticated session", { sessionPath });
      return { context, page, sessionReused: true };
    }

    logger.warn("Persisted session is invalid; closing context and performing fresh login", { sessionPath });
    await screenshotOnFailure(page, "session-verification", 1);
    await context.close();
  }

  const context = await browser.newContext({
    viewport: { width: 1440, height: 1100 },
    deviceScaleFactor: 1,
    ignoreHTTPSErrors: true
  });
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  page.setDefaultNavigationTimeout(45000);
  await login(page);
  return { context, page, sessionReused: false };
};
