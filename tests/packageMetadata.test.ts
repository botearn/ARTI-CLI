import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(__dirname, "..");

describe("package and public documentation metadata", () => {
  it("points npm metadata at the canonical ARTI-CLI repository", () => {
    const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf-8"));

    expect(pkg.repository).toEqual({
      type: "git",
      url: "git+https://github.com/botearn/ARTI-CLI.git",
    });
    expect(pkg.homepage).toBe("https://github.com/botearn/ARTI-CLI#readme");
    expect(pkg.bugs).toEqual({
      url: "https://github.com/botearn/ARTI-CLI/issues",
    });
  });

  it("keeps visible docs free of stale repository links and local paths", () => {
    const docs = [
      "README.md",
      "CHANGELOG.md",
      "RELEASE_CHECKLIST.md",
      "RELEASE_NOTES_v0.3.0.md",
      "rfcs/2026/RFC-2026-0002-onboarding-install.md",
    ];
    const content = docs
      .map((file) => readFileSync(join(root, file), "utf-8"))
      .join("\n");

    expect(content).toContain("https://github.com/botearn/ARTI-CLI");
    expect(content).not.toContain("github.com/YuqingNicole/ARTI-CLI");
    expect(content).not.toContain("npm install -g arti-cli");
    expect(content).not.toContain("git push origin master");
    expect(content).not.toMatch(/\/Users\/[^\s)]+/);
  });
});
