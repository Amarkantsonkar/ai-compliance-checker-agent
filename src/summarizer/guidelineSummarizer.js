import { GoogleGenerativeAI } from "@google/generative-ai";
import { config, requireGeminiApiKey } from "../config/env.js";
import { paths } from "../config/paths.js";
import { readJson, writeText } from "../utils/fs.js";
import { logger } from "../utils/logger.js";

export const summarizeGuidelines = async () => {
  requireGeminiApiKey();
  const chunks = await readJson(paths.guidelineChunks, []);
  if (!chunks.length) {
    throw new Error(`No guideline chunks found at ${paths.guidelineChunks}. Run ingest first.`);
  }

  const model = new GoogleGenerativeAI(config.geminiApiKey).getGenerativeModel({
    model: "gemini-2.5-flash"
  });

  const response = await model.generateContent(`
Create a concise compliance-oriented summary of these WaiverPro guidelines.
Group by URL/page where possible and list important labels, buttons, required navigation items, support/legal text, and workflows.

${chunks.map((chunk) => `# ${chunk.section_title}\n${chunk.content}`).join("\n\n")}
`);

  const summary = response.response.text();
  await writeText(paths.summary, summary);
  logger.info("Guideline summary written", { output: paths.summary });
  return summary;
};
