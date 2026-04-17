import { tool } from "@opencode-ai/plugin";
import os from "node:os";
import path from "node:path";

const ANNOTATIONS_ROOT = path.join(
  os.homedir(),
  ".local/share/wow-annotations/Annotations",
);

const CATEGORY_PATHS: Record<string, string> = {
  api: "Core/Blizzard_APIDocumentationGenerated",
  widget: "Core/Widget",
  type: "Core/Type",
  data: "Core/Data",
  library: "Core/Libraries",
  lua: "Core/Lua",
  framexml: "FrameXML",
  all: "",
};

const VALID_CATEGORIES = Object.keys(CATEGORY_PATHS);

function resolveSearchPath(category: string): string {
  const subpath = CATEGORY_PATHS[category];
  if (subpath === undefined) {
    throw new Error(
      `Invalid category "${category}". Valid: ${VALID_CATEGORIES.join(", ")}`,
    );
  }
  return subpath ? path.join(ANNOTATIONS_ROOT, subpath) : ANNOTATIONS_ROOT;
}

function relativePath(absolutePath: string): string {
  return absolutePath.startsWith(ANNOTATIONS_ROOT) ?
      absolutePath.slice(ANNOTATIONS_ROOT.length + 1)
    : absolutePath;
}

function formatRgOutput(raw: string): string {
  return raw
    .split("\n")
    .map((line) => {
      const colonIdx = line.indexOf(":");
      if (colonIdx === -1) return line;
      const filePart = line.slice(0, colonIdx);
      const rest = line.slice(colonIdx);
      return relativePath(filePart) + rest;
    })
    .join("\n");
}

function simplifyQuery(query: string): string {
  // Strip common prefixes to find a filename-friendly search term
  // "C_LootHistory" -> "LootHistory", "Enum.ItemQuality" -> "ItemQuality"
  return query
    .replace(/^C_/, "")
    .replace(/^Enum\./, "")
    .replace(/^Mixin\./, "")
    .replaceAll(".", "");
}

async function runRg(args: string[]): Promise<string> {
  const proc = Bun.spawn(["rg", ...args], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;

  // rg exits 1 when no matches found - that's not an error
  if (exitCode > 1) {
    throw new Error(`ripgrep failed (exit ${exitCode}): ${stderr.trim()}`);
  }
  return stdout.trim();
}

async function searchWithContext(
  query: string,
  searchPath: string,
  caseSensitive: boolean,
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
    "*.lua",
    query,
    searchPath,
  ];
  return await runRg(args);
}

async function findMatchingFiles(
  simplified: string,
  searchPath: string,
): Promise<string[]> {
  const raw = await runRg([
    "--files",
    "--glob",
    `*${simplified}*.lua`,
    searchPath,
  ]);
  if (!raw) return [];
  return raw.split("\n").filter(Boolean);
}

async function readFileHead(
  filePath: string,
  maxLines: number,
): Promise<string> {
  const file = Bun.file(filePath);
  const text = await file.text();
  const lines = text.split("\n");
  const truncated = lines.length > maxLines;
  const content = lines.slice(0, maxLines).join("\n");
  const header = `--- ${relativePath(filePath)} (${lines.length} lines total) ---`;
  const footer =
    truncated ? `\n... truncated at ${maxLines} of ${lines.length} lines` : "";
  return `${header}\n${content}${footer}`;
}

export default tool({
  description:
    "Search WoW API annotation files (LuaLS-style) for API functions, widgets, enums, types, and library definitions. " +
    "Covers C_ namespaces, widget types (Frame, StatusBar, Button), Enum/Structure/Mixin types, Ace3/LSM libraries, " +
    "Lua stdlib, and FrameXML annotations. Use for looking up WoW API signatures, return types, event names, or class fields.",
  args: {
    query: tool.schema
      .string()
      .describe(
        'The API name, namespace, widget type, enum, or keyword to search for. Examples: "C_LootHistory", "GetLootSlotInfo", "StatusBar", "Enum.ItemQuality", "CreateFrame"',
      ),
    category: tool.schema
      .enum([
        "api",
        "widget",
        "type",
        "data",
        "library",
        "lua",
        "framexml",
        "all",
      ])
      .optional()
      .default("all")
      .describe(
        'Narrow search to a category: "api" (C_ namespaces), "widget" (Frame/StatusBar/etc), "type" (Enum/Structure/Mixin), "data" (CVar/Event/Classic), "library" (Ace3/LSM), "lua" (stdlib), "framexml", or "all"',
      ),
  },
  async execute(args) {
    const { query, category = "all" } = args;

    if (!query.trim()) {
      return "Error: query must not be empty.";
    }

    const searchPath = resolveSearchPath(category);

    // Step 1: Case-sensitive search with generous context
    let results = await searchWithContext(query, searchPath, true, 5, 50);
    if (results) {
      const formatted = formatRgOutput(results);
      const lineCount = formatted.split("\n").length;
      const note =
        lineCount >= 200 ?
          "\n\n> Showing partial results (max 50 matches per file). Narrow your query or category for more focused results."
        : "";
      return `# WoW API Annotations\n\nQuery: \`${query}\` | Category: ${category}\n\n\`\`\`lua\n${formatted}\n\`\`\`${note}`;
    }

    // Step 2: Case-insensitive fallback with smaller context
    results = await searchWithContext(query, searchPath, false, 3, 30);
    if (results) {
      const formatted = formatRgOutput(results);
      return `# WoW API Annotations (case-insensitive match)\n\nQuery: \`${query}\` | Category: ${category}\n\n\`\`\`lua\n${formatted}\n\`\`\``;
    }

    // Step 3: Filename-based fallback
    const simplified = simplifyQuery(query);
    const matchingFiles = await findMatchingFiles(simplified, searchPath);

    if (matchingFiles.length > 0) {
      const filesToRead = matchingFiles.slice(0, 3);
      const fileContents = await Promise.all(
        filesToRead.map((f) => readFileHead(f, 200)),
      );
      const extra =
        matchingFiles.length > 3 ?
          `\n\n> ${matchingFiles.length - 3} more file(s) matched. Refine your query to see them.`
        : "";
      return (
        `# WoW API Annotations (file match)\n\n` +
        `No content matches for \`${query}\`, but found file(s) with "${simplified}" in the name:\n\n` +
        `\`\`\`lua\n${fileContents.join("\n\n")}\n\`\`\`` +
        extra
      );
    }

    // Nothing found
    return (
      `# WoW API Annotations\n\n` +
      `No results for \`${query}\` in category "${category}".\n\n` +
      `Suggestions:\n` +
      `- Try a broader category (e.g. "all" instead of "${category}")\n` +
      `- Search for the namespace prefix (e.g. "C_Loot" instead of "C_Loot.GetLootSlotInfo")\n` +
      `- Search for the function name alone (e.g. "GetLootSlotInfo")\n` +
      `- Check spelling - WoW API names are case-sensitive`
    );
  },
});
