import { tool } from "@opencode-ai/plugin";
import path from "node:path";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface LintFinding {
  line: number;
  column?: number;
  severity: "error" | "warning" | "info";
  category: string;
  message: string;
  suggestion: string;
  code: string;
}

type LintRule = {
  category: string;
  name: string;
  check: (lines: string[], findings: LintFinding[]) => void;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ALL_CATEGORIES = [
  "globals",
  "taint",
  "nil-safety",
  "hardcoded-ids",
  "events",
  "performance",
  "deprecated",
] as const;

type Category = (typeof ALL_CATEGORIES)[number];

/** Known WoW global patterns that are intentionally global */
const KNOWN_GLOBAL_PATTERNS = [
  /^SLASH_/,
  /^SlashCmdList$/,
  /^BINDING_/,
  /^ITEM_QUALITY\d/,
  /^StaticPopupDialogs$/,
  /^LibStub$/,
  /^[A-Z][A-Za-z]+Mixin$/,
];

/** APIs whose return values can be nil */
const NILABLE_APIS = [
  "GetItemInfo",
  "GetSpellInfo",
  "C_Item.GetItemInfo",
  "GetInventoryItemLink",
  "GetLootSlotLink",
  "UnitName",
  "GetContainerItemInfo",
  "C_Container.GetContainerItemInfo",
  "GetInventoryItemID",
  "C_Item.GetItemNameByID",
  "C_Spell.GetSpellName",
];

/** APIs that accept spell/item/quest IDs as arguments */
const ID_ACCEPTING_APIS = [
  "GetSpellInfo",
  "GetItemInfo",
  "C_Spell.GetSpellInfo",
  "C_Spell.GetSpellName",
  "C_Item.GetItemInfo",
  "C_Item.GetItemNameByID",
  "C_QuestLog.IsQuestFlaggedCompleted",
  "C_QuestLog.GetQuestObjectives",
  "IsSpellKnown",
  "IsPlayerSpell",
  "GetSpellCooldown",
  "GetItemCooldown",
  "GetItemCount",
  "C_MountJournal.GetMountInfoByID",
];

/** Deprecated APIs and their replacements */
const DEPRECATED_APIS: Record<string, string> = {
  getglobal: "_G[name]",
  setglobal: "_G[name] = value",
  GetItemInfo: "C_Item.GetItemInfo (retail)",
  GetSpellInfo: "C_Spell.GetSpellInfo (retail)",
  GetContainerItemInfo: "C_Container.GetContainerItemInfo",
  GetContainerNumSlots: "C_Container.GetContainerNumSlots",
  GetContainerItemLink: "C_Container.GetContainerItemLink",
  GetContainerNumFreeSlots: "C_Container.GetContainerNumFreeSlots",
  GetContainerItemID: "C_Container.GetContainerItemID",
};

// ---------------------------------------------------------------------------
// Input parsing helpers
// ---------------------------------------------------------------------------

function isFilePath(target: string): boolean {
  const trimmed = target.trim();
  if (trimmed.includes("\n")) return false;
  if (trimmed.endsWith(".lua")) return true;
  if (trimmed.startsWith("/") || trimmed.startsWith("~")) return true;
  return false;
}

function resolveFilePath(target: string): string {
  const trimmed = target.trim();
  if (trimmed.startsWith("~")) {
    return path.join(process.env.HOME || "~", trimmed.slice(1));
  }
  return trimmed;
}

async function readLuaSource(target: string): Promise<{
  source: string;
  label: string;
}> {
  if (!isFilePath(target)) {
    return { source: target, label: "inline code" };
  }

  const filePath = resolveFilePath(target);
  const file = Bun.file(filePath);
  const exists = await file.exists();
  if (!exists) {
    throw new Error(`File not found: ${filePath}`);
  }

  const source = await file.text();
  return { source, label: filePath };
}

// ---------------------------------------------------------------------------
// Lint rules
// ---------------------------------------------------------------------------

function checkGlobalPollution(lines: string[], findings: LintFinding[]): void {
  const assignmentPattern = /^(\w+)\s*=/;
  const localPattern = /^\s*local\s+/;
  const functionPattern = /^\s*function\s+/;
  const commentPattern = /^\s*--/;
  const controlPattern = /^\s*(if|else|elseif|for|while|repeat|end|return|do)\b/;
  const methodAssignPattern = /^(\w+)[.:]/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Skip empty, comments, local declarations, control flow, function defs
    if (!trimmed) continue;
    if (commentPattern.test(trimmed)) continue;
    if (localPattern.test(line)) continue;
    if (functionPattern.test(trimmed)) continue;
    if (controlPattern.test(trimmed)) continue;

    const match = assignmentPattern.exec(trimmed);
    if (!match) continue;

    const varName = match[1];

    // Skip known WoW global patterns
    if (KNOWN_GLOBAL_PATTERNS.some((pat) => pat.test(varName))) continue;

    // Skip method-style assignments like MyAddon:Method or MyAddon.field
    if (methodAssignPattern.test(trimmed) && trimmed.includes(":"))
      continue;

    // Skip "MyAddon = MyAddon or {}" self-init pattern
    const selfInitPattern = new RegExp(
      `^${escapeRegex(varName)}\\s*=\\s*${escapeRegex(varName)}\\s+or\\b`,
    );
    if (selfInitPattern.test(trimmed)) continue;

    // Skip "function AddonName" style global function definitions
    if (/^function\s/.test(trimmed)) continue;

    findings.push({
      line: i + 1,
      severity: "warning",
      category: "globals",
      message: `Global assignment to \`${varName}\` without \`local\` keyword.`,
      suggestion: "Add `local` keyword or use a namespace table.",
      code: trimmed,
    });
  }
}

function checkTaintRisks(lines: string[], findings: LintFinding[]): void {
  const setAttributePattern = /[.:]\s*SetAttribute\s*\(/;
  const securecallPattern = /\bsecurecall\s*\(/;
  const issecurevariablePattern = /\bissecurevariable\s*\(/;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed.startsWith("--")) continue;

    if (setAttributePattern.test(trimmed)) {
      findings.push({
        line: i + 1,
        severity: "info",
        category: "taint",
        message:
          "`SetAttribute` can cause taint if called during combat lockdown.",
        suggestion:
          "Ensure this is not called during combat lockdown (guard with `InCombatLockdown()`).",
        code: trimmed,
      });
    }

    if (securecallPattern.test(trimmed)) {
      findings.push({
        line: i + 1,
        severity: "info",
        category: "taint",
        message: "`securecall` detected - good practice for secure frame calls.",
        suggestion:
          "Verify the call target is a secure function from Blizzard code.",
        code: trimmed,
      });
    }

    if (issecurevariablePattern.test(trimmed)) {
      findings.push({
        line: i + 1,
        severity: "info",
        category: "taint",
        message:
          "`issecurevariable` detected - good practice for taint checking.",
        suggestion: "No action needed; this is a defensive taint check.",
        code: trimmed,
      });
    }
  }
}

function checkNilSafety(lines: string[], findings: LintFinding[]): void {
  const apiPatterns = NILABLE_APIS.map((api) => {
    const escaped = escapeRegex(api);
    return new RegExp(`\\b${escaped}\\s*\\(`);
  });

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed.startsWith("--")) continue;

    for (let a = 0; a < NILABLE_APIS.length; a++) {
      if (apiPatterns[a].test(trimmed)) {
        findings.push({
          line: i + 1,
          severity: "warning",
          category: "nil-safety",
          message: `\`${NILABLE_APIS[a]}\` can return nil.`,
          suggestion: "Add a nil check before using the result.",
          code: trimmed,
        });
        break; // one finding per line
      }
    }
  }
}

function checkHardcodedIds(lines: string[], findings: LintFinding[]): void {
  const apiCallPatterns = ID_ACCEPTING_APIS.map((api) => {
    const escaped = escapeRegex(api);
    return { api, pattern: new RegExp(`\\b${escaped}\\s*\\(\\s*(\\d+)\\s*\\)`) };
  });

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed.startsWith("--")) continue;

    for (const { api, pattern } of apiCallPatterns) {
      const match = pattern.exec(trimmed);
      if (!match) continue;

      const numericValue = parseInt(match[1], 10);
      if (numericValue <= 1000) continue;

      findings.push({
        line: i + 1,
        severity: "info",
        category: "hardcoded-ids",
        message: `Hardcoded ID \`${match[1]}\` passed to \`${api}\`.`,
        suggestion: "Consider using a named constant instead of a hardcoded ID.",
        code: trimmed,
      });
      break;
    }
  }
}

function checkEventHygiene(lines: string[], findings: LintFinding[]): void {
  const registerPattern = /[.:]\s*RegisterEvent\s*\(\s*["']([^"']+)["']\s*\)/;
  const unregisterPattern =
    /[.:]\s*UnregisterEvent\s*\(\s*["']([^"']+)["']\s*\)/;
  const registerAllPattern = /[.:]\s*RegisterAllEvents\s*\(/;
  const onEventDispatchPatterns = [
    /if\s+event\s*==/, // if event == "X"
    /self\s*\[\s*event\s*\]/, // self[event]
    /\[\s*event\s*\]/, // handler[event]
  ];

  const registeredEvents = new Map<string, number>(); // event -> first line
  const unregisteredEvents = new Set<string>();
  let hasOnEvent = false;
  let hasEventDispatch = false;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed.startsWith("--")) continue;

    // RegisterAllEvents
    if (registerAllPattern.test(trimmed)) {
      findings.push({
        line: i + 1,
        severity: "error",
        category: "events",
        message:
          "`RegisterAllEvents()` registers for ALL game events. This is almost always a mistake.",
        suggestion:
          "Register only the specific events you need with `RegisterEvent()`.",
        code: trimmed,
      });
    }

    // Track registered events
    const regMatch = registerPattern.exec(trimmed);
    if (regMatch && !registeredEvents.has(regMatch[1])) {
      registeredEvents.set(regMatch[1], i + 1);
    }

    // Track unregistered events
    const unregMatch = unregisterPattern.exec(trimmed);
    if (unregMatch) {
      unregisteredEvents.add(unregMatch[1]);
    }

    // Detect OnEvent handler
    if (/\bOnEvent\b/.test(trimmed) || /SetScript\s*\(\s*["']OnEvent["']/.test(trimmed)) {
      hasOnEvent = true;
    }

    // Detect event dispatch
    if (onEventDispatchPatterns.some((p) => p.test(trimmed))) {
      hasEventDispatch = true;
    }
  }

  // Warn about registered events without corresponding unregister
  for (const [event, line] of registeredEvents) {
    if (!unregisteredEvents.has(event)) {
      findings.push({
        line,
        severity: "warning",
        category: "events",
        message: `\`RegisterEvent("${event}")\` without a corresponding \`UnregisterEvent\` in this file.`,
        suggestion: "Consider unregistering events when no longer needed.",
        code: lines[line - 1].trim(),
      });
    }
  }

  // Warn about OnEvent without dispatch
  if (hasOnEvent && !hasEventDispatch && registeredEvents.size > 1) {
    findings.push({
      line: 1,
      severity: "warning",
      category: "events",
      message:
        "OnEvent handler detected but no event dispatch pattern found (e.g., `if event ==` or `self[event]`).",
      suggestion:
        "Add event dispatch in your OnEvent handler to route events to specific handlers.",
      code: "(file-level)",
    });
  }
}

function checkPerformance(lines: string[], findings: LintFinding[]): void {
  const onUpdatePattern = /\bOnUpdate\b/i;
  const tableCreationPattern = /[={,]\s*\{\s*\}|\{\s*\}/;
  const concatPattern = /\.\./;
  const loopPattern = /^\s*(for|while)\b/;
  const pairsPattern = /\b(pairs|ipairs)\s*\(/;
  const getTimePattern = /\bGetTime\s*\(\s*\)/;

  let insideOnUpdate = false;
  let onUpdateDepth = 0;

  // Track GetTime calls per function scope
  let functionStartLine = -1;
  let getTimeCallCount = 0;
  let firstGetTimeLine = -1;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed.startsWith("--")) continue;

    // Track OnUpdate scope (heuristic: function containing OnUpdate until end)
    if (onUpdatePattern.test(trimmed) && /function/.test(trimmed)) {
      insideOnUpdate = true;
      onUpdateDepth = 0;
    }

    if (insideOnUpdate) {
      // Count braces/function/end for depth
      if (/\bfunction\b/.test(trimmed)) onUpdateDepth++;
      if (/\bend\b/.test(trimmed)) {
        onUpdateDepth--;
        if (onUpdateDepth <= 0) insideOnUpdate = false;
      }

      // Table creation in OnUpdate
      if (tableCreationPattern.test(trimmed) && !/^\s*local\s+\w+\s*=\s*\w/.test(trimmed)) {
        findings.push({
          line: i + 1,
          severity: "warning",
          category: "performance",
          message: "Table creation inside an OnUpdate handler.",
          suggestion:
            "Table creation in OnUpdate causes garbage collection pressure. Reuse tables or create them outside the handler.",
          code: trimmed,
        });
      }

      // pairs/ipairs in OnUpdate
      if (pairsPattern.test(trimmed)) {
        findings.push({
          line: i + 1,
          severity: "info",
          category: "performance",
          message: "`pairs`/`ipairs` iteration inside OnUpdate handler.",
          suggestion:
            "If iterating large tables, consider throttling or caching results.",
          code: trimmed,
        });
      }
    }

    // String concat in loops
    if (loopPattern.test(trimmed)) {
      // Scan ahead within the loop body (heuristic: up to 50 lines or `end`)
      for (let j = i + 1; j < Math.min(i + 50, lines.length); j++) {
        const loopLine = lines[j].trim();
        if (/^\s*end\b/.test(loopLine)) break;
        if (concatPattern.test(loopLine) && !loopLine.startsWith("--")) {
          findings.push({
            line: j + 1,
            severity: "info",
            category: "performance",
            message: "String concatenation (`..`) inside a loop.",
            suggestion:
              "Consider using `table.concat()` or `string.format()` for building strings in loops.",
            code: loopLine,
          });
          break; // one finding per loop
        }
      }
    }

    // Track GetTime() calls per function
    if (/\bfunction\b/.test(trimmed)) {
      // Emit finding for previous function if multiple GetTime calls
      if (getTimeCallCount > 1) {
        findings.push({
          line: firstGetTimeLine,
          severity: "info",
          category: "performance",
          message: `\`GetTime()\` called ${getTimeCallCount} times in the same function.`,
          suggestion:
            "Cache the result in a local variable: `local now = GetTime()`.",
          code: lines[firstGetTimeLine - 1].trim(),
        });
      }
      functionStartLine = i + 1;
      getTimeCallCount = 0;
      firstGetTimeLine = -1;
    }

    if (getTimePattern.test(trimmed)) {
      getTimeCallCount++;
      if (firstGetTimeLine === -1) firstGetTimeLine = i + 1;
    }
  }

  // Check last function scope
  if (getTimeCallCount > 1 && firstGetTimeLine !== -1) {
    findings.push({
      line: firstGetTimeLine,
      severity: "info",
      category: "performance",
      message: `\`GetTime()\` called ${getTimeCallCount} times in the same function.`,
      suggestion:
        "Cache the result in a local variable: `local now = GetTime()`.",
      code: lines[firstGetTimeLine - 1].trim(),
    });
  }
}

function checkDeprecatedApis(lines: string[], findings: LintFinding[]): void {
  const apiPatterns = Object.entries(DEPRECATED_APIS).map(
    ([api, replacement]) => ({
      api,
      replacement,
      pattern: new RegExp(`\\b${escapeRegex(api)}\\s*\\(`),
    }),
  );

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed.startsWith("--")) continue;

    for (const { api, replacement, pattern } of apiPatterns) {
      if (!pattern.test(trimmed)) continue;

      // Don't flag the replacement API itself (e.g. C_Container.GetContainerItemInfo)
      if (api === "GetContainerItemInfo" && trimmed.includes("C_Container.")) continue;
      if (api === "GetContainerNumSlots" && trimmed.includes("C_Container.")) continue;
      if (api === "GetContainerItemLink" && trimmed.includes("C_Container.")) continue;
      if (api === "GetContainerNumFreeSlots" && trimmed.includes("C_Container.")) continue;
      if (api === "GetContainerItemID" && trimmed.includes("C_Container.")) continue;
      if (api === "GetItemInfo" && trimmed.includes("C_Item.")) continue;
      if (api === "GetSpellInfo" && trimmed.includes("C_Spell.")) continue;

      findings.push({
        line: i + 1,
        severity: "warning",
        category: "deprecated",
        message: `\`${api}\` is deprecated.`,
        suggestion: `Use \`${replacement}\` instead.`,
        code: trimmed,
      });
      break;
    }
  }
}

// ---------------------------------------------------------------------------
// Rule registry
// ---------------------------------------------------------------------------

const LINT_RULES: LintRule[] = [
  { category: "globals", name: "checkGlobalPollution", check: checkGlobalPollution },
  { category: "taint", name: "checkTaintRisks", check: checkTaintRisks },
  { category: "nil-safety", name: "checkNilSafety", check: checkNilSafety },
  { category: "hardcoded-ids", name: "checkHardcodedIds", check: checkHardcodedIds },
  { category: "events", name: "checkEventHygiene", check: checkEventHygiene },
  { category: "performance", name: "checkPerformance", check: checkPerformance },
  { category: "deprecated", name: "checkDeprecatedApis", check: checkDeprecatedApis },
];

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function formatFindings(
  findings: LintFinding[],
  label: string,
  lineCount: number,
): string {
  if (findings.length === 0) {
    return (
      `# WoW Addon Lint Report\n\n` +
      `**File:** ${label}\n` +
      `**Lines:** ${lineCount}\n` +
      `**Findings:** 0\n\n` +
      `No issues found.`
    );
  }

  const sorted = findings.sort((a, b) => a.line - b.line);

  const errorCount = sorted.filter((f) => f.severity === "error").length;
  const warningCount = sorted.filter((f) => f.severity === "warning").length;
  const infoCount = sorted.filter((f) => f.severity === "info").length;

  const header =
    `# WoW Addon Lint Report\n\n` +
    `**File:** ${label}\n` +
    `**Lines:** ${lineCount}\n` +
    `**Findings:** ${sorted.length} (${errorCount} errors, ${warningCount} warnings, ${infoCount} info)\n\n` +
    `## Findings\n`;

  const body = sorted
    .map(
      (f) =>
        `### Line ${f.line} - ${f.severity} (${f.category})\n` +
        `\`\`\`lua\n${f.code}\n\`\`\`\n` +
        `> ${f.message} ${f.suggestion}`,
    )
    .join("\n\n");

  // Build summary table per category
  const categoryCounts = new Map<
    string,
    { errors: number; warnings: number; info: number }
  >();
  for (const f of sorted) {
    const entry = categoryCounts.get(f.category) || {
      errors: 0,
      warnings: 0,
      info: 0,
    };
    if (f.severity === "error") entry.errors++;
    else if (f.severity === "warning") entry.warnings++;
    else entry.info++;
    categoryCounts.set(f.category, entry);
  }

  let summaryTable =
    "\n\n## Summary\n" +
    "| Category | Errors | Warnings | Info |\n" +
    "|----------|--------|----------|------|\n";

  for (const [cat, counts] of categoryCounts) {
    summaryTable += `| ${cat} | ${counts.errors} | ${counts.warnings} | ${counts.info} |\n`;
  }
  summaryTable += `| **Total** | **${errorCount}** | **${warningCount}** | **${infoCount}** |`;

  return header + body + summaryTable;
}

// ---------------------------------------------------------------------------
// Tool export
// ---------------------------------------------------------------------------

export default tool({
  description:
    "Static analysis tool for WoW addon Lua code. Catches common pitfalls: " +
    "global pollution, combat taint risks, missing nil checks, hardcoded IDs, " +
    "event hygiene issues, performance problems, and deprecated API usage. " +
    "Accepts a .lua file path or inline Lua code.",
  args: {
    target: tool.schema
      .string()
      .describe(
        "Absolute path to a .lua file, or inline Lua code to lint. " +
          "Detected automatically: strings with newlines or not ending in .lua are treated as inline code.",
      ),
    categories: tool.schema
      .array(
        tool.schema.enum([
          "globals",
          "taint",
          "nil-safety",
          "hardcoded-ids",
          "events",
          "performance",
          "deprecated",
        ]),
      )
      .optional()
      .describe(
        'Which lint categories to run. Default: all. Options: "globals", "taint", "nil-safety", "hardcoded-ids", "events", "performance", "deprecated"',
      ),
  },
  async execute(args) {
    const { target, categories } = args;

    // --- Guard: empty target ---
    if (!target.trim()) {
      return "Error: `target` must not be empty. Provide a .lua file path or inline Lua code.";
    }

    // --- Parse input at boundary ---
    let source: string;
    let label: string;
    try {
      const parsed = await readLuaSource(target);
      source = parsed.source;
      label = parsed.label;
    } catch (err) {
      return `Error: ${err instanceof Error ? err.message : String(err)}`;
    }

    const lines = source.split("\n");

    // --- Determine enabled categories ---
    const enabledCategories = new Set<string>(
      categories && categories.length > 0
        ? categories
        : ALL_CATEGORIES,
    );

    // --- Run enabled rules ---
    const findings: LintFinding[] = [];
    for (const rule of LINT_RULES) {
      if (!enabledCategories.has(rule.category)) continue;
      rule.check(lines, findings);
    }

    // --- Format and return ---
    return formatFindings(findings, label, lines.length);
  },
});
