# Djinn

A structured loop for Claude Code. One command moves you through every phase of
a feature — from intent clarification to a merged PR — with an HTML artifact
trail committed alongside your code.

```
Questions → Research → Design → Structure → Plan → Implement → Review → PR → Retro
```

Each phase produces a self-contained HTML artifact committed to `.djinn/<branch>/`.
Implementation is mechanically blocked until a plan is approved. PR generation is
blocked until an adversarial code review clears. The retro runs post-merge and
proposes improvements to the loop itself.

---

## What it does

| Without Djinn | With Djinn |
|---|---|
| Engineer types a vague prompt and starts coding | Engineer clarifies intent (Phase 01) before any agent touches the codebase |
| No record of why decisions were made | HTML artifact trail committed alongside every PR |
| Easy to skip planning; implementation runs on vibes | PreToolUse hook blocks file writes until plan is approved |
| No spec to review against — reviewer guesses intent | Adversarial subagent checks diff vs. committed REASONS Canvas |
| Token burn is invisible | Token usage tracked per phase, per branch, per engineer |
| Loop quality never improves | Post-merge retro proposes edits to phase prompts and templates |

---

## Prerequisites

- **Node.js ≥ 18** — required for the PreToolUse hook (`preToolUse.js`)
- **Git push access** to your remote — Djinn auto-commits and pushes after each phase
- **Claude Code** with a project that has a `CLAUDE.md` (this repo provides it)

---

## Setup

### 1. Clone the repo

```bash
git clone https://github.com/your-org/djinn ~/djinn
```

### 2. Add Djinn's CLAUDE.md to your project

Option A — symlink (recommended for single-repo use):

```bash
ln -s ~/djinn/CLAUDE.md ~/your-project/CLAUDE.djinn.md
```

Then add to your project's `CLAUDE.md`:

```
@CLAUDE.djinn.md
```

Option B — copy and reference directly (if symlinks are inconvenient):

```bash
cp ~/djinn/CLAUDE.md ~/your-project/CLAUDE.djinn.md
```

### 3. Register the PreToolUse hook

Add to your project's `.claude/settings.json`:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Write|Edit|MultiEdit|NotebookEdit",
        "hooks": [
          {
            "type": "command",
            "command": "node /absolute/path/to/djinn/.claude/hooks/preToolUse.js",
            "timeout": 10000
          }
        ]
      }
    ]
  }
}
```

Replace `/absolute/path/to/djinn` with the actual path where you cloned this repo.

### 4. (Optional) Add the GitHub Action to your project

Copy `.github/workflows/djinn-archive.yml` into your project's `.github/workflows/`.
This automatically archives branch artifacts to `.djinn/.archive/` after PRs merge.

---

## Usage

All commands are issued inside a Claude Code session on a feature branch.

```
/djinn              Run the next phase. Always does the right next thing.
/djinn approve      Approve the current gate phase and advance.
/djinn revise       Flag the current artifact for revision; re-runs the phase.
/djinn status       Show current branch, phase, and artifact state.
/djinn retro        Run the post-merge retrospective (Phase 10).
```

### Typical session

```bash
# 1. Create your feature branch
git checkout -b feat/my-ticket-description

# 2. Open Claude Code and start the loop
/djinn
# → Asks structured questions about the feature (Phase 01)
# → You answer; artifact committed and pushed

/djinn
# → Agent reads the codebase, produces research artifact (Phase 02)
# → Review it; run /djinn to continue

/djinn
# → Agent produces Design artifact — REASONS R, E, A (Phase 03)
# → Review it; run /djinn approve when satisfied

/djinn
# → Agent produces Structure artifact — REASONS S, O (Phase 04)
# → Hard gate: review carefully; /djinn approve to continue

/djinn
# → Agent produces full REASONS Canvas plan (Phase 05)
# → Hard gate: /djinn approve unlocks implementation

/djinn
# → Agent implements against the approved plan (Phases 06+07)
# → PreToolUse hook verifies approval on every file write

/djinn
# → Fresh subagent reviews diff vs. REASONS Canvas (Phase 08)
# → Plan drift report + findings (Blocking/Suggestion/Question/Nit)
# → Resolve blockers or document override; /djinn approve to continue

/djinn
# → Agent generates PR description from Canvas (Phase 09)
# → Copy PR body, open PR, merge

# After merge:
/djinn retro
# → Reads all artifacts; assesses plan adherence, token efficiency, goal alignment
# → Proposes improvements to phase prompts, templates, norms, memory
# → All proposals reviewed via AskUserQuestion before any change is written
```

### Overriding the gate (hotfixes)

The hook is exempt on `main`, `master`, and `develop` branches — no loop required
for direct hotfixes on those branches.

For feature branches, if you need to bypass the gate with a documented reason:

```bash
export DJINN_FORCE="hotfix: prod down, skipping plan for cache clear"
# ... write your files ...
unset DJINN_FORCE
```

The reason is logged to the implement log on the next `/djinn` run.

---

## How it works

### The plan gate (`preToolUse.js`)

Every `Write`, `Edit`, `MultiEdit`, and `NotebookEdit` tool call passes through
`.claude/hooks/preToolUse.js`. It checks for:

```html
<meta name="djinn-approved" content="true">
```

in `.djinn/<branch>/05-plan.html`. If absent: blocked. If present: allowed.

The hook fails open on infrastructure errors (git unavailable, unreadable files)
and never fires on `main`, `master`, or `develop`.

### The review gate (convention-enforced)

Phase 09 (PR Summary) is convention-gated: `/djinn` refuses to generate
`08-pr-summary.html` if `07-review.html` doesn't carry `djinn-approved=true`.
The adversarial reviewer runs as a fresh subagent (no conversation history) so
it can't inherit the engineer's motivated reasoning — it can only read what the
code actually says. The REASONS Canvas is passed as the spec; the reviewer
checks plan drift explicitly before doing any general quality review.

### Artifact trail

All artifacts live in `.djinn/<branch>/` on the feature branch:

```
.djinn/
  feat/my-ticket/
    01-questions.html       Human-authored intent
    02-research.html        Agent codebase analysis
    03-design.html          REASONS R, E, A
    04-structure.html       REASONS S, O
    05-plan.html            Full REASONS Canvas — plan gate (hook-enforced)
    06-implement-log.html   Session log, token usage, decisions
    07-review.html          Adversarial review — plan drift + findings (review gate)
    08-pr-summary.html      PR description, artifact links
    09-retro.html           Post-merge retrospective, improvement proposals
  .archive/
    2026-05-17/
      feat/my-ticket/       Post-merge permanent storage
```

### Meta tag schema (v1)

Every artifact carries these tags — the interface contract for `djinn_phoenix` (v2):

```html
<meta name="djinn-schema"       content="1">
<meta name="djinn-phase"        content="05">
<meta name="djinn-branch"       content="feat/my-ticket">
<meta name="djinn-engineer"     content="alice">
<meta name="djinn-date"         content="2026-05-17T09:14:31Z">
<meta name="djinn-approved"     content="true">
<meta name="djinn-approved-by"  content="alice">
<meta name="djinn-approved-at"  content="2026-05-17T09:31:00Z">
<meta name="djinn-tokens-in"    content="18431">
<meta name="djinn-tokens-out"   content="7204">
<meta name="djinn-tokens-total" content="141820">
```

---

## Governance rule

> **Fix the artifact first — then update the code.**

If implementation diverges from the plan, update `.djinn/<branch>/05-plan.html`
before changing the code. This keeps intent and implementation synchronized.

---

## Roadmap

- **v1 (this repo)** — Claude Code layer: `/djinn` command, PreToolUse hook, HTML artifacts, archive action
- **v2 (`djinn_phoenix`)** — Phoenix LiveView dashboard at `/djinn`: team visibility, phase progress, token budgets
- **v3 (`djinn_desktop`)** — Tauri desktop app: multi-loop management, approval queue, team coordination map
