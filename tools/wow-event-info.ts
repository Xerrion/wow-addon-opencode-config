import { tool } from "@opencode-ai/plugin";
import os from "node:os";
import path from "node:path";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const EVENT_LUA_PATH = path.join(
  os.homedir(),
  ".local/share/wow-annotations/Annotations/Core/Data/Event.lua",
);

const WIKI_BASE_URL = "https://warcraft.wiki.gg/wiki";

const EVENT_LINE_PATTERN = /^\|\s*"([A-Z0-9_]+)"(?:\s*#\s*`?([^`]*)`?)?$/;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface EventEntry {
  name: string;
  payload: string;
}

// ---------------------------------------------------------------------------
// Module-level cache
// ---------------------------------------------------------------------------

let cachedEvents: Map<string, EventEntry> | null = null;

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

function parseEventLine(line: string): EventEntry | null {
  const trimmed = line.replace(/^---/, "").trim();
  const match = trimmed.match(EVENT_LINE_PATTERN);
  if (!match) return null;

  const name = match[1];
  const payload = match[2]?.trim() ?? "";
  return { name, payload };
}

function parseEventEntries(fileContent: string): Map<string, EventEntry> {
  const events = new Map<string, EventEntry>();

  for (const line of fileContent.split("\n")) {
    const entry = parseEventLine(line);
    if (entry) {
      events.set(entry.name, entry);
    }
  }

  return events;
}

function findExactMatch(
  events: Map<string, EventEntry>,
  query: string,
): EventEntry | null {
  return events.get(query) ?? null;
}

function findPrefixMatches(
  events: Map<string, EventEntry>,
  query: string,
): EventEntry[] {
  const matches: EventEntry[] = [];
  for (const [name, entry] of events) {
    if (name.startsWith(query)) {
      matches.push(entry);
    }
  }
  return matches;
}

function findSubstringMatches(
  events: Map<string, EventEntry>,
  query: string,
): EventEntry[] {
  const matches: EventEntry[] = [];
  for (const [name, entry] of events) {
    if (name.includes(query)) {
      matches.push(entry);
    }
  }
  return matches;
}

function findRelatedEvents(
  events: Map<string, EventEntry>,
  eventName: string,
): string[] {
  // Extract the prefix before the last underscore segment as the "group"
  const underscoreIdx = eventName.indexOf("_");
  if (underscoreIdx === -1) return [];

  const prefix = eventName.slice(0, underscoreIdx);
  const related: string[] = [];

  for (const name of events.keys()) {
    if (name !== eventName && name.startsWith(prefix + "_")) {
      related.push(name);
    }
  }

  return related;
}

function formatExactMatch(
  entry: EventEntry,
  relatedEvents: string[],
  wikiContent: string | null,
): string {
  const payloadLine = entry.payload || "(none)";
  const wikiUrl = `${WIKI_BASE_URL}/${entry.name}`;

  let output = `# Event: ${entry.name}\n\n`;
  output += `**Payload:** ${payloadLine}\n\n`;

  if (relatedEvents.length > 0) {
    const relatedList = relatedEvents.slice(0, 20).join(", ");
    const suffix = relatedEvents.length > 20 ? `, ... (${relatedEvents.length} total)` : "";
    output += `**Related Events:** ${relatedList}${suffix}\n\n`;
  }

  output += `**Wiki:** ${wikiUrl}\n`;

  if (wikiContent) {
    output += `\n## Wiki Documentation\n\n${wikiContent}\n`;
  }

  return output;
}

function formatMultipleMatches(
  query: string,
  matches: EventEntry[],
  matchType: string,
): string {
  let output = `# Events matching "${query}" (${matchType})\n\n`;
  output += `Found ${matches.length} event${matches.length === 1 ? "" : "s"}:\n\n`;
  output += `| Event | Payload |\n`;
  output += `|-------|--------|\n`;

  for (const entry of matches) {
    const payload = entry.payload || "(none)";
    output += `| ${entry.name} | ${payload} |\n`;
  }

  return output;
}

// ---------------------------------------------------------------------------
// Wiki fetcher
// ---------------------------------------------------------------------------

function stripHtmlTags(html: string): string {
  return html.replace(/<[^>]+>/g, "");
}

function extractWikiContent(html: string): string {
  // Extract the main content area between mw-parser-output div
  const parserOutputMatch = html.match(
    /<div class="mw-parser-output">([\s\S]*?)(?:<div class="printfooter"|<div id="catlinks")/,
  );
  if (!parserOutputMatch) return "(Could not extract wiki content)";

  let content = parserOutputMatch[1];

  // Remove navigation boxes, edit links, table of contents
  content = content.replace(/<div[^>]*class="[^"]*toc[^"]*"[^>]*>[\s\S]*?<\/div>\s*<\/div>/g, "");
  content = content.replace(/<span class="mw-editsection">[\s\S]*?<\/span>/g, "");
  content = content.replace(/<table[^>]*class="[^"]*navbox[^"]*"[\s\S]*?<\/table>/g, "");
  content = content.replace(/<div[^>]*class="[^"]*navbox[^"]*"[\s\S]*?<\/div>/g, "");

  // Convert headers to markdown
  content = content.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/g, (_m, inner) => `\n## ${stripHtmlTags(inner).trim()}\n`);
  content = content.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/g, (_m, inner) => `\n### ${stripHtmlTags(inner).trim()}\n`);
  content = content.replace(/<h4[^>]*>([\s\S]*?)<\/h4>/g, (_m, inner) => `\n#### ${stripHtmlTags(inner).trim()}\n`);

  // Convert code blocks
  content = content.replace(/<pre[^>]*>([\s\S]*?)<\/pre>/g, (_m, inner) => `\n\`\`\`lua\n${stripHtmlTags(inner).trim()}\n\`\`\`\n`);
  content = content.replace(/<code[^>]*>([\s\S]*?)<\/code>/g, (_m, inner) => `\`${stripHtmlTags(inner)}\``);

  // Convert list items
  content = content.replace(/<li[^>]*>([\s\S]*?)<\/li>/g, (_m, inner) => `- ${stripHtmlTags(inner).trim()}\n`);

  // Convert paragraphs
  content = content.replace(/<p[^>]*>([\s\S]*?)<\/p>/g, (_m, inner) => `${stripHtmlTags(inner).trim()}\n\n`);

  // Strip remaining HTML tags
  content = stripHtmlTags(content);

  // Clean up excessive whitespace
  content = content.replace(/\n{3,}/g, "\n\n").trim();

  // Truncate if extremely long
  const maxLength = 4000;
  if (content.length > maxLength) {
    content = content.slice(0, maxLength) + "\n\n... (truncated, see wiki page for full content)";
  }

  return content;
}

async function fetchWikiPage(eventName: string): Promise<string | null> {
  const url = `${WIKI_BASE_URL}/${eventName}`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      if (response.status === 404) return "(No wiki page found for this event)";
      return `(Wiki fetch failed: HTTP ${response.status})`;
    }
    const html = await response.text();
    return extractWikiContent(html);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return `(Wiki fetch failed: ${message})`;
  }
}

// ---------------------------------------------------------------------------
// Event data loader
// ---------------------------------------------------------------------------

async function loadEvents(): Promise<Map<string, EventEntry>> {
  if (cachedEvents) return cachedEvents;

  const file = Bun.file(EVENT_LUA_PATH);
  const exists = await file.exists();
  if (!exists) {
    throw new Error(
      `Event.lua not found at ${EVENT_LUA_PATH}. ` +
        `Ensure wow-annotations are installed at ~/.local/share/wow-annotations/`,
    );
  }

  const content = await file.text();
  cachedEvents = parseEventEntries(content);
  return cachedEvents;
}

// ---------------------------------------------------------------------------
// Tool definition
// ---------------------------------------------------------------------------

export default tool({
  description:
    "Look up WoW event names, payloads, and documentation. " +
    "Searches local LuaLS annotations for FrameEvent definitions and optionally fetches " +
    "full documentation from warcraft.wiki.gg. Supports exact match (LOOT_OPENED), " +
    "prefix match (LOOT for all LOOT_* events), and substring search.",
  args: {
    query: tool.schema
      .string()
      .describe(
        'Event name or partial match to search for. Examples: "LOOT_OPENED" (exact), ' +
          '"ADDON_LOADED" (exact), "LOOT" (all LOOT_* events), "COMBAT" (all events containing COMBAT)',
      ),
    wiki: tool.schema
      .boolean()
      .optional()
      .default(false)
      .describe(
        "Fetch the wiki page from warcraft.wiki.gg for detailed documentation. " +
          "Only used for exact matches. Makes the call slower but provides full payload details, " +
          "descriptions, caveats, and examples.",
      ),
  },
  async execute(args) {
    const { query, wiki = false } = args;

    // Guard: empty query
    if (!query.trim()) {
      return "Error: query must not be empty.";
    }

    // Parse at boundary: normalize to uppercase
    const normalizedQuery = query.trim().toUpperCase();

    // Load event data (fails fast if file missing)
    const events = await loadEvents();

    // Step 1: Exact match
    const exactMatch = findExactMatch(events, normalizedQuery);
    if (exactMatch) {
      const relatedEvents = findRelatedEvents(events, exactMatch.name);
      const wikiContent = wiki ? await fetchWikiPage(exactMatch.name) : null;
      return formatExactMatch(exactMatch, relatedEvents, wikiContent);
    }

    // Step 2: Prefix match
    const prefixMatches = findPrefixMatches(events, normalizedQuery);
    if (prefixMatches.length > 0) {
      return formatMultipleMatches(normalizedQuery, prefixMatches, "prefix");
    }

    // Step 3: Substring match
    const substringMatches = findSubstringMatches(events, normalizedQuery);
    if (substringMatches.length > 0) {
      return formatMultipleMatches(normalizedQuery, substringMatches, "substring");
    }

    // Nothing found
    return (
      `# No events found for "${normalizedQuery}"\n\n` +
      `No events matched your query.\n\n` +
      `**Suggestions:**\n` +
      `- Check spelling (event names are UPPER_SNAKE_CASE)\n` +
      `- Try a broader term (e.g. "LOOT" instead of "LOOT_OPENED")\n` +
      `- Try a different keyword (e.g. "BAG" for bag-related events)\n\n` +
      `Total events available: ${events.size}`
    );
  },
});
