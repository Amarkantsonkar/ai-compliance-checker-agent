import { createGeminiEmbeddings } from "./geminiEmbeddings.js";
import { getCollection, VECTOR_COLLECTIONS } from "./chromaClient.js";
import { config } from "../config/env.js";
import { logger } from "../utils/logger.js";

const BATCH_SIZE = 1;

const assertCollectionName = (collectionName) => {
  if (!collectionName || typeof collectionName !== "string") {
    throw new Error("collectionName must be a non-empty string.");
  }
};

const normalizeDocument = (document, index) => {
  if (typeof document === "string") {
    return {
      id: `document-${index + 1}`,
      text: document,
      metadata: {}
    };
  }

  return {
    id: document.id || `document-${index + 1}`,
    text: document.text || document.content || document.document || "",
    metadata: document.metadata || {}
  };
};

const toChromaResults = (results) =>
  (results.ids?.[0] || []).map((id, index) => ({
    id,
    document: results.documents?.[0]?.[index] || "",
    metadata: results.metadatas?.[0]?.[index] || {},
    distance: results.distances?.[0]?.[index] ?? null
  }));

const invalidVectorIndex = (vectors, texts) => {
  if (!Array.isArray(vectors) || vectors.length !== texts.length) return 0;

  return vectors.findIndex(
    (vector) => !Array.isArray(vector) || vector.length === 0 || vector.some((value) => typeof value !== "number")
  );
};

const assertValidVectors = (vectors, texts) => {
  if (!Array.isArray(vectors) || vectors.length !== texts.length) {
    throw new Error(
      `Embedding service returned ${vectors?.length || 0} vectors for ${texts.length} documents using ${config.geminiEmbeddingModel}.`
    );
  }

  const invalidIndex = invalidVectorIndex(vectors, texts);

  if (invalidIndex !== -1) {
    throw new Error(
      `Embedding service returned an invalid vector at batch index ${invalidIndex} using ${config.geminiEmbeddingModel}.`
    );
  }
};

const embedTextsSafely = async (embeddings, texts) => {
  const vectors = await embeddings.embedDocuments(texts);
  if (invalidVectorIndex(vectors, texts) === -1) return vectors;

  logger.warn("Batch document embedding returned invalid vectors; falling back to per-document embedQuery", {
    model: config.geminiEmbeddingModel,
    documents: texts.length
  });

  const fallbackVectors = [];
  for (const text of texts) {
    fallbackVectors.push(await embeddings.embedQuery(text));
  }

  assertValidVectors(fallbackVectors, texts);
  return fallbackVectors;
};

export class VectorStoreService {
  constructor({ collectionName, collectionMetadata = {} }) {
    assertCollectionName(collectionName);
    this.collectionName = collectionName;
    this.collectionMetadata = collectionMetadata;
    this.embeddings = createGeminiEmbeddings();
  }

  async collection() {
    return getCollection(this.collectionName, {
      ...this.collectionMetadata,
      embedding_model: config.geminiEmbeddingModel
    });
  }

  async addDocuments(documents = []) {
    if (!Array.isArray(documents)) {
      throw new Error("documents must be an array.");
    }

    const normalized = documents.map(normalizeDocument).filter((document) => document.text.trim());
    if (!normalized.length) {
      logger.warn("No non-empty documents provided for vector indexing", { collection: this.collectionName });
      return { collection: this.collectionName, added: 0 };
    }

    const collection = await this.collection();
    let added = 0;

    for (let start = 0; start < normalized.length; start += BATCH_SIZE) {
      const batch = normalized.slice(start, start + BATCH_SIZE);
      const texts = batch.map((document) => document.text);
      const vectors = await embedTextsSafely(this.embeddings, texts);

      await collection.upsert({
        ids: batch.map((document) => document.id),
        documents: texts,
        embeddings: vectors,
        metadatas: batch.map((document) => ({
          ...document.metadata,
          indexed_at: new Date().toISOString()
        }))
      });
      added += batch.length;
    }

    logger.info("Documents indexed in ChromaDB", {
      collection: this.collectionName,
      added
    });

    return { collection: this.collectionName, added };
  }

  async searchDocuments(query, options = {}) {
    if (!query || typeof query !== "string") {
      throw new Error("query must be a non-empty string.");
    }

    const collection = await this.collection();
    const queryEmbedding = await this.embeddings.embedQuery(query);
    assertValidVectors([queryEmbedding], [query]);
    const results = await collection.query({
      queryEmbeddings: [queryEmbedding],
      nResults: options.limit || options.k || 5,
      where: options.where,
      whereDocument: options.whereDocument
    });

    return toChromaResults(results);
  }

  async deleteDocuments(options = {}) {
    const collection = await this.collection();

    if (Array.isArray(options.ids) && options.ids.length) {
      await collection.delete({ ids: options.ids });
      logger.info("Documents deleted by id from ChromaDB", {
        collection: this.collectionName,
        deleted: options.ids.length
      });
      return { collection: this.collectionName, deleted: options.ids.length };
    }

    if (options.where || options.whereDocument) {
      await collection.delete({
        where: options.where,
        whereDocument: options.whereDocument
      });
      logger.info("Documents deleted by filter from ChromaDB", {
        collection: this.collectionName
      });
      return { collection: this.collectionName, deleted: null };
    }

    throw new Error("deleteDocuments requires ids, where, or whereDocument.");
  }
}

export const createGuidelinesVectorStore = () =>
  new VectorStoreService({
    collectionName: VECTOR_COLLECTIONS.guidelines,
    collectionMetadata: {
      description: "WaiverPro guideline chunks"
    }
  });

export const createWebsiteVectorStore = () =>
  new VectorStoreService({
    collectionName: VECTOR_COLLECTIONS.website,
    collectionMetadata: {
      description: "WaiverPro website summaries"
    }
  });

export const addDocuments = async (collectionName, documents) =>
  new VectorStoreService({ collectionName }).addDocuments(documents);

export const searchDocuments = async (collectionName, query, options = {}) =>
  new VectorStoreService({ collectionName }).searchDocuments(query, options);

export const deleteDocuments = async (collectionName, options = {}) =>
  new VectorStoreService({ collectionName }).deleteDocuments(options);
