# Djinn

A structured loop for Claude Code. One command moves you through every phase of
a feature — from intent clarification to a merged PR — with an HTML artifact
trail committed alongside your code.

---

## /djinn

Run the next phase of the loop for the current branch. Always does the right
next thing — you never have to figure out where you are.

**Usage:**

```
/djinn              — run the next phase, or show status if waiting for approval
/djinn approve      — write approval marker to current artifact, advance phase
/djinn revise       — flag current artifact, re-run current phase prompt
/djinn status       — print current branch, phase, and artifact state
```

**Prerequisites:** git push access to the remote. Djinn auto-commits and pushes
after every phase. If push fails, the artifact is already written locally — push
manually when network recovers.

---

## Command implementation

When the engineer types `/djinn` (or any variant), execute the following:

### 1. Read local state

```bash
git branch --show-current
```

Store the result as `BRANCH`. If the branch is empty (detached HEAD), stop and
say: "Djinn requires a named branch. Create one with `git checkout -b <name>`."

Derive the artifact directory `ARTIFACT_DIR` as follows:

1. **DATE** — today's date in `YYYY-MM-DD` format (UTC).
2. **SLUG** — extract a ticket ID from `BRANCH` by matching the pattern
   `[A-Za-z]+-[0-9]+` (e.g. `tra-4556` from `mehdibeddiaf/tra-4556-reduce-...`).
   If no ticket ID is found, sanitize the branch name: strip any `username/`
   prefix, then replace all remaining `/` and non-alphanumeric characters with
   `-`, and truncate to 40 characters.
3. `ARTIFACT_DIR = .djinn/<DATE>/<SLUG>/`

**Important:** On subsequent `/djinn` calls on the same branch, the date must
stay fixed to when Phase 01 was first run — not today's date. Detect the
existing directory by searching `.djinn/` for a folder matching `*/<SLUG>/`.
If found, use that path as `ARTIFACT_DIR`. Only compute a new `DATE` when no
existing directory is found (i.e. Phase 01 hasn't run yet).

### 2. Detect current phase

Check which files exist in `<ARTIFACT_DIR>`:

```
Phase detection (evaluated top to bottom — first match wins):

RETRO GATE:
  08-pr-summary.html exists, 09-retro.html does not exist
  → Run Phase 10 (Retro) before merging the PR.

LOOP COMPLETE:
  09-retro.html exists
  → The loop for this branch is complete. Merge the PR.
    To start a new loop, create a new branch.

AWAITING APPROVAL (gate phases — /djinn with no subcommand shows status):
  07-review.html exists, djinn-approved != "true"    → Phase 08 awaiting approval
  05-plan.html exists, djinn-approved != "true"      → Phase 05 awaiting approval
  04-structure.html exists, djinn-approved != "true" → Phase 04 awaiting approval
  03-design.html exists, djinn-approved != "true"    → Phase 03 awaiting approval

NEXT PHASE TO RUN:
  no <ARTIFACT_DIR> directory                          → Phase 01 (Questions)
  01-questions.html exists, no 02-research.html       → Phase 02 (Research)
  02-research.html exists, no 03-design.html          → Phase 03 (Design)
  03-design.html approved, no 04-structure.html       → Phase 04 (Structure)
  04-structure.html approved, no 05-plan.html         → Phase 05 (Plan)
  05-plan.html approved, no 06-implement-log.html     → Phase 06 (Worktree) → Phase 07 (Implement)
  06-implement-log.html exists, no 07-review.html     → Phase 08 (Review)
  07-review.html approved, no 08-pr-summary.html      → Phase 09 (PR)
```

To check approval status: read `<ARTIFACT_DIR>/<file>` and check for
`<meta name="djinn-approved" content="true">`.

### 3. Handle subcommands

**`/djinn` (no args):**
- If a gate phase is awaiting approval: show status (phase, artifact path, approve command)
- Otherwise: run the detected next phase prompt (see phase prompts below)

**`/djinn approve`:**
- Detect the current gate phase (the highest-numbered unapproved gate artifact)
- Read `<ARTIFACT_DIR>/<gate-artifact>.html`
- Add the three approval meta tags immediately after the existing `djinn-date` meta tag:
  ```html
  <meta name="djinn-approved"     content="true">
  <meta name="djinn-approved-by"  content="ENGINEER">
  <meta name="djinn-approved-at"  content="TIMESTAMP">
  ```
  Where ENGINEER is the git user (`git config user.name`) and TIMESTAMP is
  the current UTC time in ISO 8601 format.
- Also update the existing `<meta name="djinn-approved" content="false">` tag
  if present (change content to "true").
- Also update the status pill in the file bar from "Awaiting Approval" to "Approved".
- Confirm: "Approved phase NN for branch <BRANCH>. Run /djinn to continue."

**`/djinn revise`:**
- Detect the current artifact (highest-numbered phase file in `<ARTIFACT_DIR>`)
- Rename it with a `-v2` suffix (e.g. `03-design.html` → `03-design-v2.html`),
  or `-v3` if `-v2` already exists, and so on.
- Re-run the current phase prompt from scratch.
- Never delete an artifact — append-only.

**`/djinn retro`:**
- Detect BRANCH as above.
- Run Phase 10 (Retro) prompt. Run it BEFORE the PR merges — after Phase 09
  has drafted the PR but before the engineer clicks merge — so that retro's
  changes are committed on the feature branch and land in main with the PR.
- Reads all committed artifacts for the branch (from `<ARTIFACT_DIR>` or
  `.djinn/.archive/` if archived post-merge).

**`/djinn status`:**
- Print: branch name, current phase, path to each existing artifact, approval
  state of gate phases, total token usage (sum of djinn-tokens-total across all
  artifacts).

### 4. Auto-commit and push

After writing a phase artifact (not after `/djinn approve` or `/djinn status`):

```bash
git add <ARTIFACT_DIR>
git commit -m "chore(djinn): phase 0N complete — <BRANCH>"
git push
```

Stage only `<ARTIFACT_DIR>` — never `git add -A` or `git add .`.

---

## Phase prompts

---

### Phase 01 — Questions

**Goal:** Capture the engineer's intent before any research or design. This phase
is human-authored — Claude facilitates, the engineer writes the content.

**Autonomy:** Human-only. Ask structured questions; wait for answers. Do not
generate answers on the engineer's behalf.

**Prompt:**

You are starting Phase 01 of the Djinn loop for branch `<BRANCH>`.

Ask the engineer the following questions, one group at a time. Wait for answers
before proceeding to the next group.

Group 1 — Problem:
1. What problem are you solving? Describe it in one or two sentences.
2. Who experiences this problem, and how do they experience it today?

Group 2 — Scope:
3. What is the Definition of Done? What must be true for this to be complete?
4. What is explicitly out of scope?

Group 3 — Constraints:
5. Are there any technical constraints (performance, compatibility, existing
   patterns you must follow)?
6. Are there any non-technical constraints (timeline, compliance, dependencies
   on other teams or features)?

Group 4 — Assumptions:
7. What are you assuming to be true that you haven't verified yet?
8. What is the single biggest unknown that could invalidate your approach?

Once answers are collected, read `templates/01-questions.html`, fill it with
the engineer's answers, and write the completed artifact to
`<ARTIFACT_DIR>/01-questions.html`.

---

### Phase 02 — Research

**Goal:** Ground the feature in the real codebase. The engineer approved the
questions; now the agent reads the code to understand what already exists.

**Autonomy:** Autonomous. Read the codebase; produce the artifact; the engineer
reviews it before Design begins.

**Prompt:**

You are running Phase 02 (Research) of the Djinn loop for branch `<BRANCH>`.

Read `<ARTIFACT_DIR>/01-questions.html` to understand the problem and scope.
Then investigate the codebase to answer:

1. **Relevant files:** Which files, modules, and directories are most relevant
   to this feature? List them with a one-line description of why each matters.

2. **Domain entities:** What are the key domain objects involved? What are their
   relationships? Where are they defined?

3. **Existing patterns:** What patterns, helpers, or conventions already exist
   that this feature should follow or extend? Name the canonical example for each.

4. **Risks and surprises:** What assumptions in the Questions artifact might be
   wrong? What did you find in the codebase that the engineer may not have
   accounted for?

5. **Open questions for Design:** What decisions about approach or structure can
   only be made after seeing the codebase? List them explicitly.

Read `templates/02-research.html`, fill it with your findings, and write the
completed artifact to `<ARTIFACT_DIR>/02-research.html`.

---

### Phase 03 — Design

**Goal:** Define what we're building and why. Produces REASONS R, E, A from the
SPDD REASONS Canvas.

**Autonomy:** Semi-auto. Agent generates draft; engineer approves before Structure.
Gate — wait for `/djinn approve` before Phase 04 begins.

**Prompt:**

You are running Phase 03 (Design) of the Djinn loop for branch `<BRANCH>`.

Read `<ARTIFACT_DIR>/01-questions.html` and `<ARTIFACT_DIR>/02-research.html`
before producing anything.

Produce three sections:

**R — Requirements**
- Restate the problem clearly
- List the requirements as specific, testable statements
- Write the Definition of Done
- Identify what is explicitly out of scope

**E — Entities**
- List the domain entities involved and their relationships
- Note which are new (being created) vs existing (being modified)
- Include a simple diagram if it would help (inline SVG or ASCII)

**A — Approach**
- Describe the overall strategy in plain English
- Explain why this approach over the obvious alternatives
- Identify the riskiest assumption in the approach and how to validate it early

Read `templates/03-design.html`, fill it with these three sections, and write
the completed artifact to `<ARTIFACT_DIR>/03-design.html`.

---

### Phase 04 — Structure

**Goal:** Define how we're building it. Produces REASONS S, O. Hard gate —
no implementation until this is explicitly approved.

**Autonomy:** Semi-auto. Agent generates; engineer must explicitly approve.
Hard gate — wait for `/djinn approve` before Phase 05 begins.

**Prompt:**

You are running Phase 04 (Structure) of the Djinn loop for branch `<BRANCH>`.

Read all prior artifacts (01 through 03) before producing anything.

Produce two sections:

**S — Structure**
- List every file that will be created, modified, or deleted
- For each file: what changes and why
- Identify component boundaries and dependencies
- Note any migrations, schema changes, or data movements

**O — Operations**
- Write a numbered list of implementation steps
- Each step must be independently verifiable (has a done-state)
- Order steps to minimise risk: most load-bearing and hardest-to-reverse first
- Flag any step that requires coordination with another engineer or system

Read `templates/04-structure.html`, fill it with these two sections, and write
the completed artifact to `<ARTIFACT_DIR>/04-structure.html`.

---

### Phase 05 — Plan

**Goal:** The full REASONS Canvas. All seven sections. This is the implementation
gate — the PreToolUse hook blocks all file writes until this is approved.

**Autonomy:** Semi-auto. Agent generates; engineer must explicitly approve.
Hard gate — PreToolUse hook enforces this mechanically.

**Prompt:**

You are running Phase 05 (Plan) of the Djinn loop for branch `<BRANCH>`.

Read all prior artifacts (01 through 04) before producing anything.

Produce the full REASONS Canvas — all seven sections:

**R — Requirements:** What problem are we solving? Testable requirements.
Definition of Done. Out of scope.

**E — Entities:** Domain entities and relationships. New vs existing. Diagrams
where useful.

**A — Approach:** Strategy in plain English. Why this shape over the alternative.
Riskiest assumption and how to validate it.

**S — Structure:** Every file to create, modify, or delete. Component boundaries.
Dependencies. Migrations.

**O — Operations:** Numbered implementation steps, each with a verifiable
done-state. Build order rationale.

**N — Norms:** Cross-cutting standards that apply to this change: naming,
observability, defensive coding, testing conventions. Reference the repo's
AGENTS.md/CLAUDE.md for project-specific norms.

**S — Safeguards:** Non-negotiable invariants: performance limits, security
boundaries, data integrity rules, things that must never happen.

Read `templates/05-plan.html`, fill it with all seven sections, and write the
completed artifact to `<ARTIFACT_DIR>/05-plan.html`.

---

### Phase 06 — Worktree

**Goal:** Spin up an isolated worktree for implementation. This is an operational
step — it produces no artifact. The implement log (Phase 07) covers the session
that follows.

**Autonomy:** Autonomous.

**Prompt:**

You are running Phase 06 (Worktree) of the Djinn loop for branch `<BRANCH>`.

The approved plan is at `<ARTIFACT_DIR>/05-plan.html`. Implementation is now
unlocked.

Confirm the worktree is set up:
1. If already on `<BRANCH>` in a clean checkout, proceed directly to Phase 07.
2. If the engineer wants a git worktree for parallel work, create one:
   ```bash
   git worktree add ../<repo>-<BRANCH> <BRANCH>
   ```

Notify the engineer that implementation may begin. Do not write any product code
in this phase — that is Phase 07.

Proceed immediately to Phase 07 (Implement) unless the engineer says otherwise.

---

### Phase 07 — Implement

**Goal:** Execute against the approved plan. Log every significant decision,
tool call, and deviation from the plan.

**Autonomy:** Autonomous. The PreToolUse hook verifies the approved plan on every
file write — no manual gate needed.

**Prompt:**

You are running Phase 07 (Implement) of the Djinn loop for branch `<BRANCH>`.

Read `<ARTIFACT_DIR>/05-plan.html` — the approved plan is your spec. Execute
the Operations steps in order.

As you work:
- Follow the Norms and Safeguards sections of the plan strictly
- Log every significant decision, deviation from plan, and file change to the
  implement log artifact (`<ARTIFACT_DIR>/06-implement-log.html`)
- If you discover something that contradicts the plan: stop, update
  `<ARTIFACT_DIR>/05-plan.html` first, then continue. Per SPDD governance:
  fix the artifact before fixing the code.
- Track token usage and write it to the implement log's djinn-tokens-* meta tags
  periodically

Read `templates/06-implement-log.html`, initialise it with the session start
time, and write it to `<ARTIFACT_DIR>/06-implement-log.html` before writing
any product code. Update it as you work.

---

### Phase 08 — Review

**Goal:** Adversarial code review — a fresh subagent with no conversation
history checks the diff against the committed REASONS Canvas. Surfaces plan
drift (files named in plan vs. actually changed, approach alignment, norms and
safeguards compliance) alongside general correctness and quality findings.

**Autonomy:** Agent-orchestrated adversarial subagent. Hard gate — engineer
must approve `07-review.html` before Phase 09 (PR) begins.

**Prompt:**

You are running Phase 08 (Review) of the Djinn loop for branch `<BRANCH>`.

First, collect the inputs:

```bash
git diff $(git merge-base HEAD origin/HEAD)..HEAD
```

Also read:
- `<ARTIFACT_DIR>/05-plan.html` — the approved REASONS Canvas (the spec)
- The project `CLAUDE.md` / `AGENTS.md` (conventions and norms)

Then spawn a reviewer subagent using the `Agent` tool. Pass the subagent:
1. The full diff output
2. The full text of `05-plan.html`
3. The project CLAUDE.md / AGENTS.md content
4. This reviewer mandate (do NOT pass the conversation history or the
   implement log — isolation is the point):

---

**Reviewer mandate:**

You are an adversarial code reviewer. You have no knowledge of the engineer's
intentions beyond what the code and the provided spec say. If intent is unclear
from the code alone, that is a finding, not exculpatory context.

You have been given:
- A diff of all changes on this branch
- A REASONS Canvas plan (the committed spec)
- Project conventions (CLAUDE.md / AGENTS.md)

Produce two sections:

**Section 1 — Plan Adherence**

Check the diff against the REASONS Canvas:

a) **Files**: List every file named in the Structure (S) section of the plan.
   For each: ✅ changed as planned / ⚠️ changed but not in plan / ❌ in plan
   but not changed.

b) **Approach alignment**: Does the implementation follow the strategy described
   in the Approach (A) section? Note any divergence.

c) **Norms (N) compliance**: For each norm listed in the plan, is it followed
   in the diff? Mark each ✅ / ❌ with evidence.

d) **Safeguards (S) present**: For each safeguard listed in the plan, is it
   implemented? Mark each ✅ / ❌.

**Section 2 — Findings**

Review the diff for: correctness bugs, hidden assumptions, missing test coverage
for new behaviour, inconsistency with existing patterns, convention violations,
over-engineering, and obvious security smells.

Scoring rules:
- Score each finding 0–100 for confidence. Drop findings below 50.
- Tag each finding: `Blocking` / `Suggestion` / `Question` / `Nit`
- `Blocking` = confidence ≥ 80 AND severity is correctness, security, or data
  integrity. Everything else is Suggestion, Question, or Nit.
- Skip anything a linter, formatter, or typechecker would catch.
- Confidence and severity are separate — a high-confidence nit stays a nit.
- Be specific: cite the file and line range for every finding.

Output format: structured text — one finding per block, clearly labelled.
Keep it direct and actionable. Do not pad with caveats or praise.

---

After the subagent returns, interpret the findings before presenting them:
drop false positives, consolidate duplicates, order by impact.

Read `templates/07-review.html`, fill it with:
- The Plan Adherence section (files table, approach, norms, safeguards)
- The Findings table (all findings with tag, confidence, file:line)
- A summary verdict: APPROVED (no blockers) or BLOCKERS PRESENT (n blocking)

Write the completed artifact to `<ARTIFACT_DIR>/07-review.html`.

Then present the findings to the engineer and triage via `AskUserQuestion`:
- Fix blockers now (re-implement, then re-run `/djinn`)
- Approve with outstanding suggestions (run `/djinn approve`)
- Discuss a specific finding

If blockers are present, `/djinn approve` may still be called but the engineer
must provide a documented override reason — write it into the artifact's
override section before approving.

---

### Phase 09 — PR

**Goal:** Generate a PR description from the REASONS Canvas and the implement
log. The artifact becomes the PR body. The Review gate has already passed.

**Autonomy:** Autonomous. Engineer reviews and merges.

**Prompt:**

You are running Phase 09 (PR) of the Djinn loop for branch `<BRANCH>`.

Read all artifacts — especially `05-plan.html` (the plan),
`06-implement-log.html` (what actually happened), and `07-review.html`
(findings and any approved overrides).

Generate a PR description that captures:
- **What changed** — a plain-English summary of the implementation
- **Why** — the problem this solves (from Requirements)
- **How** — the key approach decisions (from Approach, Structure)
- **Deviations** — anything that diverged from the plan, and why
- **Test plan** — what the reviewer should check to verify correctness
- **Artifact links** — links to each phase artifact (relative paths)

Read `templates/08-pr-summary.html`, fill it, and write to
`<ARTIFACT_DIR>/08-pr-summary.html`.

Then output the PR title and body to the conversation so the engineer can
copy it directly to GitHub/Gitea, or run:

```bash
gh pr create --title "..." --body "$(cat <ARTIFACT_DIR>/08-pr-summary.html)"
```

After pushing, address reviewer comments as they arrive. Return to
`/djinn retro` after the branch is merged.

---

### Phase 10 — Retro

**Goal:** Pre-merge retrospective. Reads all committed artifacts to assess
loop effectiveness and propose improvements to phase prompts and templates.
Self-improving — the loop gets better each cycle.

**Autonomy:** Semi-auto. Agent proposes; engineer approves all changes via
`AskUserQuestion` before anything is written.

**Trigger:** Runs automatically after Phase 09 (PR drafted), before the engineer merges.

**Prompt:**

You are running Phase 10 (Retro) of the Djinn loop for branch `<BRANCH>`.

Read all artifacts in `<ARTIFACT_DIR>`.

**Section 1 — Loop Health**

a) **Token efficiency by phase**: Read `djinn-tokens-total` from each artifact's
   meta tags. Which phases were heaviest? Was the spend justified by the output
   quality?

b) **Plan adherence**: From `07-review.html` plan adherence section — what was
   the file hit rate (files in plan vs. actually changed)? Were there unplanned
   files? Missing planned files? What does this say about planning quality?

c) **Goal alignment**: Compare the intent stated in `01-questions.html` against
   the PR summary in `08-pr-summary.html`. Did the implementation deliver the
   stated Definition of Done?

d) **Phase health**: Did Research (Phase 02) surface what Implementation
   actually needed? Were open questions resolved before the plan gate, or did
   they appear mid-implementation (visible in the implement log)? Were any
   phases thin (not enough investigation) or thick (over-investment)?

**Section 2 — Improvement Proposals**

Based on Section 1, propose specific improvements. For each proposal, quote the
*exact text to add, remove, or change* — not just a description of the change.

Types of proposals:
- **Phase prompt improvements** — changes to any phase prompt in `CLAUDE.md`
  (e.g. "Phase 02 Research never asked about X, but X came up in the implement
  log twice. Add X to the Research focus areas.")
- **Template improvements** — gaps in any `templates/0N-*.html` template
  (e.g. "The branch had two unresolved migration questions at plan time. Add a
  migration strategy question to `templates/01-questions.html`.")
- **Norms additions** — project-specific patterns that should be pre-loaded in
  Phase 05's Norms section going forward
- **Memory** — engineer preferences or project context worth saving to local
  memory

**Section 3 — Things That Worked**

What should be preserved and repeated? Be specific.

**Section 4 — Feedback for the engineer**

One to three observations about prompting, context quality, or decision-making
patterns visible in the artifacts. Direct but constructive.

---

After producing all four sections, present each proposal group via
`AskUserQuestion` and wait for approval before making any change.

On approval:
- Phase prompt / template improvements and norms additions → write to
  `.djinn/overrides.md` in the project repo (i.e. `$CLAUDE_PROJECT_DIR/.djinn/overrides.md`)
  following the hygiene rules below.
  Do NOT edit files inside the djinn repo — it is a shared base and changes
  there will be overwritten on the next pull from GitHub.
- Memory proposals → save to local memory

### overrides.md hygiene rules

The overrides file is organised into per-phase sections (e.g. `## Phase 05 Plan`,
`## Phase 08 Review`). Before writing any approved proposal:

1. **Read the entire `overrides.md` file.**
2. **Check for an existing entry covering the same rule or norm** — same phase,
   same subject. If one exists:
   - Update it in place (sharpen the wording, add the new example, extend the
     context). Do NOT add a duplicate entry.
3. **If no existing entry covers it:**
   - Find the section for the relevant phase (e.g. `## Phase 08 Review`).
     Create the section if it doesn't exist yet.
   - Append the new entry under that section.
4. **Never append blindly** — always read first, deduplicate, then write.

Read `templates/09-retro.html`, fill it with all four sections and the
approved/declined status of each proposal, and write to
`<ARTIFACT_DIR>/09-retro.html`.

Then auto-commit and push, staging both the retro artifact and the overrides file:

```bash
git add <ARTIFACT_DIR> .djinn/overrides.md
git commit -m "chore(djinn): retro complete — <BRANCH>"
git push
```

Remind the engineer: "Retro complete. Review the PR and merge when ready."
