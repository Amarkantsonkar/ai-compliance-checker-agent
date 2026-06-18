import { config } from "../config/env.js";

const sameOriginPath = (href) => {
  try {
    const url = new URL(href, config.targetUrl);
    const targetOrigin = new URL(config.targetUrl).origin;
    if (url.origin !== targetOrigin) return null;
    return `${url.pathname}${url.search}`;
  } catch {
    return null;
  }
};

export const discoverRoutes = async (page) => {
  const hrefs = await page.evaluate(() =>
    [...document.querySelectorAll("a[href]")].map((anchor) => anchor.getAttribute("href"))
  );

  const paths = new Set(["/", "/login", "/dashboard", "/dashboard/applications"]);
  for (const href of hrefs) {
    const path = sameOriginPath(href);
    if (path) paths.add(path);
  }

  return [...paths].slice(0, config.crawlMaxPages);
};
