import fs from "node:fs/promises";
import path from "node:path";

export const ensureDir = async (dirPath) => {
  await fs.mkdir(dirPath, { recursive: true });
};

export const writeJson = async (filePath, data) => {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
};

export const readJson = async (filePath, fallback = null) => {
  try {
    const content = await fs.readFile(filePath, "utf8");
    return JSON.parse(content);
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw error;
  }
};

export const writeText = async (filePath, data) => {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, data, "utf8");
};

export const readText = async (filePath, fallback = "") => {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw error;
  }
};
