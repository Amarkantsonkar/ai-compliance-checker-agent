import { paths } from "../config/paths.js";
import { readJson } from "../utils/fs.js";
import { logger } from "../utils/logger.js";
import { createGuidelinesVectorStore } from "./vectorStoreService.js";

export const indexGuidelines = async () => {
  const chunks = await readJson(paths.guidelineChunks, []);
  if (!chunks.length) {
    throw new Error(`No guideline chunks found at ${paths.guidelineChunks}. Run ingest first.`);
  }

  const vectorStore = createGuidelinesVectorStore();
  const documents = chunks.map((chunk) => ({
    id: chunk.id,
    text: chunk.content,
    metadata: {
      type: "guideline_chunk",
      section_number: chunk.section_number || "",
      section_title: chunk.section_title || "",
      subsection: chunk.subsection || "",
      source_page: chunk.source_page || "",
      source_path: chunk.source_path || ""
    }
  }));

  const result = await vectorStore.addDocuments(documents);
  logger.info("Guidelines indexed in ChromaDB", result);
  return { indexed: result.added, collection: result.collection };
};

export const retrieveGuidelineContext = async (query, k = 5) => {
  const vectorStore = createGuidelinesVectorStore();
  return vectorStore.searchDocuments(query, { limit: k });
};
