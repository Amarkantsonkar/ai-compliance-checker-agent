import { paths } from "../config/paths.js";
import { readJson, writeJson, writeText } from "../utils/fs.js";
import { logger } from "../utils/logger.js";
import { writeCoverageReport } from "./coverageWriter.js";

const clamp = (value, min = 0, max = 100) => Math.min(max, Math.max(min, value));

const markdownRow = (cells) => `| ${cells.map((cell) => String(cell ?? "").replace(/\n/g, " ")).join(" | ")} |`;

const normalizePageUrl = (value = "") => {
  try {
    const url = new URL(value);
    return `${url.origin}${url.pathname}`.replace(/\/$/, "") || url.origin;
  } catch {
    return String(value || "").replace(/\/$/, "");
  }
};

const statusFromScore = (score) => {
  if (score >= 95) return "PASS";
  if (score >= 80) return "WARNING";
  return "FAIL";
};

const groupByPage = (records) => {
  const grouped = new Map();

  for (const record of records) {
    const pageUrl = record.page_url || "unknown";
    if (!grouped.has(pageUrl)) grouped.set(pageUrl, []);
    grouped.get(pageUrl).push(record);
  }

  return grouped;
};

const pageMetadata = ({ pageUrl, coverage, components, summaries }) => {
  const normalized = normalizePageUrl(pageUrl);
  const capturedPage =
    coverage.captured_pages?.find((page) => normalizePageUrl(page.page_url) === normalized) ||
    coverage.captured_pages?.find((page) => normalizePageUrl(page.full_url) === normalized) ||
    {};
  const pageSummary = summaries.find((summary) => normalizePageUrl(summary.page_url) === normalized) || {};
  const pageComponents = components.filter((component) => normalizePageUrl(component.page_url) === normalized);

  return {
    page_url: pageUrl,
    title: pageSummary.title || capturedPage.title || "",
    screenshot_path:
      pageSummary.screenshot_path ||
      capturedPage.screenshot_path ||
      pageComponents.find((component) => component.screenshot_path)?.screenshot_path ||
      null,
    component_count: pageComponents.length || capturedPage.component_count || 0,
    summary: pageSummary.semantic_summary || ""
  };
};

const buildViolation = (record, index) => ({
  id: `violation-${index + 1}`,
  page_url: record.page_url,
  status: "FAIL",
  expected_text_content: record.expected_text_content,
  actual_text_content: record.actual_text_content,
  guideline_reference: record.guideline_reference,
  discrepancy_reason: record.discrepancy_reason,
  screenshot_path: record.screenshot_path,
  retrieved_at: record.retrieved_at
});

const buildPageReports = ({ discrepancies, coverage, components, summaries }) => {
  const groupedDiscrepancies = groupByPage(discrepancies);
  const pageUrls = new Set([
    ...(coverage.captured_pages || []).map((page) => page.page_url).filter(Boolean),
    ...components.map((component) => component.page_url).filter(Boolean),
    ...summaries.map((summary) => summary.page_url).filter(Boolean),
    ...discrepancies.map((record) => record.page_url).filter(Boolean)
  ]);

  return [...pageUrls].sort().map((pageUrl) => {
    const meta = pageMetadata({ pageUrl, coverage, components, summaries });
    const pageViolations = groupedDiscrepancies.get(pageUrl) || [];
    const totalChecks = Math.max(meta.component_count + pageViolations.length, pageViolations.length, 1);
    const passedChecks = Math.max(totalChecks - pageViolations.length, 0);
    const complianceScore = clamp(Math.round((passedChecks / totalChecks) * 100));

    return {
      page_url: pageUrl,
      title: meta.title,
      status: statusFromScore(complianceScore),
      compliance_score: complianceScore,
      checks: {
        total: totalChecks,
        passed: passedChecks,
        failed: pageViolations.length
      },
      component_count: meta.component_count,
      summary: meta.summary,
      screenshot_path: meta.screenshot_path,
      violations: pageViolations.map(buildViolation)
    };
  });
};

const buildReportJson = ({ discrepancies, coverage, components, summaries }) => {
  const generatedAt = new Date().toISOString();
  const pageReports = buildPageReports({ discrepancies, coverage, components, summaries });
  const totalChecks = pageReports.reduce((sum, page) => sum + page.checks.total, 0);
  const failedChecks = pageReports.reduce((sum, page) => sum + page.checks.failed, 0);
  const passedChecks = Math.max(totalChecks - failedChecks, 0);
  const overallScore = totalChecks ? clamp(Math.round((passedChecks / totalChecks) * 100)) : 100;

  return {
    report_type: "documentation_compliance_report",
    generated_at: generatedAt,
    auditor_note: "This is an automated compliance check, not a replacement for manual QA.",
    overall: {
      status: statusFromScore(overallScore),
      compliance_score: overallScore,
      pages_reviewed: pageReports.length,
      total_checks: totalChecks,
      passed_checks: passedChecks,
      failed_checks: failedChecks,
      violations_count: discrepancies.length
    },
    page_scores: pageReports.map((page) => ({
      page_url: page.page_url,
      title: page.title,
      status: page.status,
      compliance_score: page.compliance_score,
      checks: page.checks,
      screenshot_path: page.screenshot_path
    })),
    violations: discrepancies.map(buildViolation),
    pages: pageReports,
    evidence: {
      coverage_report: paths.coverage,
      discrepancies_file: paths.discrepancies,
      screenshots_directory: paths.screenshots
    },
    limitations: [
      "Scores are based on extracted DOM components, generated summaries, and detected discrepancy records.",
      "Hidden states, destructive workflows, and data-dependent screens may need targeted manual review.",
      "Screenshots provide evidence for the captured state at crawl time."
    ]
  };
};

const buildMarkdownReport = (report) => {
  const lines = [
    "# WaiverPro Documentation Compliance Report",
    "",
    `Generated at: ${report.generated_at}`,
    "",
    `> ${report.auditor_note}`,
    "",
    "## Executive Summary",
    "",
    `Overall status: **${report.overall.status}**`,
    `Overall compliance score: **${report.overall.compliance_score}%**`,
    `Pages reviewed: ${report.overall.pages_reviewed}`,
    `Total checks: ${report.overall.total_checks}`,
    `Passed checks: ${report.overall.passed_checks}`,
    `Failed checks: ${report.overall.failed_checks}`,
    `Violations: ${report.overall.violations_count}`,
    "",
    "## Page-Wise Compliance",
    "",
    markdownRow(["Page", "Status", "Score", "Checks", "Violations", "Screenshot"]),
    markdownRow(["---", "---", "---", "---", "---", "---"]),
    ...report.page_scores.map((page) =>
      markdownRow([
        page.page_url,
        page.status,
        `${page.compliance_score}%`,
        `${page.checks.passed}/${page.checks.total}`,
        page.checks.failed,
        page.screenshot_path || ""
      ])
    ),
    "",
    "## Violations",
    ""
  ];

  if (!report.violations.length) {
    lines.push("No concrete violations were found by the automated comparison.", "");
  } else {
    for (const page of report.pages.filter((item) => item.violations.length)) {
      lines.push(`### ${page.title || page.page_url}`, "", `Status: **${page.status}**`, "");

      for (const violation of page.violations) {
        lines.push(
          `#### ${violation.id}`,
          "",
          "Result: **FAIL**",
          "",
          "Expected:",
          "",
          violation.expected_text_content || "",
          "",
          "Actual:",
          "",
          violation.actual_text_content || "",
          "",
          "Reference:",
          "",
          violation.guideline_reference || "",
          "",
          "Explanation:",
          "",
          violation.discrepancy_reason || "",
          "",
          "Screenshot:",
          "",
          violation.screenshot_path || page.screenshot_path || "",
          ""
        );
      }
    }
  }

  lines.push(
    "## Evidence Files",
    "",
    `Discrepancies: ${report.evidence.discrepancies_file}`,
    `Coverage: ${report.evidence.coverage_report}`,
    `Screenshots: ${report.evidence.screenshots_directory}`,
    "",
    "## Limitations",
    "",
    ...report.limitations.map((item) => `- ${item}`),
    ""
  );

  return `${lines.join("\n")}\n`;
};

export const generateComplianceReport = async () => {
  const [discrepancies, coverage, components, summaries] = await Promise.all([
    readJson(paths.discrepancies, []),
    writeCoverageReport(),
    readJson(paths.components, []),
    readJson(paths.websiteSummaries, [])
  ]);

  const report = buildReportJson({ discrepancies, coverage, components, summaries });
  const markdown = buildMarkdownReport(report);

  await Promise.all([
    writeJson(paths.jsonReport, report),
    writeText(paths.markdownReport, markdown),
    writeText(paths.legacyMarkdownReport, markdown)
  ]);

  logger.info("Compliance reports generated", {
    json: paths.jsonReport,
    markdown: paths.markdownReport,
    legacyMarkdown: paths.legacyMarkdownReport,
    overallScore: report.overall.compliance_score,
    violations: report.overall.violations_count
  });

  return {
    report,
    markdown,
    paths: {
      json: paths.jsonReport,
      markdown: paths.markdownReport,
      legacyMarkdown: paths.legacyMarkdownReport
    }
  };
};

export const writeFinalReport = async () => {
  const { markdown } = await generateComplianceReport();
  return markdown;
};
