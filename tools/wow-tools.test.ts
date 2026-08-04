import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { homedir, tmpdir } from "node:os";

let root = "";
const originalFetch = globalThis.fetch;

async function importFresh(path: string) {
  return import(`${path}?test=${crypto.randomUUID()}`);
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "wow-tools-"));
});

afterEach(async () => {
  mock.restore();
  globalThis.fetch = originalFetch;
  delete process.env.WOW_ANNOTATIONS_ROOT;
  delete process.env.WOW_FRAMEXML_ROOT;
  delete process.env.WOW_RG_COMMAND;
  await rm(root, { recursive: true, force: true });
});

describe("defaultDataRoot (platform-native annotation storage)", () => {
  const toolFiles = [
    "./wow-api-lookup.ts",
    "./wow-event-info.ts",
    "./wow-blizzard-source.ts",
  ] as const;

  for (const file of toolFiles) {
    test(`${file} resolves Windows and Unix data roots identically`, async () => {
      const { defaultDataRoot } = await importFresh(file);

      expect(defaultDataRoot("wow-annotations", "win32", { LOCALAPPDATA: "C:\\Users\\you\\AppData\\Local" })).toBe(
        join("C:\\Users\\you\\AppData\\Local", "wow-annotations"),
      );
      expect(defaultDataRoot("wow-framexml", "win32", {})).toBe(
        join(homedir(), "AppData", "Local", "wow-framexml"),
      );
      expect(defaultDataRoot("wow-annotations", "darwin", {})).toBe(
        join(homedir(), ".local", "share", "wow-annotations"),
      );
      expect(defaultDataRoot("wow-annotations", "linux", { LOCALAPPDATA: "ignored" })).toBe(
        join(homedir(), ".local", "share", "wow-annotations"),
      );
    });
  }
});

describe("wow-api-lookup", () => {
  test("returns complete long annotation signatures", async () => {
    process.env.WOW_ANNOTATIONS_ROOT = root;
    const apiDir = join(root, "Annotations/Core/Blizzard_APIDocumentationGenerated");
    await mkdir(apiDir, { recursive: true });
    const params = Array.from({ length: 14 }, (_, i) => `---@param p${i} string`);
    await writeFile(
      join(apiDir, "Item.lua"),
      `${params.join("\n")}\n---@return string result\nfunction C_Item.GetItemInfo(p0) end\n`,
    );
    const tool = (await importFresh("./wow-api-lookup.ts")).default;
    const output = await tool.execute({ query: "C_Item.GetItemInfo" });
    expect(output).toContain("---@param p0 string");
    expect(output).toContain("---@param p13 string");
    expect(output).toContain("---@return string result");
  });

  test("surfaces non-absence Classic override read failures", async () => {
    process.env.WOW_ANNOTATIONS_ROOT = root;
    const apiDir = join(root, "Annotations/Core/Blizzard_APIDocumentationGenerated");
    await mkdir(apiDir, { recursive: true });
    await writeFile(join(apiDir, "Item.lua"), "function C_Item.GetItemInfo() end\n");
    await mkdir(join(root, "Annotations/Core/Data/Classic.lua"), { recursive: true });
    const tool = (await importFresh("./wow-api-lookup.ts")).default;
    await expect(tool.execute({ query: "C_Item.GetItemInfo" })).rejects.toThrow(
      "wow-api-lookup: failed reading optional Classic overrides",
    );
  });

});

describe("wow-event-info", () => {
  test("wraps missing and corrupt catalog errors", async () => {
    process.env.WOW_ANNOTATIONS_ROOT = root;
    let tool = (await importFresh("./wow-event-info.ts")).default;
    await expect(tool.execute({ event: "PLAYER_LOGIN" })).rejects.toThrow(
      "wow-event-info: failed reading event catalog",
    );

    const dataDir = join(root, "Annotations/Core/Data");
    await mkdir(dataDir, { recursive: true });
    await writeFile(join(dataDir, "Event.lua"), '---|"BROKEN" trailing garbage\n');
    tool = (await importFresh("./wow-event-info.ts")).default;
    await expect(tool.execute({ event: "PLAYER_LOGIN" })).rejects.toThrow(
      "wow-event-info: failed parsing event catalog",
    );
  });

  test("caps UTF-8 without splitting a multibyte character", async () => {
    const { truncateUtf8 } = await importFresh("./wow-event-info.ts");
    const output = truncateUtf8("abc😀xyz", 6);
    expect(Buffer.byteLength(output, "utf8")).toBeLessThanOrEqual(6);
    expect(output).toBe("abc");
  });

  test("returns the existing exact-match public path", async () => {
    process.env.WOW_ANNOTATIONS_ROOT = root;
    const dataDir = join(root, "Annotations/Core/Data");
    await mkdir(dataDir, { recursive: true });
    await writeFile(
      join(dataDir, "Event.lua"),
      '---|"PLAYER_LOGIN"\n---|"PLAYER_LOGOUT" # `reason`\n',
    );
    const tool = (await importFresh("./wow-event-info.ts")).default;
    const output = await tool.execute({ event: "player_logout" });
    expect(output).toContain("# PLAYER_LOGOUT");
    expect(output).toContain("`reason`");
  });

  test("caps an oversized exact event row with an explicit marker", async () => {
    process.env.WOW_ANNOTATIONS_ROOT = root;
    const dataDir = join(root, "Annotations/Core/Data");
    await mkdir(dataDir, { recursive: true });
    await writeFile(
      join(dataDir, "Event.lua"),
      `---|"PLAYER_LOGIN" # \`${"😀".repeat(11_000)}\`\n`,
    );
    const tool = (await importFresh("./wow-event-info.ts")).default;
    const output = await tool.execute({ event: "PLAYER_LOGIN" });
    expect(Buffer.byteLength(output, "utf8")).toBeLessThanOrEqual(40_000);
    expect(output).toEndWith("... [truncated to 40000-byte limit]\n");
    expect(output).not.toContain("�");
  });
});

describe("wow-blizzard-source", () => {
  test("reports capped matches without claiming an exact total", async () => {
    process.env.WOW_FRAMEXML_ROOT = root;
    const annotations = join(root, "live/Annotations");
    await mkdir(annotations, { recursive: true });
    await writeFile(
      join(annotations, "Many.lua.annotated.lua"),
      Array.from({ length: 8 }, (_, i) => `needle ${i}`).join("\n"),
    );
    const tool = (await importFresh("./wow-blizzard-source.ts")).default;
    const result = await tool.execute({ pattern: "needle", flavor: "live", scope: "lua" });
    expect(result.metadata.matchCount).toBe(5);
    expect(result.output).toContain("capped at 5 per file");
    expect(result.output).not.toContain("3 more matches");
  });

  test("normalizes missing rg failures", async () => {
    process.env.WOW_FRAMEXML_ROOT = root;
    process.env.WOW_RG_COMMAND = join(root, "missing-rg");
    await mkdir(join(root, "live/Annotations"), { recursive: true });
    const tool = (await importFresh("./wow-blizzard-source.ts")).default;
    await expect(
      tool.execute({ pattern: "needle", flavor: "live", scope: "lua" }),
    ).rejects.toThrow("wow-blizzard-source: failed to launch rg");
  });

  test("keeps truncation counts as lower bounds", async () => {
    process.env.WOW_FRAMEXML_ROOT = root;
    const annotations = join(root, "live/Annotations");
    await mkdir(annotations, { recursive: true });
    await writeFile(
      join(annotations, "Large.lua.annotated.lua"),
      `needle ${"x".repeat(41_000)}\n`,
    );
    await writeFile(join(annotations, "Other.lua.annotated.lua"), "needle\n");
    const tool = (await importFresh("./wow-blizzard-source.ts")).default;
    const result = await tool.execute({ pattern: "needle", flavor: "live", scope: "lua" });
    expect(result.metadata.selfTruncated).toBe(true);
    expect(result.metadata.matchCount).toBeLessThan(2);
    expect(result.output).toContain("more file(s) have matches not shown");
    expect(Buffer.byteLength(result.output, "utf8")).toBeLessThanOrEqual(40_000);
  });

});

describe("wow-wiki-fetch helpers", () => {
  test("rejects cross-host redirects before following", async () => {
    const { fetchWithRedirects } = await importFresh("./wow-wiki-fetch.ts");
    globalThis.fetch = mock(() =>
      Promise.resolve(
        new Response(null, {
          status: 302,
          headers: { location: "https://example.com/steal" },
        }),
      ),
    ) as unknown as typeof fetch;
    await expect(
      fetchWithRedirects("https://warcraft.wiki.gg/wiki/Test"),
    ).rejects.toThrow("wow-wiki-fetch: redirect URL must use");
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  test("enforces timeout and streaming byte limits", async () => {
    const { fetchWithRedirects, readBoundedBody } = await importFresh("./wow-wiki-fetch.ts");
    globalThis.fetch = mock((_url: string, init?: RequestInit) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
      }),
    ) as unknown as typeof fetch;
    await expect(
      fetchWithRedirects("https://warcraft.wiki.gg/wiki/Test", 5),
    ).rejects.toThrow("wow-wiki-fetch: request timed out");

    const response = new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array(8));
          controller.enqueue(new Uint8Array(8));
          controller.close();
        },
      }),
    );
    await expect(readBoundedBody(response, 10)).rejects.toThrow(
      "wow-wiki-fetch: response body exceeds 10 bytes",
    );
  });

  test("cancels a stalled response body when reading times out", async () => {
    const { readBoundedBody } = await importFresh("./wow-wiki-fetch.ts");
    let wasCancelled = false;
    const response = new Response(
      new ReadableStream({
        pull() {
          return new Promise(() => {});
        },
        cancel() {
          wasCancelled = true;
        },
      }),
    );
    const originalSetTimeout = globalThis.setTimeout;
    globalThis.setTimeout = ((callback: TimerHandler) =>
      originalSetTimeout(callback, 0)) as typeof setTimeout;
    try {
      await expect(readBoundedBody(response)).rejects.toThrow(
        "wow-wiki-fetch: response body timed out",
      );
      expect(wasCancelled).toBe(true);
    } finally {
      globalThis.setTimeout = originalSetTimeout;
    }
  });

  test("cancels a response body rejected by its declared length", async () => {
    const { readBoundedBody } = await importFresh("./wow-wiki-fetch.ts");
    let wasCancelled = false;
    const response = new Response(
      new ReadableStream({
        cancel() {
          wasCancelled = true;
        },
      }),
      { headers: { "content-length": "11" } },
    );

    await expect(readBoundedBody(response, 10)).rejects.toThrow(
      "wow-wiki-fetch: response body exceeds 10 bytes",
    );
    expect(wasCancelled).toBe(true);
  });

  test("preserves safe article links and removes chrome", async () => {
    const { renderHtml, stripChrome } = await importFresh("./wow-wiki-fetch.ts");
    const html = stripChrome(
      '<div id="toc"><a href="/wiki/Noise">Noise</a></div><p>See <a href="/wiki/API_UnitName">UnitName</a> and <a href="https://example.com">unsafe</a>.</p>',
    );
    const output = renderHtml(html);
    expect(output).toContain("[UnitName](/wiki/API_UnitName)");
    expect(output).toContain("unsafe");
    expect(output).not.toContain("example.com");
    expect(output).not.toContain("Noise");
  });

  test("removes nested MediaWiki chrome without leaking its tail", async () => {
    const { renderHtml, stripChrome } = await importFresh("./wow-wiki-fetch.ts");
    const html = stripChrome(
      '<div id="toc"><div class="toc-section"><ul><li>Nested noise</li></ul></div><p>Trailing noise</p></div><p>Article body.</p>',
    );
    const output = renderHtml(html);
    expect(output).toBe("Article body.");
    expect(output).not.toContain("noise");
  });

  test("removes nested catlinks without leaking sibling chrome", async () => {
    const { renderHtml, stripChrome } = await importFresh("./wow-wiki-fetch.ts");
    const html = stripChrome(
      '<div id="catlinks"><div class="first">First category</div><div class="second">Leaked category</div></div><p>Article body.</p>',
    );
    const output = renderHtml(html);
    expect(output).toBe("Article body.");
    expect(output).not.toContain("category");
  });

  test("records only successful redirect metadata", async () => {
    const article = (redirectedFrom?: string) => `<!doctype html><html><head><title>Target - Warcraft Wiki</title><script>RLCONF={${redirectedFrom ? `"wgRedirectedFrom":"${redirectedFrom}"` : ""}}</script></head><body><h1 id="firstHeading">Target</h1><div id="mw-content-text"><p>Article body.</p></div></body></html>`;
    const module = await importFresh("./wow-wiki-fetch.ts");
    const tool = module.default;
    globalThis.fetch = mock(() => Promise.resolve(new Response(article("Old_Page"), { status: 200 }))) as unknown as typeof fetch;
    const redirected = await tool.execute({ page: "Target" });
    expect(redirected.metadata.redirectedFrom).toBe("Old_Page");

    globalThis.fetch = mock(() =>
      Promise.resolve(
        new Response('<div class="noarticletext">missing</div><script>RLCONF={"wgRedirectedFrom":"Old_Page"}</script>', {
          status: 404,
        }),
      ),
    ) as unknown as typeof fetch;
    const missing = await tool.execute({ page: "Missing" });
    expect(missing.metadata.redirectedFrom).toBeUndefined();
  });

  test("records a validated HTTP page redirect", async () => {
    const module = await importFresh("./wow-wiki-fetch.ts");
    const tool = module.default;
    const article = '<title>Target - Warcraft Wiki</title><h1 id="firstHeading">Target</h1><div id="mw-content-text"><p>Body.</p></div>';
    let request = 0;
    globalThis.fetch = mock(() => {
      request++;
      if (request === 1) {
        return Promise.resolve(
          new Response(null, {
            status: 302,
            headers: { location: "/wiki/Target" },
          }),
        );
      }
      return Promise.resolve(new Response(article, { status: 200 }));
    }) as unknown as typeof fetch;
    const result = await tool.execute({ page: "Old" });
    expect(result.metadata.redirectedFrom).toBe(
      "https://warcraft.wiki.gg/wiki/Old",
    );
    expect(result.metadata.url).toBe("https://warcraft.wiki.gg/wiki/Target");
  });
});
