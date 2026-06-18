import { ChromaClient } from "chromadb";
import { config } from "../config/env.js";

export const VECTOR_COLLECTIONS = Object.freeze({
  guidelines: config.guidelinesCollection,
  website: config.websiteCollection
});

export const createChromaClient = () =>
  new ChromaClient({
    path: config.chromaUrl
  });

export const getCollection = async (name, metadata = {}) => {
  const client = createChromaClient();
  return client.getOrCreateCollection({
    name,
    metadata
  });
};

export const getGuidelineCollection = async () =>
  getCollection(VECTOR_COLLECTIONS.guidelines, {
    description: "WaiverPro guideline chunks embedded with Gemini",
    embedding_model: config.geminiEmbeddingModel
  });

export const getWebsiteCollection = async () =>
  getCollection(VECTOR_COLLECTIONS.website, {
    description: "WaiverPro website summaries and page/component content embedded with Gemini",
    embedding_model: config.geminiEmbeddingModel
  });
