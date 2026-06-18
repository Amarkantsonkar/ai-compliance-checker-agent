const levels = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40
};

const currentLevel = levels[process.env.LOG_LEVEL || "info"] ?? levels.info;

const write = (level, message, meta = {}) => {
  if (levels[level] < currentLevel) return;

  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...meta
  };

  const line = JSON.stringify(entry);
  if (level === "error") {
    console.error(line);
    return;
  }
  console.log(line);
};

export const logger = {
  debug: (message, meta) => write("debug", message, meta),
  info: (message, meta) => write("info", message, meta),
  warn: (message, meta) => write("warn", message, meta),
  error: (message, meta) => write("error", message, meta)
};
