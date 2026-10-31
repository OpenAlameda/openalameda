import { describe, expect, it } from "vitest";
import { siteUrl } from "./site-url";

describe("siteUrl", () => {
  it("prefers SITE_URL over every Vercel variable", () => {
    const env = {
      SITE_URL: "https://openalameda.org",
      VERCEL_ENV: "production",
      VERCEL_PROJECT_PRODUCTION_URL: "openalameda.vercel.app",
      VERCEL_URL: "openalameda-abc123.vercel.app",
    };
    expect(siteUrl(env).href).toBe("https://openalameda.org/");
  });

  it("uses the production URL in production", () => {
    const env = {
      VERCEL_ENV: "production",
      VERCEL_PROJECT_PRODUCTION_URL: "openalameda.vercel.app",
      VERCEL_URL: "openalameda-abc123.vercel.app",
    };
    expect(siteUrl(env).href).toBe("https://openalameda.vercel.app/");
  });

  it("uses the deployment URL in preview", () => {
    const env = {
      VERCEL_ENV: "preview",
      VERCEL_URL: "openalameda-abc123.vercel.app",
    };
    expect(siteUrl(env).href).toBe("https://openalameda-abc123.vercel.app/");
  });

  it("falls back to localhost", () => {
    expect(siteUrl({}).href).toBe("http://localhost:3000/");
  });

  it("does not double a trailing slash", () => {
    expect(siteUrl({ SITE_URL: "https://openalameda.org/" }).href).toBe("https://openalameda.org/");
  });
});
