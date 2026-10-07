import { describe, expect, it } from "vitest";
import { ProviderConfigError, selectExecutionProvider } from "./provider-select.js";

const REAL = { EXECUTION_API_URL: "https://exec.example", EXECUTION_TOKEN: "tok" };

describe("selectExecutionProvider", () => {
  it("uses the HTTP provider when fully configured, in any environment", () => {
    expect(selectExecutionProvider({ ...REAL }).name).toBe("modal-http");
    expect(selectExecutionProvider({ ...REAL, NODE_ENV: "production" }).name).toBe("modal-http");
    expect(selectExecutionProvider({ ...REAL, VERCEL_ENV: "production" }).name).toBe("modal-http");
    expect(
      selectExecutionProvider({ ...REAL, NODE_ENV: "production", KP_ALLOW_MOCK_PROVIDER: "1" }).name,
    ).toBe("modal-http");
  });

  it("falls back to the mock in development / test", () => {
    expect(selectExecutionProvider({}).name).toBe("mock");
    expect(selectExecutionProvider({ NODE_ENV: "development" }).name).toBe("mock");
    expect(selectExecutionProvider({ NODE_ENV: "test" }).name).toBe("mock");
    expect(selectExecutionProvider({ NODE_ENV: "development", VERCEL_ENV: "preview" }).name).toBe(
      "mock",
    );
  });

  it("throws in production when config is missing", () => {
    expect(() => selectExecutionProvider({ NODE_ENV: "production" })).toThrow(ProviderConfigError);
    expect(() => selectExecutionProvider({ VERCEL_ENV: "production" })).toThrow(ProviderConfigError);
    expect(() =>
      selectExecutionProvider({ NODE_ENV: "production", VERCEL_ENV: "preview" }),
    ).toThrow(ProviderConfigError);
  });

  it("throws in production when config is only partially set, naming what's missing", () => {
    expect(() =>
      selectExecutionProvider({ NODE_ENV: "production", EXECUTION_API_URL: "https://x" }),
    ).toThrow(/missing EXECUTION_TOKEN/);
    expect(() =>
      selectExecutionProvider({ VERCEL_ENV: "production", EXECUTION_TOKEN: "tok" }),
    ).toThrow(/missing EXECUTION_API_URL/);
  });

  it("treats empty strings as missing", () => {
    expect(() =>
      selectExecutionProvider({ NODE_ENV: "production", EXECUTION_API_URL: "", EXECUTION_TOKEN: "" }),
    ).toThrow(ProviderConfigError);
  });

  it("allows the mock in production only with KP_ALLOW_MOCK_PROVIDER=1", () => {
    expect(
      selectExecutionProvider({ NODE_ENV: "production", KP_ALLOW_MOCK_PROVIDER: "1" }).name,
    ).toBe("mock");
    expect(
      selectExecutionProvider({ VERCEL_ENV: "production", KP_ALLOW_MOCK_PROVIDER: "1" }).name,
    ).toBe("mock");
    for (const v of ["0", "true", "", "yes"]) {
      expect(() =>
        selectExecutionProvider({ NODE_ENV: "production", KP_ALLOW_MOCK_PROVIDER: v }),
      ).toThrow(ProviderConfigError);
    }
  });
});
