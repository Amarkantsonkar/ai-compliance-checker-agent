import path from "node:path";
import { config } from "../config/env.js";
import { paths } from "../config/paths.js";
import { ensureDir, readJson, writeJson } from "../utils/fs.js";
import { logger } from "../utils/logger.js";
import { retry } from "../utils/retry.js";
import { slugify } from "../utils/text.js";
import { authenticateWithSessionReuse } from "./auth.js";
import { launchBrowser } from "./browser.js";
import { crawlWebsitePages } from "./websiteCrawler.js";

const waitForPageReady = async (page) => {
  await page.waitForLoadState("domcontentloaded").catch(() => undefined);
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => undefined);
};

const pageUrlFromLocation = (url) => {
  const parsed = new URL(url);
  return `${parsed.pathname}${parsed.search}${parsed.hash}` || "/";
};

const extractVisibleComponentsFromPage = async (page, screenshotPath) => {
  const pageUrl = pageUrlFromLocation(page.url());
  const retrievedAt = new Date().toISOString();

  const components = await page.evaluate(
    ({ pageUrl: evaluatedPageUrl, screenshotPath: evaluatedScreenshotPath, retrievedAt: evaluatedRetrievedAt }) => {
      const supportedSelector = [
        "h1",
        "h2",
        "h3",
        "h4",
        "h5",
        "h6",
        "button",
        "a[href]",
        "nav a[href]",
        "aside a[href]",
        "[role='navigation'] a[href]",
        "input",
        "textarea",
        "select",
        "table",
        "[role='table']",
        "article",
        "[role='article']",
        "[data-card]",
        ".card",
        "[class*='card']",
        "[role='dialog']",
        "[aria-modal='true']",
        "p",
        "li",
        "label",
        "main span",
        "section span"
      ].join(",");

      const normalizeText = (value = "") => String(value).replace(/\s+/g, " ").trim();

      const attributeSelectorValue = (value) => String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');

      const visible = (element) => {
        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return (
          style.visibility !== "hidden" &&
          style.display !== "none" &&
          Number(style.opacity) !== 0 &&
          rect.width > 0 &&
          rect.height > 0
        );
      };

      const uniqueSelector = (candidate) => {
        if (!candidate) return null;
        try {
          return document.querySelectorAll(candidate).length === 1 ? candidate : null;
        } catch {
          return null;
        }
      };

      const stableClassNames = (element) =>
        [...element.classList]
          .filter((className) => !/^(active|selected|open|closed|focus|hover|disabled)$/i.test(className))
          .filter((className) => !/^\d/.test(className))
          .slice(0, 2);

      const selectorFor = (element) => {
        const idSelector = element.id ? `#${CSS.escape(element.id)}` : null;
        const uniqueId = uniqueSelector(idSelector);
        if (uniqueId) return uniqueId;

        for (const attribute of ["data-testid", "data-test", "data-cy", "name", "aria-label"]) {
          const value = element.getAttribute(attribute);
          if (!value) continue;
          const selector = `${element.tagName.toLowerCase()}[${attribute}="${attributeSelectorValue(value)}"]`;
          const uniqueAttribute = uniqueSelector(selector);
          if (uniqueAttribute) return uniqueAttribute;
        }

        if (element.tagName.toLowerCase() === "a" && element.getAttribute("href")) {
          const selector = `a[href="${attributeSelectorValue(element.getAttribute("href"))}"]`;
          const uniqueHref = uniqueSelector(selector);
          if (uniqueHref) return uniqueHref;
        }

        const parts = [];
        let current = element;
        while (current && current.nodeType === Node.ELEMENT_NODE && current !== document.body && parts.length < 6) {
          const tag = current.tagName.toLowerCase();
          const classes = stableClassNames(current).map((className) => `.${CSS.escape(className)}`).join("");
          const siblings = [...(current.parentElement?.children || [])].filter(
            (sibling) => sibling.tagName === current.tagName
          );
          const siblingIndex = siblings.indexOf(current) + 1;
          const needsIndex = siblings.length > 1;
          parts.unshift(`${tag}${classes}${needsIndex ? `:nth-of-type(${siblingIndex})` : ""}`);

          const candidate = parts.join(" > ");
          const uniqueCandidate = uniqueSelector(candidate);
          if (uniqueCandidate) return uniqueCandidate;

          current = current.parentElement;
        }

        return parts.join(" > ");
      };

      const componentTypeFor = (element) => {
        const tag = element.tagName.toLowerCase();
        const role = element.getAttribute("role");
        const insideNavigation = Boolean(element.closest("nav, aside, [role='navigation']"));

        if (role === "dialog" || element.getAttribute("aria-modal") === "true") return "modal";
        if (tag === "table" || role === "table") return "table";
        if (tag === "article" || role === "article" || element.matches("[data-card], .card, [class*='card']")) {
          return "card";
        }
        if (/^h[1-6]$/.test(tag)) return "heading";
        if (tag === "button" || role === "button") return "button";
        if (tag === "a" && insideNavigation) return "navigation_item";
        if (tag === "a") return "link";
        if (["input", "textarea", "select"].includes(tag)) return "input";
        return "text_block";
      };

      const textFor = (element) => {
        const tag = element.tagName.toLowerCase();
        if (["input", "textarea", "select"].includes(tag)) {
          return normalizeText(
            element.getAttribute("aria-label") ||
              element.getAttribute("placeholder") ||
              element.getAttribute("name") ||
              element.value ||
              ""
          );
        }

        return normalizeText(
          element.innerText ||
            element.textContent ||
            element.getAttribute("aria-label") ||
            element.getAttribute("title") ||
            ""
        );
      };

      const shouldSkip = (element, componentType, text) => {
        if (!visible(element)) return true;
        if (!text && !["input", "table", "card", "modal"].includes(componentType)) return true;
        if (componentType === "text_block" && element.closest("button, a, nav, aside, [role='navigation']")) return true;
        if (componentType === "text_block" && text.length < 2) return true;
        return false;
      };

      return [...document.querySelectorAll(supportedSelector)]
        .map((element) => {
          const componentType = componentTypeFor(element);
          const text = textFor(element);
          return {
            page_url: evaluatedPageUrl,
            component_type: componentType,
            component_selector: selectorFor(element),
            actual_text_content: text || null,
            screenshot_path: evaluatedScreenshotPath,
            retrieved_at: evaluatedRetrievedAt
          };
        })
        .filter((component, index, allComponents) => {
          let element = null;
          try {
            element = document.querySelector(component.component_selector);
          } catch {
            return false;
          }

          if (!element) return false;
          if (shouldSkip(element, component.component_type, component.actual_text_content || "")) return false;

          const key = [
            component.page_url,
            component.component_type,
            component.component_selector,
            component.actual_text_content || ""
          ].join("|");

          return (
            allComponents.findIndex((candidate) =>
              [
                candidate.page_url,
                candidate.component_type,
                candidate.component_selector,
                candidate.actual_text_content || ""
              ].join("|") === key
            ) === index
          );
        });
    },
    { pageUrl, screenshotPath, retrievedAt }
  );

  return components;
};

const loadOrCrawlPages = async () => {
  const pages = await readJson(paths.pages, []);
  if (pages.length) return pages;

  logger.info("No pages.json found; running Phase 3 page crawler before component extraction");
  const result = await crawlWebsitePages();
  return result.pages;
};

const dedupeComponents = (components) => {
  const seen = new Set();
  const unique = [];

  for (const component of components) {
    const key = [
      component.page_url,
      component.component_type,
      component.component_selector,
      component.actual_text_content || ""
    ].join("|");

    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(component);
  }

  return unique;
};

export const extractCanonicalComponents = async () => {
  await ensureDir(paths.ui);
  await ensureDir(paths.screenshots);

  const pages = await loadOrCrawlPages();
  const browser = await launchBrowser();
  const allComponents = [];

  try {
    const { page, context, sessionReused } = await authenticateWithSessionReuse(browser);
    logger.info("Canonical extraction authenticated", { sessionReused, pages: pages.length });

    for (const pageRecord of pages) {
      const targetUrl = new URL(pageRecord.page_url, config.targetUrl).toString();
      logger.info("Extracting canonical components", { pageUrl: pageRecord.page_url, targetUrl });

      const components = await retry(
        async () => {
          await page.goto(targetUrl, { waitUntil: "domcontentloaded" });
          await waitForPageReady(page);

          const screenshotPath =
            pageRecord.screenshot_path ||
            path.join(paths.screenshots, `${slugify(pageRecord.page_url) || "page"}-components.png`);

          if (!pageRecord.screenshot_path) {
            await page.screenshot({ path: screenshotPath, fullPage: true });
          }

          return extractVisibleComponentsFromPage(page, screenshotPath);
        },
        { retries: 3, delayMs: 1000 }
      );

      allComponents.push(...components);
    }

    await context.close();
  } finally {
    await browser.close();
  }

  const components = dedupeComponents(allComponents);
  await writeJson(paths.components, components);
  logger.info("Canonical components extracted", {
    components: components.length,
    output: paths.components
  });

  return components;
};
