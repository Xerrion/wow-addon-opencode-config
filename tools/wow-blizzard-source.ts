import { tool } from "@opencode-ai/plugin";
import path from "node:path";
import { readdirSync, existsSync, statSync } from "node:fs";

const FRAMEXML_BASE = path.join(
  process.env.HOME || "~",
  ".local/share/wow-annotations/Annotations/FrameXML/Annotations",
);

const ADDONS_DIR = path.join(FRAMEXML_BASE, "AddOns");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function assertFrameXMLExists(): void {
  if (!existsSync(FRAMEXML_BASE)) {
    throw new Error(
      `FrameXML annotations not found at ${FRAMEXML_BASE}. ` +
        "Install wow-annotations to ~/.local/share/wow-annotations/",
    );
  }
}

function resolveFrameXMLPath(scope?: string): string {
  if (!scope) return FRAMEXML_BASE;

  // Scope can be a file-type filter ("lua" / "xml") - these don't narrow the path
  if (scope === "lua" || scope === "xml") return FRAMEXML_BASE;

  // Otherwise treat scope as an addon directory name
  const addonPath = path.join(ADDONS_DIR, scope);
  if (!existsSync(addonPath) || !statSync(addonPath).isDirectory()) {
    throw new Error(
      `Addon "${scope}" not found under ${ADDONS_DIR}. ` +
        'Use mode "list" to see available addon directories.',
    );
  }
  return addonPath;
}

function globForScope(scope?: string): string {
  if (scope === "lua") return "*.lua.annotated.lua";
  if (scope === "xml") return "*.xml.annotated.lua";
  return "*.lua";
}

function stripBasePath(absolutePath: string): string {
  return absolutePath.startsWith(FRAMEXML_BASE)
    ? absolutePath.slice(FRAMEXML_BASE.length + 1)
    : absolutePath;
}

function formatSourceOutput(raw: string): string {
  return raw
    .split("\n")
    .map((line) => {
      const colonIdx = line.indexOf(":");
      if (colonIdx === -1) return line;
      const filePart = line.slice(0, colonIdx);
      const rest = line.slice(colonIdx);
      return stripBasePath(filePart) + rest;
    })
    .join("\n");
}

async function runRg(args: string[]): Promise<string> {
  const proc = Bun.spawn(["rg", ...args], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;

  // rg exits 1 when no matches - not an error
  if (exitCode > 1) {
    throw new Error(`ripgrep failed (exit ${exitCode}): ${stderr.trim()}`);
  }
  return stdout.trim();
}

async function searchBlizzardSource(
  query: string,
  searchPath: string,
  caseSensitive: boolean,
  glob: string,
  context: number,
  maxCount: number,
): Promise<string> {
  const args = [
    ...(caseSensitive ? [] : ["-i"]),
    "--no-heading",
    "--with-filename",
    "-n",
    "--context",
    String(context),
    "--max-count",
    String(maxCount),
    "--glob",
    glob,
    query,
    searchPath,
  ];
  return await runRg(args);
}

interface AddonInfo {
  name: string;
  luaCount: number;
  xmlCount: number;
}

function countFilesByPattern(dirPath: string, suffix: string): number {
  try {
    const raw = Bun.spawnSync(
      ["rg", "--files", "--glob", `*${suffix}`, dirPath],
      { stdout: "pipe", stderr: "pipe" },
    );
    const out = new TextDecoder().decode(raw.stdout).trim();
    if (!out) return 0;
    return out.split("\n").length;
  } catch {
    return 0;
  }
}

function listAddons(): AddonInfo[] {
  if (!existsSync(ADDONS_DIR)) return [];

  const entries = readdirSync(ADDONS_DIR, { withFileTypes: true });
  return entries
    .filter((e) => e.isDirectory())
    .map((e) => {
      const addonPath = path.join(ADDONS_DIR, e.name);
      return {
        name: e.name,
        luaCount: countFilesByPattern(addonPath, ".lua.annotated.lua"),
        xmlCount: countFilesByPattern(addonPath, ".xml.annotated.lua"),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

function filterAddons(addons: AddonInfo[], query: string): AddonInfo[] {
  const lower = query.toLowerCase();
  return addons.filter((a) => a.name.toLowerCase().includes(lower));
}

function formatAddonTable(addons: AddonInfo[]): string {
  const rows = addons.map(
    (a) => `| ${a.name} | ${a.luaCount} | ${a.xmlCount} |`,
  );
  return (
    "| Addon | Lua Files | XML Stubs |\n" +
    "|-------|-----------|----------|\n" +
    rows.join("\n")
  );
}

// ---------------------------------------------------------------------------
// Tool definition
// ---------------------------------------------------------------------------

export default tool({
  description:
    "Search Blizzard's FrameXML source code (with LuaLS annotations) for implementation patterns, " +
    "mixin definitions, UI template usage, and real-world examples of how Blizzard builds their own UI. " +
    "Covers 307 addon directories including ActionBar, AuctionHouseUI, ChatFrame, CompactRaidFrames, " +
    "ObjectiveTracker, Professions, Settings, SharedXML, and more.",
  args: {
    query: tool.schema
      .string()
      .describe(
        'Search term - function name, mixin name, pattern, or keyword. ' +
          'Examples: "FramerateFrameMixin", "ObjectiveTracker", "SetAttribute", "RegisterEvent"',
      ),
    scope: tool.schema
      .string()
      .optional()
      .describe(
        'Narrow to an addon directory (e.g. "Blizzard_ActionBar", "SharedXML") or file type ' +
          '("lua" for .lua.annotated.lua only, "xml" for .xml.annotated.lua only). ' +
          "Omit to search everything.",
      ),
    mode: tool.schema
      .enum(["search", "list"])
      .optional()
      .default("search")
      .describe(
        '"search" (default) searches file contents; "list" lists addon directories or files matching the query',
      ),
  },
  async execute(args) {
    const { query, scope, mode = "search" } = args;

    assertFrameXMLExists();

    // ---- List mode --------------------------------------------------------
    if (mode === "list") {
      const addons = listAddons();
      if (addons.length === 0) {
        return "No addon directories found under AddOns/.";
      }

      const filtered = query.trim() ? filterAddons(addons, query) : addons;

      if (filtered.length === 0) {
        return (
          `# Blizzard FrameXML Addons\n\n` +
          `No addon directories matching \`${query}\`.\n\n` +
          `${addons.length} total directories available - ` +
          `try a broader term or omit the query to list all.`
        );
      }

      const header =
        query.trim()
          ? `${filtered.length} addon(s) matching \`${query}\``
          : `${filtered.length} addon directories available`;

      return (
        `# Blizzard FrameXML Addons\n\n${header}:\n\n` +
        formatAddonTable(filtered)
      );
    }

    // ---- Search mode ------------------------------------------------------
    if (!query.trim()) {
      return 'Error: query must not be empty for search mode. Use mode "list" to browse addons.';
    }

    const searchPath = resolveFrameXMLPath(scope);
    const fileGlob = globForScope(scope);
    const scopeLabel = scope || "all";

    // Step 1: Case-sensitive search with generous context
    let results = await searchBlizzardSource(
      query,
      searchPath,
      true,
      fileGlob,
      5,
      30,
    );
    if (results) {
      const formatted = formatSourceOutput(results);
      const lineCount = formatted.split("\n").length;
      const note =
        lineCount >= 200
          ? "\n\n> Showing partial results (max 30 matches per file). Narrow your query or scope for more focused results."
          : "";
      return (
        `# Blizzard FrameXML Source\n\n` +
        `Query: \`${query}\` | Scope: ${scopeLabel}\n\n` +
        `\`\`\`lua\n${formatted}\n\`\`\`` +
        note
      );
    }

    // Step 2: Case-insensitive fallback with smaller context
    results = await searchBlizzardSource(
      query,
      searchPath,
      false,
      fileGlob,
      3,
      20,
    );
    if (results) {
      const formatted = formatSourceOutput(results);
      return (
        `# Blizzard FrameXML Source (case-insensitive match)\n\n` +
        `Query: \`${query}\` | Scope: ${scopeLabel}\n\n` +
        `\`\`\`lua\n${formatted}\n\`\`\``
      );
    }

    // Step 3: Filename-based fallback
    const fileResults = await runRg([
      "--files",
      "--glob",
      `*${query}*.lua`,
      searchPath,
    ]);
    if (fileResults) {
      const files = fileResults.split("\n").filter(Boolean);
      const listed = files
        .slice(0, 20)
        .map((f) => `- ${stripBasePath(f)}`)
        .join("\n");
      const extra =
        files.length > 20
          ? `\n\n> ${files.length - 20} more file(s) matched. Narrow your query.`
          : "";
      return (
        `# Blizzard FrameXML Source (file match)\n\n` +
        `No content matches for \`${query}\`, but found ${files.length} file(s) with matching names:\n\n` +
        listed +
        extra
      );
    }

    // Nothing found
    return (
      `# Blizzard FrameXML Source\n\n` +
      `No results for \`${query}\` in scope "${scopeLabel}".\n\n` +
      `Suggestions:\n` +
      `- Try a broader scope (omit scope to search everything)\n` +
      `- Search for the mixin or function name alone (e.g. "OnLoad" instead of "MyMixin:OnLoad")\n` +
      `- Use mode "list" with your query to find relevant addon directories\n` +
      `- Check spelling - Blizzard source names are case-sensitive`
    );
  },
});
