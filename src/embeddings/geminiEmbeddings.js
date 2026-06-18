import { GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";
import { config, requireGeminiApiKey } from "../config/env.js";

export const createGeminiEmbeddings = () => {
  requireGeminiApiKey();
  return new GoogleGenerativeAIEmbeddings({
    apiKey: config.geminiApiKey,
    model: config.geminiEmbeddingModel
  });
};
