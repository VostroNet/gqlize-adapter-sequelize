/** @type {import('ts-jest/dist/types').InitialOptionsTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ["**/?(*.)+(spec|test).[jt]s?(x)"],
  collectCoverage: true,
  collectCoverageFrom: [
    "**/*.{ts,js}",
    "!**/node_modules/**",
    "!**/coverage/**",
    "!src/types/**",
    "!lib/**",
    "!jest.config.js",
    "!.yalc/**",
    "!__tests__/**",
  ],
  coveragePathIgnorePatterns: ["/node_modules/"],

};