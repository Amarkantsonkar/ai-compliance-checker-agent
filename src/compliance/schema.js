export const buildDiscrepancyRecord = ({
  pageUrl,
  expectedTextContent,
  actualTextContent,
  guidelineReference,
  discrepancyFlag,
  discrepancyReason,
  screenshotPath,
  retrievedAt
}) => ({
  page_url: pageUrl || null,
  guideline_reference: guidelineReference || null,
  expected_text_content: expectedTextContent || null,
  actual_text_content: actualTextContent || null,
  discrepancy_flag: Boolean(discrepancyFlag),
  discrepancy_reason: discrepancyReason || null,
  screenshot_path: screenshotPath || null,
  retrieved_at: retrievedAt || new Date().toISOString()
});

export const validateDiscrepancyRecord = (record) => {
  const requiredStringFields = [
    "page_url",
    "guideline_reference",
    "expected_text_content",
    "actual_text_content",
    "discrepancy_reason",
    "retrieved_at"
  ];

  for (const field of requiredStringFields) {
    if (!record[field] || typeof record[field] !== "string") return false;
  }

  return typeof record.discrepancy_flag === "boolean";
};
