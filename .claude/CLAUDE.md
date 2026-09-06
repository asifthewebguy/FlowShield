# FlowShield — Claude Code Project Guide

> **Active:** Web — continuous deploy from `main` (not versioned) · Desktop — **v3.13.0-alpha.0** (`desktop-app-v3/`, Tauri 2)
> **GitHub:** asifthewebguy/FlowShield · **Live:** flowshield.app

Detailed rules are in `.claude/rules/` and loaded automatically based on context.

## Always-loaded rules
- [`project-overview`](.claude/rules/project-overview.md) — repo layout, versions, live URLs
- [`gotchas`](.claude/rules/gotchas.md) — common mistakes that have caused bugs
- [`architecture`](.claude/rules/architecture.md) — why things are built the way they are
- [`testing`](.claude/rules/testing.md) — test suites, counts, commands, verification checklist

## Context-loaded rules (by glob)
- [`web-app`](.claude/rules/web-app.md) — stack, API routes, Prisma models, env vars, scripts (`web-app/**`)
- [`desktop-app-v3`](.claude/rules/desktop-app-v3.md) — **the shipping desktop client**: Tauri 2 + React + Rust, local AI, release-please (`desktop-app-v3/**`)
- [`desktop-app`](.claude/rules/desktop-app.md) — LEGACY .NET app, superseded by v3 (`desktop-app/**`)
- [`mobile-app`](.claude/rules/mobile-app.md) — screens, offline queue, usage tracking (`mobile-app/**`)
- [`browser-extension`](.claude/rules/browser-extension.md) — Chrome vs Firefox, key behaviors (`browser-extension/**`)
- [`cicd`](.claude/rules/cicd.md) — workflows, triggers, release steps (`.github/workflows/**`)
- [`roadmap`](.claude/rules/roadmap.md) — shipped work and where the product actually stands

---

# Karpathy Skills — Coding Principles

Behavioral guidelines to reduce common LLM coding mistakes. Source: [forrestchang/andrej-karpathy-skills](https://github.com/forrestchang/andrej-karpathy-skills/blob/main/CLAUDE.md).

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them — don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it — don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.
