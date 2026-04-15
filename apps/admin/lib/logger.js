// logger.js - Simple logging module
const LOG_LEVEL = process.env.LOG_LEVEL || (process.env.RAILWAY_ENVIRONMENT ? 'error' : 'debug');

const log = {
  error: (...args) => console.error(...args),
  warn: (...args) => ['warn', 'info', 'debug'].includes(LOG_LEVEL) && console.warn(...args),
  info: (...args) => ['info', 'debug'].includes(LOG_LEVEL) && console.log(...args),
  debug: (...args) => LOG_LEVEL === 'debug' && console.log(...args)
};

module.exports = log;
