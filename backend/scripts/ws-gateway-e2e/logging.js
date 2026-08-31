/* eslint-disable no-console */

/** ANSI / console helpers for the gateway E2E suite. */

const C = {
  reset: '\x1b[0m',
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  blue: (s) => `\x1b[34m${s}\x1b[0m`,
  magenta: (s) => `\x1b[35m${s}\x1b[0m`,
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
  gray: (s) => `\x1b[90m${s}\x1b[0m`,
};

function delay(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

function heading(text) {
  console.log(C.bold(C.cyan(`\n▸ ${text}`)));
}

function ok(text) {
  console.log(C.green(`  ✔ ${text}`));
}

function warn(text) {
  console.log(C.yellow(`  ⚠ ${text}`));
}

function info(text) {
  console.log(C.blue(`  • ${text}`));
}

function step(text) {
  console.log(C.magenta(`→ ${text}`));
}

module.exports = {
  C,
  delay,
  heading,
  ok,
  warn,
  info,
  step,
};
