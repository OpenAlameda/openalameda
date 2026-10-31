import { describe, expect, it } from "vitest";
import { PAGES, pageMetadata } from "./metadata";

describe("pageMetadata", () => {
  const about = pageMetadata(PAGES.about);

  it("sets title and canonical path", () => {
    expect(about.title).toBe("About");
    expect(about.alternates?.canonical).toBe("/about");
  });

  it("sets Open Graph fields", () => {
    expect(about.openGraph).toMatchObject({
      title: "About",
      description: PAGES.about.description,
      url: "/about",
      siteName: "OpenAlameda",
      type: "website",
    });
  });

  it("sets the Twitter card", () => {
    expect(about.twitter).toMatchObject({
      card: "summary_large_image",
      title: "About",
    });
  });

  it("uses an absolute title for the home page", () => {
    expect(pageMetadata(PAGES.home).title).toEqual({ absolute: "OpenAlameda" });
  });

  it("never sets Open Graph images", () => {
    for (const page of Object.values(PAGES)) {
      expect(pageMetadata(page).openGraph).not.toHaveProperty("images");
    }
  });
});
