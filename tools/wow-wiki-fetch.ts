import { tool } from "@opencode-ai/plugin";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const WIKI_BASE = "https://warcraft.wiki.gg/wiki";

const QUERY_TYPES = ["auto", "function", "c_api", "event", "widget"] as const;
type QueryType = (typeof QUERY_TYPES)[number];

const MAX_CONTENT_LENGTH = 12_000;

// ---------------------------------------------------------------------------
// Query type detection
// ---------------------------------------------------------------------------

/** Common verb prefixes in WoW global API function names */
const FUNCTION_PREFIXES = [
  "Get",
  "Set",
  "Is",
  "Has",
  "Can",
  "Do",
  "Create",
  "Delete",
  "Remove",
  "Add",
  "Toggle",
  "Enable",
  "Disable",
  "Register",
  "Unregister",
  "Accept",
  "Decline",
  "Close",
  "Open",
  "Show",
  "Hide",
  "Start",
  "Stop",
  "Use",
  "Cast",
  "Equip",
  "Pickup",
  "Place",
  "Put",
  "Take",
  "Buy",
  "Sell",
  "Send",
  "Leave",
  "Join",
  "Invite",
  "Request",
  "Query",
  "Sort",
  "Clear",
  "Reset",
  "Load",
  "Save",
  "Run",
  "Log",
  "Unit",
  "Spell",
];

function looksLikeFunctionName(query: string): boolean {
  return FUNCTION_PREFIXES.some((prefix) => query.startsWith(prefix));
}

function detectQueryType(query: string): QueryType {
  if (query.includes("/") || query.startsWith("https://")) return "auto"; // raw path
  if (/^C_\w+\.\w+/.test(query)) return "c_api";
  if (/^[A-Z][A-Z0-9_]+$/.test(query) && query.includes("_")) return "event";
  if (/^[A-Z][a-zA-Z]+$/.test(query) && looksLikeFunctionName(query))
    return "function";
  if (/^[A-Z][a-zA-Z]+$/.test(query)) return "widget";
  return "function";
}

// ---------------------------------------------------------------------------
// URL construction - pure functions per type
// ---------------------------------------------------------------------------

function buildUrlForFunction(name: string): string {
  return `${WIKI_BASE}/API_${name}`;
}

function buildUrlForCApi(name: string): string {
  // C_LootHistory.GetLoot -> API_C_LootHistory.GetLoot (dot is literal)
  return `${WIKI_BASE}/API_${name}`;
}

function buildUrlForEvent(name: string): string {
  return `${WIKI_BASE}/${name}`;
}

function buildUrlForWidget(name: string): string {
  return `${WIKI_BASE}/UIOBJECT_${name}`;
}

function buildUrlForRawPath(query: string): string {
  if (query.startsWith("https://")) return query;
  // Treat as wiki path segment
  const cleanPath = query.startsWith("/") ? query.slice(1) : query;
  return `${WIKI_BASE}/${cleanPath}`;
}

function buildWikiUrl(query: string, resolvedType: QueryType): string {
  switch (resolvedType) {
    case "function":
      return buildUrlForFunction(query);
    case "c_api":
      return buildUrlForCApi(query);
    case "event":
      return buildUrlForEvent(query);
    case "widget":
      return buildUrlForWidget(query);
    default:
      return buildUrlForRawPath(query);
  }
}

function resolveQueryType(query: string, explicit: QueryType): QueryType {
  if (explicit !== "auto") return explicit;

  const detected = detectQueryType(query);
  // "auto" from detectQueryType means raw path - keep it
  return detected;
}

// ---------------------------------------------------------------------------
// HTML parsing helpers - no external dependencies
// ---------------------------------------------------------------------------

function stripTags(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/tr>/gi, "\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/h[1-6]>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#\d+;/g, "");
}

function extractMainContent(html: string): string {
  // MediaWiki stores content inside <div id="mw-content-text">...</div>
  // We grab from that div to the end, then strip a reasonable boundary
  const contentStart = html.indexOf('id="mw-content-text"');
  if (contentStart === -1) return "";

  const afterStart = html.indexOf(">", contentStart);
  if (afterStart === -1) return "";

  // Find the content region - stop before footer / navigation elements
  const contentHtml = html.slice(afterStart + 1);

  // Cut at common footer markers
  const footerMarkers = [
    'id="catlinks"',
    'class="printfooter"',
    'id="mw-navigation"',
    "<!--esi",
  ];

  let endIdx = contentHtml.length;
  for (const marker of footerMarkers) {
    const idx = contentHtml.indexOf(marker);
    if (idx !== -1 && idx < endIdx) {
      endIdx = idx;
    }
  }

  return contentHtml.slice(0, endIdx);
}

function extractSections(
  contentHtml: string,
): Map<string, string> {
  const sections = new Map<string, string>();

  // Split on heading tags to find sections
  // MediaWiki uses <h2><span id="SectionName">...</span></h2> or similar
  const headingPattern =
    /<h([2-3])[^>]*>.*?<span[^>]*id="([^"]*)"[^>]*>.*?<\/span>.*?<\/h\1>/gi;

  const headings: Array<{ name: string; index: number }> = [];
  let match: RegExpExecArray | null;

  while ((match = headingPattern.exec(contentHtml)) !== null) {
    headings.push({ name: match[2], index: match.index });
  }

  // Also try simpler heading pattern without span ids
  if (headings.length === 0) {
    const simpleHeadingPattern = /<h([2-3])[^>]*>(.*?)<\/h\1>/gi;
    while ((match = simpleHeadingPattern.exec(contentHtml)) !== null) {
      const name = stripTags(match[2]).trim();
      if (name) {
        headings.push({ name, index: match.index });
      }
    }
  }

  // Extract description (everything before first heading)
  if (headings.length > 0) {
    const descriptionHtml = contentHtml.slice(0, headings[0].index);
    const descriptionText = stripTags(descriptionHtml).trim();
    if (descriptionText) {
      sections.set("Description", descriptionText);
    }
  } else {
    // No headings found - entire content is description
    const descriptionText = stripTags(contentHtml).trim();
    if (descriptionText) {
      sections.set("Description", descriptionText);
    }
    return sections;
  }

  // Extract each heading section
  for (let i = 0; i < headings.length; i++) {
    const heading = headings[i];
    const nextStart =
      i + 1 < headings.length ? headings[i + 1].index : contentHtml.length;
    const sectionHtml = contentHtml.slice(heading.index, nextStart);
    const sectionText = stripTags(sectionHtml).trim();

    // Remove the heading text itself from the section body
    const headingText = heading.name.replace(/_/g, " ");
    const bodyText = sectionText
      .replace(new RegExp(`^\\s*${escapeRegex(headingText)}\\s*`, "i"), "")
      .trim();

    if (bodyText) {
      sections.set(normalizeHeadingName(heading.name), bodyText);
    }
  }

  return sections;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeHeadingName(raw: string): string {
  // Wiki section IDs use underscores: "Patch_changes" -> "Patch changes"
  return raw.replace(/_/g, " ");
}

// ---------------------------------------------------------------------------
// Section selection - pick the most useful sections for output
// ---------------------------------------------------------------------------

const DESIRED_SECTIONS = [
  "Description",
  "Parameters",
  "Arguments",
  "Returns",
  "Return values",
  "Return value",
  "Details",
  "Notes",
  "Example",
  "Examples",
  "Usage",
  "Triggers",
  "Payload",
  "Fields",
  "Methods",
  "Patch changes",
];

function selectRelevantSections(
  allSections: Map<string, string>,
): Map<string, string> {
  const selected = new Map<string, string>();

  for (const desired of DESIRED_SECTIONS) {
    const key = findSectionKey(allSections, desired);
    if (key) {
      selected.set(desired, allSections.get(key)!);
    }
  }

  // If we got very little, include everything we have
  if (selected.size <= 1) {
    return allSections;
  }

  return selected;
}

function findSectionKey(
  sections: Map<string, string>,
  target: string,
): string | undefined {
  const targetLower = target.toLowerCase();
  for (const key of sections.keys()) {
    if (key.toLowerCase() === targetLower) return key;
  }
  // Partial match fallback
  for (const key of sections.keys()) {
    if (key.toLowerCase().includes(targetLower)) return key;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Output formatting
// ---------------------------------------------------------------------------

function formatOutput(
  query: string,
  url: string,
  sections: Map<string, string>,
): string {
  const lines: string[] = [`# WoW Wiki: ${query}`, "", `**Source:** ${url}`];

  for (const [heading, body] of sections) {
    lines.push("", `## ${heading}`, "", truncateSection(body));
  }

  return lines.join("\n");
}

function truncateSection(text: string): string {
  // Collapse excessive whitespace
  const cleaned = text.replace(/\n{3,}/g, "\n\n").trim();
  if (cleaned.length <= MAX_CONTENT_LENGTH) return cleaned;
  return (
    cleaned.slice(0, MAX_CONTENT_LENGTH) +
    "\n\n... (truncated - view full page on wiki)"
  );
}

function formatError(
  query: string,
  url: string,
  status: number,
  resolvedType: QueryType,
): string {
  const lines = [
    `# WoW Wiki: ${query}`,
    "",
    `**Error:** HTTP ${status} fetching ${url}`,
    "",
    "## Suggestions",
    "",
  ];

  if (status === 404) {
    lines.push(`The page \`${url}\` does not exist on the wiki.`);
    lines.push("");
    lines.push("Try:");

    if (resolvedType === "widget") {
      lines.push(
        `- Function URL instead: ${buildUrlForFunction(query)}`,
      );
    }
    if (resolvedType === "function") {
      lines.push(
        `- Widget URL instead: ${buildUrlForWidget(query)}`,
      );
    }
    lines.push(
      `- Search the wiki directly: https://warcraft.wiki.gg/index.php?search=${encodeURIComponent(query)}`,
    );
    lines.push(
      '- Use the `wow-api-lookup` tool for local annotation signatures',
    );
  } else {
    lines.push(
      `Network or server error. The wiki may be temporarily unavailable.`,
    );
    lines.push(`- Retry in a moment`);
    lines.push(
      `- Check the URL manually: ${url}`,
    );
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Fetch with redirect/retry logic
// ---------------------------------------------------------------------------

async function fetchWikiPage(
  url: string,
): Promise<{ ok: boolean; status: number; html: string }> {
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "opencode-wow-wiki-fetch/1.0",
        Accept: "text/html",
      },
      redirect: "follow",
    });

    const html = await response.text();
    return { ok: response.ok, status: response.status, html };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown fetch error";
    return { ok: false, status: 0, html: message };
  }
}

// ---------------------------------------------------------------------------
// Tool definition
// ---------------------------------------------------------------------------

export default tool({
  description:
    "Fetch detailed documentation from warcraft.wiki.gg for any WoW API function, event, widget, or topic. " +
    "Returns behavioral details, caveats, parameters, return values, and examples that local annotation files lack. " +
    "Auto-detects URL pattern from the query name (C_ namespace, ALL_CAPS events, PascalCase widgets, or global functions).",
  args: {
    query: tool.schema
      .string()
      .describe(
        'The API name, event name, widget type, or wiki path to look up. Examples: "GetLootSlotInfo", "C_Item.GetItemInfo", "LOOT_OPENED", "Frame", "Professions/Recipes"',
      ),
    type: tool.schema
      .enum(["auto", "function", "c_api", "event", "widget"])
      .optional()
      .default("auto")
      .describe(
        'Force a specific URL pattern instead of auto-detection. "auto" infers from the query shape. ' +
          'Use "function" for API_X, "c_api" for API_C_X.Y, "event" for EVENT_NAME, "widget" for UIOBJECT_X.',
      ),
  },
  async execute(args) {
    const { query, type = "auto" } = args;

    // --- Guard clauses ---
    if (!query.trim()) {
      return "Error: query must not be empty. Provide an API name, event, widget, or wiki path.";
    }

    // --- Parse query type at boundary ---
    const resolvedType = resolveQueryType(query.trim(), type);
    const url = buildWikiUrl(query.trim(), resolvedType);

    // --- Fetch ---
    const { ok, status, html } = await fetchWikiPage(url);

    if (!ok) {
      return formatError(query, url, status, resolvedType);
    }

    // --- Parse HTML into sections ---
    const contentHtml = extractMainContent(html);

    if (!contentHtml) {
      return (
        `# WoW Wiki: ${query}\n\n` +
        `**Source:** ${url}\n\n` +
        `## Note\n\n` +
        `Page fetched successfully but content extraction failed. ` +
        `The page structure may be non-standard.\n\n` +
        `Visit the page directly: ${url}`
      );
    }

    const allSections = extractSections(contentHtml);

    if (allSections.size === 0) {
      // Fallback: return raw stripped text
      const rawText = stripTags(contentHtml).trim();
      if (!rawText) {
        return (
          `# WoW Wiki: ${query}\n\n` +
          `**Source:** ${url}\n\n` +
          `Page appears to have no text content. Visit: ${url}`
        );
      }

      return (
        `# WoW Wiki: ${query}\n\n` +
        `**Source:** ${url}\n\n` +
        `## Content\n\n` +
        truncateSection(rawText)
      );
    }

    const relevantSections = selectRelevantSections(allSections);
    return formatOutput(query, url, relevantSections);
  },
});
