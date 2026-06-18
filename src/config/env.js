import dotenv from "dotenv";

dotenv.config();

const booleanFromEnv = (value, fallback = false) => {
  if (value === undefined || value === "") return fallback;
  return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
};

const numberFromEnv = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const config = Object.freeze({
  env: process.env.NODE_ENV || "development",
  port: numberFromEnv(process.env.PORT, 3000),
  targetUrl: process.env.TARGET_URL || "https://white-cliff-0bca3ed00.1.azurestaticapps.net/",
  loginEmail: process.env.LOGIN_EMAIL || "admin@gmail.com",
  loginPassword: process.env.LOGIN_PASSWORD || "password",
  geminiApiKey: process.env.GEMINI_API_KEY || "",
  geminiEmbeddingModel: process.env.GEMINI_EMBEDDING_MODEL || "text-embedding-004",
  chromaUrl: process.env.CHROMA_URL || "http://localhost:8000",
  chromaCollection: process.env.CHROMA_COLLECTION || "guidelines_collection",
  guidelinesCollection: process.env.GUIDELINES_COLLECTION || process.env.CHROMA_COLLECTION || "guidelines_collection",
  websiteCollection: process.env.WEBSITE_COLLECTION || "website_collection",
  guidelinesPdfPath: process.env.GUIDELINES_PDF_PATH || "/home/amar/Desktop/WaiverPro-User-Guidelines.pdf",
  headless: booleanFromEnv(process.env.HEADLESS, true),
  crawlMaxPages: numberFromEnv(process.env.CRAWL_MAX_PAGES, 25),
  ruleExtractionDelayMs: numberFromEnv(process.env.RULE_EXTRACTION_DELAY_MS, 15000),
  screenshotDir: "screenshots",
  dataDir: "data"
});

export const requireGeminiApiKey = () => {
  if (!config.geminiApiKey) {
    throw new Error("GEMINI_API_KEY is required for AI extraction, embeddings, summarization, QA, and comparison.");
  }
};
