import { paths } from "../config/paths.js";
import { readJson, writeJson } from "../utils/fs.js";

export const writeCoverageReport = async () => {
  const [routes, uiStates, pages, components, rules] = await Promise.all([
    readJson(paths.discoveredRoutes, []),
    readJson(paths.uiStates, []),
    readJson(paths.pages, []),
    readJson(paths.components, []),
    readJson(paths.rules, [])
  ]);

  const componentCounts = components.reduce((acc, component) => {
    const pageUrl = component.page_url || "unknown";
    acc[pageUrl] = (acc[pageUrl] || 0) + 1;
    return acc;
  }, {});

  const capturedPages = uiStates.length
    ? uiStates.map((state) => ({
        page_url: state.page_url,
        full_url: state.full_url,
        component_count: state.components.length,
        screenshot_path: state.screenshot_path,
        retrieved_at: state.retrieved_at
      }))
    : pages.map((page) => ({
        page_url: page.page_url,
        full_url: page.full_url || page.page_url,
        component_count: componentCounts[page.page_url] || 0,
        screenshot_path: page.screenshot_path,
        retrieved_at: page.retrieved_at
      }));

  const coverage = {
    generated_at: new Date().toISOString(),
    discovered_routes: routes,
    captured_pages: capturedPages,
    guideline_rule_count: rules.length,
    notes: [
      "Coverage is route-driven from rendered links plus known seed dashboard paths.",
      "Screens requiring hidden modals, deep record data, or destructive actions may need explicit scripted flows.",
      "Automated checks should be reviewed by a human QA analyst before product decisions."
    ]
  };

  await writeJson(paths.coverage, coverage);
  return coverage;
};
