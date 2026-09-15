const config = {
  clearMocks: true,
  testEnvironment: "node",
  testMatch: ["<rootDir>/tests/**/*.test.ts"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
    "^ai$": "<rootDir>/tests/ai.mock.js",
    "^@ai-sdk/groq$": "<rootDir>/tests/groq.mock.js",
    "^server-only$": "<rootDir>/tests/server-only.mock.js",
  },
  transform: {
    "^.+\\.(t|j)sx?$": [
      "@swc/jest",
      {
        jsc: {
          parser: {
            syntax: "typescript",
            tsx: true,
          },
          target: "es2022",
        },
        module: {
          type: "commonjs",
        },
      },
    ],
  },
};

export default config;
