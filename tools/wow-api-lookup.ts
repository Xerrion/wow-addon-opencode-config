import { tool } from "@opencode-ai/plugin/tool";
import { z } from "zod";
import { homedir } from "node:os";
import { join } from "node:path";

/**
 * wow-api-lookup: exact-symbol lookup against the curated WoW LuaLS
 * annotation tree at `~/.local/share/wow-annotations/Annotations/Core/`.
 *
 * Contract per ADR-0001 (`.deliverables/tech-lead/ADR-0001-rebuild-tool-surface.md`):
 *   - one arg (`query`), no mode/category/wiki flags
 *   - bare-string return
 *   - 40 KB self-cap with explicit truncation tail
 *   - throw only on invalid input; "symbol not found" returns a string body
 *   - paths in output are anchor-relative (`Annotations/Core/...`), never absolute
 *
 * Buckets searched (seven; `Lua/` remains out of scope per ADR):
 *   - Blizzard_APIDocumentationGenerated/   (C_* namespaces, 324 files)
 *   - Widget/                                (UIObject hierarchy, 59 files)
 *   - Libraries/                             (Ace3, LibStub, etc., 52 files)
 *   - Type/                                  (Mixin, Structure, aliases)
 *   - FrameXML/                              (curated, 6 dirs)
 *   - Data/Wiki.lua                          (legacy global API stubs)
 *   - Data/Enum.lua                          (Enum.* constant tables, Enum.X shape only)
 *   - Data/Classic.lua                       (9-line override addendum)
 */

const ANCHOR_ROOT = join(homedir(), ".local/share/wow-annotations");
const REL_CORE = "Annotations/Core";
const BUDGET = 40_000;
const MAX_QUERY_LEN = 200;
const MAX_MATCHES_TOTAL = 8;
const RG_MAX_COUNT_PER_FILE = 2;
const RG_CONTEXT_BEFORE = 8;
const SUGGESTION_CAP = 10;

const BUCKETS = {
  api: `${REL_CORE}/Blizzard_APIDocumentationGenerated`,
  widget: `${REL_CORE}/Widget`,
  libraries: `${REL_CORE}/Libraries`,
  type: `${REL_CORE}/Type`,
  framexml: `${REL_CORE}/FrameXML`,
  wiki: `${REL_CORE}/Data/Wiki.lua`,
  enum: `${REL_CORE}/Data/Enum.lua`,
  classic: `${REL_CORE}/Data/Classic.lua`,
} as const;

type BucketKey = keyof typeof BUCKETS;
const ALL_BUCKETS: readonly BucketKey[] = [
  "api",
  "widget",
  "libraries",
  "type",
  "framexml",
  "wiki",
];
const ABS_ROOT_PREFIX = `${ANCHOR_ROOT}/`;

type Plan = {
  patterns: string[];
  roots: BucketKey[];
  /** Buckets to prefix-scan for suggestions on no-match. */
  suggestionRoots: BucketKey[];
  shape: string;
};

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Fence wider than any backtick run in `content`, min 3. */
function fenceFor(content: string): string {
  let max = 0;
  const re = /`+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    if (m[0].length > max) max = m[0].length;
  }
  return "`".repeat(Math.max(3, max + 1));
}

/**
 * Classify `query` shape → ordered bucket list + regex patterns.
 *
 * Heuristic, not strict: ambiguous shapes (bare PascalCase, bare
 * camelCase) fan out across multiple buckets so the caller does not
 * have to know which one the symbol lives in.
 */
function classify(query: string): Plan {
  const e = escapeRegex;

  // C_NS.Method - documented C_ API
  if (/^C_[A-Za-z]\w*\.[A-Za-z]\w*$/.test(query)) {
    return {
      shape: "C_NS.Method",
      patterns: [`^function\\s+${e(query)}\\s*\\(`],
      roots: ["api"],
      suggestionRoots: ["api"],
    };
  }

  // Bare C_NS - namespace itself
  if (/^C_[A-Za-z]\w*$/.test(query)) {
    return {
      shape: "C_NS",
      patterns: [
        `^${e(query)}\\s*=\\s*\\{`,
        `^---@class\\s+${e(query)}\\b`,
      ],
      roots: ["api", "type"],
      suggestionRoots: ["api", "type"],
    };
  }

  // Enum.X - Enum.* constant tables live in Data/Enum.lua as
  // `---@enum Enum.X` / `Enum.X = {`. Also probe Type/ for any @alias
  // coverage carried by the curated tree.
  if (/^Enum\.[A-Za-z]\w*$/.test(query)) {
    return {
      shape: "Enum.X",
      patterns: [
        `^---@enum\\s+${e(query)}\\b`,
        `^${e(query)}\\s*=\\s*\\{`,
      ],
      roots: ["enum", "type"],
      suggestionRoots: ["enum", "type", "api"],
    };
  }

  // Class:Method or Lib-X.Y:Method
  if (/^[A-Za-z][\w.-]*:[A-Za-z]\w*$/.test(query)) {
    const [cls, method] = query.split(":") as [string, string];
    const versionless = cls.replace(/-[\d.]+$/, ""); // AceEvent-3.0 -> AceEvent
    const patterns = [`^function\\s+${e(cls)}:${e(method)}\\s*\\(`];
    if (versionless !== cls) {
      patterns.push(`^function\\s+${e(versionless)}:${e(method)}\\s*\\(`);
    }
    return {
      shape: "Class:Method",
      patterns,
      roots: ["widget", "libraries", "type", "framexml"],
      suggestionRoots: ["widget", "libraries", "type"],
    };
  }

  // Library with version, e.g. AceAddon-3.0
  if (/^[A-Za-z]\w*-[\d.]+$/.test(query)) {
    return {
      shape: "Library-Version",
      patterns: [`^---@class\\s+${e(query)}\\b`],
      roots: ["libraries"],
      suggestionRoots: ["libraries"],
    };
  }

  // Mixin name
  if (/^[A-Z]\w*Mixin$/.test(query)) {
    return {
      shape: "Mixin",
      patterns: [
        `^---@class\\s+${e(query)}\\b`,
        `^${e(query)}\\s*=\\s*\\{`,
      ],
      roots: ["type", "framexml", "libraries"],
      suggestionRoots: ["type", "framexml"],
    };
  }

  // Generic NS.Method (non-C_)
  if (/^[A-Za-z][\w-]*\.[A-Za-z]\w*$/.test(query)) {
    return {
      shape: "NS.Method",
      patterns: [`^function\\s+${e(query)}\\s*\\(`],
      roots: ["libraries", "framexml", "type", "api"],
      suggestionRoots: ["libraries", "framexml", "type"],
    };
  }

  // PascalCase bare word - widget / class-like / method-name
  if (/^[A-Z][a-z]\w*$/.test(query)) {
    return {
      shape: "PascalCase",
      patterns: [
        `^---@class\\s+${e(query)}\\b`,
        `^${e(query)}\\s*=\\s*\\{`,
        `^function\\s+${e(query)}\\s*\\(`,
        // Common method name across many widget/library classes
        // (e.g. `GetName`, `SetSize`). Surfaces all defining sites so the
        // 40 KB cap and "narrow with Class:Method" hint kick in.
        `^function\\s+\\w[\\w.]*[.:]${e(query)}\\s*\\(`,
      ],
      roots: ["widget", "type", "libraries", "framexml", "wiki"],
      suggestionRoots: ["widget", "type", "libraries"],
    };
  }

  // Bare identifier (mixed case, global API style)
  return {
    shape: "bare-identifier",
    patterns: [
      `^function\\s+${e(query)}\\s*\\(`,
      `^---@class\\s+${e(query)}\\b`,
    ],
    roots: ["wiki", "widget", "libraries", "framexml", "type"],
    suggestionRoots: ["wiki", "widget", "libraries"],
  };
}

type RgLine = { path: string; line: number; text: string; isMatch: boolean };
type Hit = { path: string; matchLine: number; block: string };

/**
 * Strip the absolute anchor prefix if rg ever emits it. With cwd set to
 * ANCHOR_ROOT, rg uses the relative paths we pass it - but defence in
 * depth: never leak `/Users/...` to the caller.
 */
function stripAbsPrefix(s: string): string {
  if (s.startsWith(ABS_ROOT_PREFIX)) return s.slice(ABS_ROOT_PREFIX.length);
  return s;
}

/**
 * Parse a single rg line. Match lines use `path:line:text`, context lines
 * use `path-line-text`. We accept both; the `--` separator between match
 * groups is handled by the caller.
 */
function parseRgLine(raw: string): RgLine | null {
  // Match the head greedily up to the first ':<digits>:' or '-<digits>-'.
  // Avoid scanning past a Windows-drive colon by anchoring on the
  // first digits-bracketed-by-separators run.
  const reMatch = /^(.+?):(\d+):(.*)$/;
  const reCtx = /^(.+?)-(\d+)-(.*)$/;
  let m = reMatch.exec(raw);
  if (m) {
    return {
      path: stripAbsPrefix(m[1]!),
      line: Number(m[2]!),
      text: m[3]!,
      isMatch: true,
    };
  }
  m = reCtx.exec(raw);
  if (m) {
    return {
      path: stripAbsPrefix(m[1]!),
      line: Number(m[2]!),
      text: m[3]!,
      isMatch: false,
    };
  }
  return null;
}

async function runRg(
  patterns: string[],
  roots: string[],
): Promise<RgLine[]> {
  if (patterns.length === 0 || roots.length === 0) return [];
  const args = [
    "--color",
    "never",
    "--no-heading",
    "--line-number",
    "-B",
    String(RG_CONTEXT_BEFORE),
    "-A",
    "1",
    "--max-count",
    String(RG_MAX_COUNT_PER_FILE),
    "--max-filesize",
    "5M",
  ];
  for (const p of patterns) {
    args.push("-e", p);
  }
  args.push(...roots);

  const proc = Bun.spawn(["rg", ...args], {
    cwd: ANCHOR_ROOT,
    stdout: "pipe",
    stderr: "pipe",
  });
  const stdout = await new Response(proc.stdout).text();
  const exitCode = await proc.exited;
  if (exitCode === 2) {
    const err = await new Response(proc.stderr).text();
    throw new Error(`wow-api-lookup: rg failed: ${err.trim().slice(0, 200)}`);
  }
  // exitCode 1 = no matches.
  const out: RgLine[] = [];
  for (const raw of stdout.split("\n")) {
    if (raw === "" || raw === "--") continue;
    const parsed = parseRgLine(raw);
    if (parsed) out.push(parsed);
  }
  return out;
}

/**
 * Group rg lines into Hit blocks. Each block: the contiguous run of
 * lines (context + match + after) for a single match. Boundaries:
 * change of file OR a non-contiguous line number.
 */
function groupHits(lines: RgLine[]): Hit[] {
  const hits: Hit[] = [];
  let buf: RgLine[] = [];
  let matchLine = -1;
  const flush = () => {
    if (buf.length === 0 || matchLine === -1) {
      buf = [];
      matchLine = -1;
      return;
    }
    const path = buf[0]!.path;
    const block = buf.map((l) => l.text).join("\n");
    hits.push({ path, matchLine, block });
    buf = [];
    matchLine = -1;
  };
  for (const l of lines) {
    const last = buf[buf.length - 1];
    const breaks =
      last !== undefined && (last.path !== l.path || l.line - last.line > 1);
    if (breaks) flush();
    buf.push(l);
    if (l.isMatch && matchLine === -1) matchLine = l.line;
  }
  flush();
  return hits;
}

function renderHits(query: string, hits: Hit[], plan: Plan): string {
  const header = `# ${query}\n\n_Shape: ${plan.shape}; searched buckets: ${plan.roots.join(", ")}._\n\n`;
  const blocks: string[] = [];
  let used = Buffer.byteLength(header, "utf8");
  let rendered = 0;
  let truncated = false;

  for (const h of hits.slice(0, MAX_MATCHES_TOTAL)) {
    const fence = fenceFor(h.block);
    const block =
      `## ${h.path}:${h.matchLine}\n` +
      `${fence}lua\n${h.block}\n${fence}\n\n`;
    const blockSize = Buffer.byteLength(block, "utf8");
    if (used + blockSize > BUDGET) {
      truncated = true;
      break;
    }
    blocks.push(block);
    used += blockSize;
    rendered += 1;
  }

  let body = header + blocks.join("");
  if (truncated || hits.length > rendered) {
    const remaining = hits.length - rendered;
    const tail =
      remaining > 0
        ? `... output truncated at 40 KB; ${remaining} more match(es) not shown. Query is too generic — qualify with NS.Method or Class:Method, or use the exact namespace prefix.\n`
        : `... output truncated at 40 KB; narrow the query with a NS.Method or Class:Method qualifier.\n`;
    body += tail;
  }
  return body;
}

/**
 * Append a Classic-override section when `Data/Classic.lua` carries a
 * matching `function <query>(...) end` stub. Best-effort; failures are
 * swallowed (the file is 9 lines, but we treat it as optional).
 */
async function tryClassicOverride(query: string): Promise<string | null> {
  if (!/^[A-Za-z][\w.:]*$/.test(query)) return null;
  try {
    const raw = await Bun.file(
      join(ANCHOR_ROOT, BUCKETS.classic),
    ).text();
    const lines = raw.split("\n");
    const sigRe = new RegExp(
      `^function\\s+${escapeRegex(query)}\\s*\\(`,
    );
    for (let i = 0; i < lines.length; i++) {
      if (sigRe.test(lines[i]!)) {
        // Walk back to gather the annotation block.
        let lo = i;
        while (lo > 0 && /^---/.test(lines[lo - 1]!)) lo--;
        const chunk = lines.slice(lo, i + 1).join("\n");
        const fence = fenceFor(chunk);
        return (
          `## Classic override (${BUCKETS.classic}:${i + 1})\n` +
          `${fence}lua\n${chunk}\n${fence}\n\n`
        );
      }
    }
  } catch {
    /* missing file → skip */
  }
  return null;
}

/**
 * Collect close-prefix suggestions for a no-match response. Uses rg `-l`
 * across the suggestion buckets and falls back to filename scan when the
 * query is a single bare token (the file-naming convention catches
 * `C_Item` → `ItemDocumentation.lua`).
 */
async function gatherSuggestions(
  query: string,
  plan: Plan,
): Promise<string[]> {
  const seed = query.replace(/^Enum\./, "").replace(/[:.].*$/, "");
  if (seed.length < 3) return [];
  const head = seed.slice(0, Math.min(seed.length, 6));
  const headRe = `\\b${escapeRegex(head)}`;
  const roots = plan.suggestionRoots.map((k) => BUCKETS[k]);

  const args = [
    "--color",
    "never",
    "--no-heading",
    "--no-line-number",
    "--only-matching",
    "--max-count",
    "20",
    "-e",
    `${headRe}\\w*`,
    ...roots,
  ];
  try {
    const proc = Bun.spawn(["rg", ...args], {
      cwd: ANCHOR_ROOT,
      stdout: "pipe",
      stderr: "pipe",
    });
    const stdout = await new Response(proc.stdout).text();
    await proc.exited;
    const tokens = new Set<string>();
    for (const raw of stdout.split("\n")) {
      const cleaned = raw.trim();
      if (cleaned.length === 0) continue;
      // rg --only-matching with our pattern emits just the matched token,
      // no path prefix; defensively strip a leading `path:` though.
      const colon = cleaned.indexOf(":");
      const token = colon >= 0 ? cleaned.slice(colon + 1) : cleaned;
      if (token === query) continue;
      if (token.length > 80) continue;
      tokens.add(token);
      if (tokens.size >= SUGGESTION_CAP) break;
    }
    return Array.from(tokens).sort();
  } catch {
    return [];
  }
}

function renderNoMatch(
  query: string,
  plan: Plan,
  suggestions: string[],
): string {
  const lines = [
    `# ${query}`,
    "",
    `No symbol found in the curated annotation tree.`,
    "",
    `Shape: ${plan.shape}.`,
    `Searched: ${plan.roots.map((k) => BUCKETS[k]).join(", ")}.`,
    "",
  ];
  if (suggestions.length > 0) {
    lines.push(`## Close-prefix candidates`);
    for (const s of suggestions) lines.push(`- ${s}`);
    lines.push("");
  }
  lines.push("## Note");
  lines.push(
    "This tool does not fuzzy-match. If this is a Blizzard source identifier (not a documented C_ API), try wow-blizzard-source. If this is an event name, try wow-event-info. For free-form concepts, try wow-wiki-fetch.",
  );
  lines.push("");
  return lines.join("\n");
}

export default tool({
  description:
    "Exact-symbol lookup against the curated WoW LuaLS annotation tree at Annotations/Core/. Accepts qualified (C_Item.GetItemInfo, Frame:SetSize, AceEvent-3.0:RegisterEvent) and bare (Frame, AbandonSkill) symbol names. No fuzzy/keyword mode; no wiki fetch.",
  args: {
    query: z.string().min(1),
  },
  async execute({ query }) {
    const q = query.trim();
    if (q.length === 0) {
      throw new Error("wow-api-lookup: query must be non-empty");
    }
    if (q.length > MAX_QUERY_LEN) {
      throw new Error(
        `wow-api-lookup: query exceeds ${MAX_QUERY_LEN} characters`,
      );
    }
    if (/[\r\n]/.test(q)) {
      throw new Error("wow-api-lookup: query must not contain newlines");
    }

    const plan = classify(q);
    const roots = plan.roots.map((k) => BUCKETS[k]);

    const rgLines = await runRg(plan.patterns, roots);
    const hits = groupHits(rgLines);

    if (hits.length > 0) {
      let out = renderHits(q, hits, plan);
      const classic = await tryClassicOverride(q);
      if (classic !== null) {
        const candidate = out + classic;
        if (Buffer.byteLength(candidate, "utf8") <= BUDGET) {
          out = candidate;
        }
      }
      return out;
    }

    const suggestions = await gatherSuggestions(q, plan);
    return renderNoMatch(q, plan, suggestions);
  },
});
