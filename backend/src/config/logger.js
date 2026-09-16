export const logger = {
  info(message, metadata = {}) {
    console.log(
      JSON.stringify({
        level: "info",
        message,
        timestamp: new Date().toISOString(),
        ...metadata,
      }),
    );
  },

  warn(message, metadata = {}) {
    console.warn(
      JSON.stringify({
        level: "warn",
        message,
        timestamp: new Date().toISOString(),
        ...metadata,
      }),
    );
  },

  error(message, metadata = {}) {
    console.error(
      JSON.stringify({
        level: "error",
        message,
        timestamp: new Date().toISOString(),
        ...metadata,
      }),
    );
  },
};