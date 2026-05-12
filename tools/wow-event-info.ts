import { tool } from "@opencode-ai/plugin/tool";
import { z } from "zod";
import { homedir } from "node:os";
import { join } from "node:path";

/**
 * wow-event-info: exact-match lookup of a single WoW frame event in
 * `Annotations/Core/Data/Event.lua`, returning the payload signature plus a
 * same-prefix family window for orientation.
 *
 * Contract per ADR-0001 `.deliverables/tech-lead/ADR-0001-rebuild-tool-surface.md`:
 *  - one arg (`event`), no mode/category/wiki flags
 *  - bare-string return
 *  - 40 KB self-cap
 *  - throw only on invalid input; "event not found" returns a string body
 *  - paths in output are anchor-relative (Annotations/Core/...), never absolute
 */

const REL_PATH = "Annotations/Core/Data/Event.lua";
const ABS_PATH = join(homedir(), ".local/share/wow-annotations", REL_PATH);
const BUDGET = 40_000;
const FAMILY_LINE_CAP = 30;
const SUGGESTION_CAP = 20;

// Matches lines of the shape `---|"EVENT_NAME"` or
// `---|"EVENT_NAME" # `payload``. Captures (1) name, (2) payload-without-#.
const LINE_RE = /^---\|"([A-Z0-9_]+)"(?:\s*#\s*(.*))?$/;

type Row = {
  lineNo: number;
  name: string;
  payload: string | null;
  raw: string;
};

function familyPrefix(name: string): string {
  const i = name.indexOf("_");
  return i === -1 ? name : name.slice(0, i);
}

/** Pick a fence delimiter longer than any backtick run in `content`. */
function fenceFor(content: string): string {
  let max = 0;
  const re = /`+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    if (m[0].length > max) max = m[0].length;
  }
  return "`".repeat(Math.max(3, max + 1));
}

function parseRows(raw: string): Row[] {
  const lines = raw.split("\n");
  const rows: Row[] = [];
  for (let i = 0; i < lines.length; i++) {
    const m = LINE_RE.exec(lines[i]!);
    if (m) {
      rows.push({
        lineNo: i + 1,
        name: m[1]!,
        payload: m[2] ?? null,
        raw: lines[i]!,
      });
    }
  }
  return rows;
}

/**
 * Render a single family-window entry. Mark the matched event with a trailing
 * comment so the caller can locate it inside the block.
 */
function renderFamilyLine(row: Row, isMatch: boolean): string {
  return isMatch ? `${row.raw}   ; <- this event` : row.raw;
}

/**
 * Compute the family window around `idx`: walk outward while neighbours share
 * the same first-segment prefix, capped at FAMILY_LINE_CAP either side.
 * Returns inclusive [lo, hi] indices into `rows`.
 */
function familyBounds(rows: Row[], idx: number): { lo: number; hi: number } {
  const prefix = familyPrefix(rows[idx]!.name);
  let lo = idx;
  let hi = idx;
  let above = 0;
  while (lo > 0 && above < FAMILY_LINE_CAP) {
    const candidate = rows[lo - 1]!;
    if (familyPrefix(candidate.name) !== prefix) break;
    lo--;
    above++;
  }
  let below = 0;
  while (hi < rows.length - 1 && below < FAMILY_LINE_CAP) {
    const candidate = rows[hi + 1]!;
    if (familyPrefix(candidate.name) !== prefix) break;
    hi++;
    below++;
  }
  return { lo, hi };
}

function renderMatch(event: string, rows: Row[], idx: number): string {
  const row = rows[idx]!;
  const prefix = familyPrefix(row.name);
  let { lo, hi } = familyBounds(rows, idx);

  const buildBody = (
    loIdx: number,
    hiIdx: number,
    droppedAbove: number,
    droppedBelow: number,
  ): string => {
    const familyLines: string[] = [];
    if (droppedAbove > 0) {
      familyLines.push(
        `... +${droppedAbove} more events with prefix ${prefix}_ above`,
      );
    }
    for (let i = loIdx; i <= hiIdx; i++) {
      familyLines.push(renderFamilyLine(rows[i]!, i === idx));
    }
    if (droppedBelow > 0) {
      familyLines.push(
        `... +${droppedBelow} more events with prefix ${prefix}_ below`,
      );
    }
    const familyText = familyLines.join("\n");
    const fence = fenceFor(familyText);

    const payloadLine =
      row.payload !== null && row.payload.length > 0
        ? row.payload
        : "(no payload)";

    return [
      `# ${event}`,
      "",
      "## Payload",
      payloadLine,
      "",
      "## Source",
      `${REL_PATH}:${row.lineNo}`,
      "",
      "## Related events in the same family",
      `${fence}text`,
      familyText,
      fence,
      "",
      "## Note",
      "Payload arg types are not annotated in Event.lua; arg names are descriptive only.",
      `For full semantics including firing order, fetch the wiki page via wow-wiki-fetch (URL: https://warcraft.wiki.gg/wiki/${event}).`,
      "",
    ].join("\n");
  };

  let droppedAbove = 0;
  let droppedBelow = 0;
  let body = buildBody(lo, hi, droppedAbove, droppedBelow);

  // Defensive cap: trim family edges if rendered body exceeds budget. The
  // 30-line cap above keeps this unreachable for the current data set, but
  // we honour the explicit instruction in the delegation.
  while (Buffer.byteLength(body, "utf8") > BUDGET && (lo < idx || hi > idx)) {
    if (hi > idx) {
      hi--;
      droppedBelow++;
    } else if (lo < idx) {
      lo++;
      droppedAbove++;
    }
    body = buildBody(lo, hi, droppedAbove, droppedBelow);
  }

  return body;
}

function renderNoMatch(event: string, rows: Row[]): string {
  const wanted = familyPrefix(event);
  let suggestions = rows
    .filter((r) => familyPrefix(r.name) === wanted)
    .map((r) => r.name);

  // Fallback: shared 3-char prefix when the family bucket is empty.
  if (suggestions.length === 0 && event.length >= 3) {
    const head = event.slice(0, 3);
    suggestions = rows
      .filter((r) => r.name.startsWith(head))
      .map((r) => r.name);
  }

  // De-dupe + alphabetise + cap.
  suggestions = Array.from(new Set(suggestions)).sort();
  const truncated = suggestions.length > SUGGESTION_CAP;
  const shown = suggestions.slice(0, SUGGESTION_CAP);

  const lines: string[] = [
    `# ${event}`,
    "",
    `No event by this exact name in ${REL_PATH}.`,
    "",
  ];

  if (shown.length > 0) {
    lines.push(`## Closest same-prefix events (prefix \`${wanted}_\`)`);
    for (const name of shown) {
      lines.push(`- ${name}`);
    }
    if (truncated) {
      lines.push(
        `- ... +${suggestions.length - SUGGESTION_CAP} more with prefix ${wanted}_`,
      );
    }
    lines.push("");
  } else {
    lines.push("No same-prefix events found either.");
    lines.push("");
  }

  lines.push("## Note");
  lines.push(
    "This tool does not fuzzy-match. If you suspect a typo, retry with the exact name.",
  );
  lines.push(
    `The wiki may carry it at https://warcraft.wiki.gg/wiki/${event} if it is a real event.`,
  );
  lines.push("");

  const out = lines.join("\n");
  // No-match bodies are tiny; truncation is theoretically possible only when a
  // pathological prefix bucket is huge, and SUGGESTION_CAP already gates that.
  return out.length > BUDGET ? out.slice(0, BUDGET) : out;
}

export default tool({
  description:
    "Look up a single WoW frame event by exact name in Annotations/Core/Data/Event.lua. Returns its payload signature and a same-prefix family window for orientation. No fuzzy/prefix mode; no wiki fetch.",
  args: {
    event: z.string().min(1),
  },
  async execute({ event }) {
    const normalised = event.trim().toUpperCase();
    if (normalised.length === 0) {
      throw new Error("wow-event-info: event must be non-empty");
    }
    if (normalised.length > 100) {
      throw new Error("wow-event-info: event exceeds 100 characters");
    }
    if (!/^[A-Z0-9_]+$/.test(normalised)) {
      throw new Error(
        "wow-event-info: event must contain only A-Z, 0-9, and underscore",
      );
    }

    const raw = await Bun.file(ABS_PATH).text();
    const rows = parseRows(raw);

    const idx = rows.findIndex((r) => r.name === normalised);
    if (idx === -1) {
      return renderNoMatch(normalised, rows);
    }
    return renderMatch(normalised, rows, idx);
  },
});
