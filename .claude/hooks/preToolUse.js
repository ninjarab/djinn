#!/usr/bin/env node
/**
 * Djinn -- PreToolUse hook: plan gate enforcer
 *
 * Blocks Write/Edit/MultiEdit/NotebookEdit tool calls unless the current
 * branch has an approved plan at .djinn/DATE/SLUG/05-plan.html.
 *
 * ARTIFACT_DIR derivation (mirrors CLAUDE.md spec):
 *   SLUG = first ticket ID match ([A-Za-z]+-[0-9]+) from branch name, lowercased.
 *          If no ticket ID, sanitize branch: strip username/ prefix, replace
 *          non-alphanumeric chars with -, truncate to 40 chars.
 *   Search .djinn/DATE/SLUG/ for the artifact directory.
 *   Falls back to legacy .djinn/BRANCH/ path for old-style branches.
 *
 * Exit codes:
 *   0 -- pass-through (allow the tool call)
 *   2 -- block (Claude Code surfaces this as a user-visible error)
 *
 * Pass-through conditions (any one is sufficient):
 *   - Tool is not a write-class tool
 *   - File path is inside .djinn/ (Djinn writing its own artifacts)
 *   - Branch is main, master, or develop (hotfix path exempt)
 *   - DJINN_FORCE env var is set to a non-empty string (override with reason)
 *   - 05-plan.html exists in artifact dir and contains djinn-approved="true"
 *
 * Fail-open: any unexpected error exits 0 so infrastructure failures
 * never block engineers.
 */

"use strict";

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const WRITE_TOOLS = new Set(["Write", "Edit", "MultiEdit", "NotebookEdit"]);
const EXEMPT_BRANCHES = new Set(["main", "master", "develop"]);

// Derive the slug from a branch name -- mirrors the ARTIFACT_DIR logic in CLAUDE.md
function deriveSlug(branch) {
  const ticketMatch = branch.match(/[A-Za-z]+-[0-9]+/i);
  if (ticketMatch) {
    return ticketMatch[0].toLowerCase();
  }
  // Sanitize: strip leading username/ prefix, replace non-alphanumeric with -, truncate
  return branch
    .replace(/^[^/]+\//, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .toLowerCase();
}

// Search .djinn/DATE/SLUG/ for an existing artifact directory
function findArtifactDir(slug) {
  const djinnDir = ".djinn";
  if (!fs.existsSync(djinnDir)) return null;

  let dateDirs;
  try {
    dateDirs = fs.readdirSync(djinnDir).filter((d) => {
      if (d === ".archive") return false;
      try {
        return fs.statSync(path.join(djinnDir, d)).isDirectory();
      } catch {
        return false;
      }
    });
  } catch {
    return null;
  }

  for (const dateDir of dateDirs) {
    const candidate = path.join(djinnDir, dateDir, slug);
    try {
      if (fs.statSync(candidate).isDirectory()) return candidate;
    } catch {
      // not found under this date dir, keep searching
    }
  }
  return null;
}

function isApproved(html) {
  return html.includes('name="djinn-approved"') && html.includes('content="true"');
}

function main() {
  let input;
  try {
    input = JSON.parse(fs.readFileSync("/dev/stdin", "utf8"));
  } catch {
    process.exit(0);
  }

  const toolName = input.tool_name || "";
  if (!WRITE_TOOLS.has(toolName)) process.exit(0);

  const filePath = input.tool_input?.file_path || input.tool_input?.path || "";
  if (filePath && (filePath.includes("/.djinn/") || filePath.startsWith(".djinn/"))) {
    process.exit(0);
  }

  const forceReason = process.env.DJINN_FORCE || "";
  if (forceReason.trim()) {
    process.stderr.write(
      "\u26a0\ufe0f  Djinn: plan gate bypassed.\n   Reason: " + forceReason.trim() + "\n   This override will be logged in the implement log.\n"
    );
    process.exit(0);
  }

  let branch;
  try {
    branch = execSync("git branch --show-current", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    process.exit(0);
  }

  if (!branch) process.exit(0);
  if (EXEMPT_BRANCHES.has(branch)) process.exit(0);

  const slug = deriveSlug(branch);

  // Primary: new date/slug format
  const artifactDir = findArtifactDir(slug);
  if (artifactDir) {
    const planPath = path.join(artifactDir, "05-plan.html");
    try {
      const html = fs.readFileSync(planPath, "utf8");
      if (isApproved(html)) process.exit(0);
      block(branch, planPath, "Plan exists but has not been approved.");
    } catch {
      block(branch, planPath, "No plan found.");
    }
  }

  // Fallback: legacy .djinn/BRANCH/ path (old-style artifact dirs)
  const legacyPath = path.join(".djinn", branch, "05-plan.html");
  try {
    const html = fs.readFileSync(legacyPath, "utf8");
    if (isApproved(html)) process.exit(0);
    block(branch, legacyPath, "Plan exists but has not been approved.");
  } catch {
    // not found on legacy path either
  }

  block(branch, ".djinn/DATE/" + slug + "/05-plan.html", "No plan found.");
}

function block(branch, planPath, reason) {
  process.stderr.write(
    "\n\u26d4 Djinn: implementation blocked.\n" +
    "   " + reason + "\n" +
    "   Branch: " + branch + "\n" +
    "   Expected: " + planPath + ' with djinn-approved="true"\n\n' +
    "   Run /djinn to generate a plan, then /djinn approve to unlock implementation.\n" +
    "   To override: set DJINN_FORCE=\"your reason\" in your environment.\n\n"
  );
  process.exit(2);
}

main();
