#!/usr/bin/env node
/**
 * Djinn — PreToolUse hook: plan gate enforcer
 *
 * Blocks Write/Edit/MultiEdit/NotebookEdit tool calls unless the current
 * branch has an approved plan at .djinn/<branch>/05-plan.html.
 *
 * Exit codes:
 *   0 — pass-through (allow the tool call)
 *   2 — block (Claude Code surfaces this as a user-visible error)
 *
 * Pass-through conditions (any one is sufficient):
 *   - Tool is not a write-class tool
 *   - File path is inside .djinn/ (Djinn writing its own artifacts)
 *   - Branch is main, master, or develop (hotfix path exempt)
 *   - DJINN_FORCE env var is set to a non-empty string (override with reason)
 *   - 05-plan.html exists and contains djinn-approved="true"
 *
 * Fail-open: any unexpected error exits 0 so infrastructure failures
 * never block engineers.
 */

"use strict";

const fs = require("fs");
const { execSync } = require("child_process");

// Write-class tools that require an approved plan
const WRITE_TOOLS = new Set(["Write", "Edit", "MultiEdit", "NotebookEdit"]);

// Branches exempt from the gate (hotfix path must stay open)
const EXEMPT_BRANCHES = new Set(["main", "master", "develop"]);

function main() {
  let input;

  try {
    const raw = fs.readFileSync("/dev/stdin", "utf8");
    input = JSON.parse(raw);
  } catch {
    // Cannot parse input — fail open
    process.exit(0);
  }

  const toolName = input.tool_name || "";

  // Not a write-class tool — pass through
  if (!WRITE_TOOLS.has(toolName)) {
    process.exit(0);
  }

  // Resolve the file path being written (varies by tool)
  const filePath =
    input.tool_input?.file_path ||
    input.tool_input?.path ||
    "";

  // Djinn writing its own artifacts — always allow
  // (prevents deadlock where Djinn can't write phase artifacts)
  if (filePath && (filePath.includes("/.djinn/") || filePath.startsWith(".djinn/"))) {
    process.exit(0);
  }

  // DJINN_FORCE override — allow with reason logged to stderr
  const forceReason = process.env.DJINN_FORCE || "";
  if (forceReason.trim()) {
    process.stderr.write(
      `⚠️  Djinn: plan gate bypassed.\n   Reason: ${forceReason.trim()}\n   This override will be logged in the implement log.\n`
    );
    process.exit(0);
  }

  // Read current branch
  let branch;
  try {
    branch = execSync("git branch --show-current", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    // git unavailable — fail open
    process.exit(0);
  }

  if (!branch) {
    // Detached HEAD or no branch — fail open
    process.exit(0);
  }

  // Exempt branches (hotfix path)
  if (EXEMPT_BRANCHES.has(branch)) {
    process.exit(0);
  }

  // Check for approved plan artifact
  const planPath = `.djinn/${branch}/05-plan.html`;
  let planHtml;

  try {
    planHtml = fs.readFileSync(planPath, "utf8");
  } catch {
    // Plan file missing — block
    block(branch, planPath, "No plan found.");
  }

  // Check for approval marker — must have djinn-approved content="true"
  if (planHtml.includes('name="djinn-approved"') && planHtml.includes('content="true"')) {
    process.exit(0);
  }

  block(branch, planPath, "Plan exists but has not been approved.");
}

function block(branch, planPath, reason) {
  process.stderr.write(
    `\n⛔ Djinn: implementation blocked.\n` +
    `   ${reason}\n` +
    `   Branch: ${branch}\n` +
    `   Expected: ${planPath} with djinn-approved="true"\n\n` +
    `   Run /djinn to generate a plan, then /djinn approve to unlock implementation.\n` +
    `   To override: set DJINN_FORCE="your reason" in your environment.\n\n`
  );
  process.exit(2);
}

main();
