const COLORS = {
  reset: '\x1b[0m',
  info: '\x1b[36m',    // cyan
  success: '\x1b[32m', // green
  warn: '\x1b[33m',    // yellow
  error: '\x1b[31m',   // red
};

function timestamp() {
  return new Date().toISOString().replace('T', ' ').substring(0, 19);
}

const logger = {
  info: (msg, ...args) => {
    console.log(`${COLORS.info}[${timestamp()}] INFO${COLORS.reset}  ${msg}`, ...args);
  },
  success: (msg, ...args) => {
    console.log(`${COLORS.success}[${timestamp()}] OK${COLORS.reset}    ${msg}`, ...args);
  },
  warn: (msg, ...args) => {
    console.warn(`${COLORS.warn}[${timestamp()}] WARN${COLORS.reset}  ${msg}`, ...args);
  },
  error: (msg, ...args) => {
    console.error(`${COLORS.error}[${timestamp()}] ERROR${COLORS.reset} ${msg}`, ...args);
  },
};

module.exports = { logger };
