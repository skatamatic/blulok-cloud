/** @type {import('eslint').Linter.Config} */
export default {
  root: true,
  env: { browser: true, es2022: true, node: true },
  extends: ['eslint:recommended'],
  parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
  ignorePatterns: ['out', 'dist', 'node_modules'],
};
