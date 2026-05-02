/**
 * Logging Utilities
 * 
 * Structured logging for all operations.
 * Use this for visibility into what's happening in the system.
 */

export const logger = {
  log: (message: string, data?: Record<string, unknown>) => {
    console.log(
      JSON.stringify({
        level: "INFO",
        timestamp: new Date().toISOString(),
        message,
        ...data,
      })
    );
  },

  debug: (message: string, data?: Record<string, unknown>) => {
    if (process.env.LOG_LEVEL === "debug") {
      console.debug(
        JSON.stringify({
          level: "DEBUG",
          timestamp: new Date().toISOString(),
          message,
          ...data,
        })
      );
    }
  },

  warn: (message: string, data?: Record<string, unknown>) => {
    console.warn(
      JSON.stringify({
        level: "WARN",
        timestamp: new Date().toISOString(),
        message,
        ...data,
      })
    );
  },

  error: (message: string, data?: Record<string, unknown>) => {
    console.error(
      JSON.stringify({
        level: "ERROR",
        timestamp: new Date().toISOString(),
        message,
        ...data,
      })
    );
  },
};
