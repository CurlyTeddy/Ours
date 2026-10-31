---
name: implement-feature
description: Implement a feature end to end in this repo: grill the request into a spec, build it with a high-effort builder agent while a test agent writes Vitest tests, review-fix until clean, then verify in the browser. Use when asked to implement, build or add a feature.
argument-hint: <feature description>
---

You are the **orchestrator**. You grill the user, write the spec, and run the gates and reviews. Two background agents write the files at `effort: high`:
- the **builder** writes the code (brief: `BUILDER.md`);
- the **test writer** writes the tests (brief: `TEST-AGENT.md`).

A third agent, the **e2e agent**, runs on Sonnet and verifies the feature in the browser (brief: `E2E-AGENT.md`).

Keeping the reviewer separate from the authors is deliberate. Edit no source or test file yourself: send every fix to the agent that owns the file.

The goal is a feature that works and is well written with zero human intervention. Every human step-in is a **lesson** these files failed to teach; see **Evolve**.

If the argument is an existing `docs/specs/*.md`, resume at **Build**.

## Spec

1. **Preflight.** Run `git status --porcelain`. Ask the user before continuing if anything is listed, because reviews run on the uncommitted tree and unrelated edits would mix in. Never create a branch or commit.
2. **Grill.** Invoke `mattpocock-skills:grilling` with the description. Look up every fact yourself first (existing code in `features/`, `components/ui/`, `package.json`), so each question you put to the user is a decision. Library choices settle here:
   - UI: use the `pick-ui-library` or `shadcn` skill.
   - Anything else: use an installed dependency if one covers it. Otherwise pick the package with the most npm downloads over the last year (`https://api.npmjs.org/downloads/point/last-year/<pkg>`) that has had a release within 6 months.
   - Ask the user when the top two are within 2x of each other, or when the choice is architectural (ORM, auth, state management, data fetching).
   - Give the reason behind every recommended answer, not only the facts. The user stopped a round to ask why a format change was recommended.
   - Never recommend leaving server-side enforcement of a client-side limit (size, type, count) out of scope. The user put it back into scope, because a client-only check isn't a limit.

   Done when the frontier is empty and the user confirms.
3. **Write `docs/specs/<slug>.md`** with these sections:
   - **Goal**
   - **Requirements**: numbered `R1…`, each one testable.
   - **Inputs & validation**: every field with its type, bounds and error message.
   - **Interfaces**: file path and export name of every route (method, request, response, status codes), component, hook and Zod schema. Both agents code against these, in parallel. Interfaces are yours to decide; don't put them to the user. Give each route handler's exact signature, such as `GET()` or `DELETE(request, { params })`, because the test writer calls handlers directly and a guessed argument list fails `tsc`. Name the exact import specifier of every new library, checked in its `package.json` `exports` (for example `libheif-js/libheif-wasm/libheif-bundle.mjs`). Each agent guessed a different path for `libheif-js`, and the builder needed two tries to match the test writer's mock.
   - **Data model changes**: normalize to 3NF. Put details that depend on an outside ID (a Google place, a YouTube video) in their own table, and point at it with a foreign key. Reuse an existing table such as `location` (Two-Dos, unique `placeId`) through `connectOrCreate`. The user rejected flat `place_*`/`song_*` columns on a note, because then every feature that pins places needs its own query.
   - **User flows**: numbered e2e scenarios.
   - **Libraries**: each with the reason.
   - **Out of scope**

   When a handoff reworks a screen that already exists, diff the shipped screen against the reference element by element (titles, chips, what hides in each mode), and write a requirement for each difference. "Keep today's behaviour" carried a shipped "Our Places" title onto the Map tab, where the reference hides the whole title block, and the user had to correct it.

   When the feature deletes a route, trace it through `proxy.ts` in both auth states before you write what users get there. A removed public path becomes a protected one, so logged out it redirects rather than 404s, and a spec that promised a 404 contradicted itself.

   When the feature ports a reference build (a design handoff), write requirements against what the reference actually does, not what its notes or checklist claim. Open it at phone and desktop width first; a checklist line like "the book fits on phones" was false for the reference and cost an escalation.

   Done when every grilled decision appears in the spec. Go straight on to Build, in the same turn.

## Build

Ask the user only at an **escalation**:
- the spec is silent or ambiguous on something users would notice;
- a review loop hits its cap or repeats a finding;
- a migration must reach the shared database;
- a library choice meets the ask rule in Spec step 2.

Write each answer into the spec, then send it to the agent that asked.

Every message between you and an agent goes through `SendMessage` to the agent ID returned at spawn. A message to an agent that has finished resumes it with its context intact.

1. **Spawn both agents in one message**, in the background, each with `subagent_type: general-purpose` and `effort: high`:
   - builder: `Read .claude/skills/implement-feature/BUILDER.md and follow it. Spec: <path>.`
   - test writer: `Read .claude/skills/implement-feature/TEST-AGENT.md and follow it. Spec: <path>. Phase: black-box.`
2. **Collect reports.**
   - Resolve every `ESCALATE` line and **spec gap** they raise.
   - If the builder created a migration, ask the user to apply only the new file to the Turso dev database the dev server uses: `! turso db shell <dev-db> < prisma/migrations/<new>/migration.sql`. Don't point them at `scripts/run-migrations.sh`: it replays every migration and prompts interactively.

   Done when the builder reports every `Rn` implemented with clean diagnostics.
3. **White-box tests.** Message the test writer: `Phase: white-box. Implementation files: <builder's list>.`
4. **Green.** Run `pnpm test run`. For each failure, the spec decides:
   - If the test matches the spec, send the failure to the builder.
   - If the test contradicts the spec, send it, with the spec line, to the test writer.
   - If the spec is silent, escalate.

   Repeat until all tests pass.
5. **Review loop** (cap 5 rounds).
   - Run `git add -N .` so new files show in `git diff`. This stages nothing.
   - Invoke `ponytail:ponytail-review` with `Uncommitted changes. Spec: <path>. Already rejected: <findings rejected in earlier rounds, each with its reason>`.
   - Send every **Must fix** and **Should fix**, verbatim, to the builder. Findings in test files go to the test writer. Leave Nice to have alone.
   - The review skill ends by addressing the user, but that report is input to this loop, not a stopping point. Dispatch its findings in the same turn. Once, the turn ended after the report, and the user had to ask why the loop never ran.
   - An agent may answer `REJECT n: <reason>` when a finding contradicts the spec or `CLAUDE.md`. Accept the rejection if the reason holds; otherwise send the finding back with your counter-argument.
   - Rerun step 4, then review again.

   Done when a round reports no Must fix or Should fix.
6. **Final gates.**
   - Run `pnpm exec prettier --write $(git diff --name-only --diff-filter=d HEAD)`. Nothing commits, so the lint-staged hook never formats.
   - Then run `pnpm lint` (auto-fixes the whole repo; an untracked input folder such as a design handoff gets linted too, so add `--ignore-pattern "<folder>/**"` via `pnpm exec eslint . --fix` rather than editing the ESLint config for a temporary folder), `pnpm exec tsc --noEmit`, `pnpm test run` and `pnpm build`. When the change deletes a route, `tsc` and `build` fail on stale `.next/types` and `.next/dev/types` validators. Build without the cache (`rm -rf .next && pnpm build`), or clear only those two folders, then rerun; Next regenerates them.
   - Read lint and type errors through `mcp__ide__getDiagnostics` with each file's URI, not by parsing ESLint output; it's one call per file and needs no script. If a gate fails on something this change didn't cause, such as generated output, fix the root cause in its config through the file's owner rather than working around it.
   - Send failures to the file's owner. Done when all pass in one sweep.
7. **E2E loop** (cap 5 rounds).
   - First round: spawn `subagent_type: general-purpose` with `model: sonnet` and the prompt `Read .claude/skills/implement-feature/E2E-AGENT.md and follow it. Spec: <path>. Regression flows: <list or none>.` Pick regression flows only for areas the diff changes (from `git diff --name-only HEAD`), never the whole list. A landing-page-only change needs none of the post-login areas. The user stopped a full-list run as wasted time.
   - On any failure, send the failing rows to the builder. If the cause isn't obvious, add `Diagnose with mattpocock-skills:diagnosing-bugs first.`
   - Then rerun step 4 and invoke `mattpocock-skills:code-review` with `Fixed point: HEAD. The change is the uncommitted working tree: diff it with "git diff HEAD" (new files are intent-to-add). Spec: <path>. There is no issue tracker; skip that lookup.` Send its Spec findings, its hard Standards violations, and any smell with a clear fix to the builder.
   - Then message the e2e agent to re-verify the failed flows plus any flow the fix touched.

   Done when every flow passes.
8. **Report** to the user:
   - what was built, and the files touched;
   - test counts by layer;
   - the number of review and e2e rounds, and the final e2e table;
   - any rules changed under **Evolve**;
   - what was not checked.

   Leave everything uncommitted. Mention that the new files are intent-to-add (`git reset` undoes that).
9. **Delete the spec** after the report: `git reset -- docs/specs/<slug>.md` then remove the file. The user doesn't keep feature specs; the code and tests are the record.

## Evolve

This skill improves itself. Write a lesson the moment one appears; don't wait for the report, because the details fade. Agents list their lessons in their reports; you write them.

**A lesson is due when:**
- **Human step-in**: the user corrects, rejects or hand-fixes the work, or answers an escalation that a rule could have answered.
- **Costly fix**: a fix took more than one attempt or a real diagnosis, a gate failed twice for the same reason, a fact took several lookups, or a step was wasted.

A typo, or anything a gate already catches cheaply, is not a lesson.

**Write it** as a positive rule with a one-line reason, in the step where it would have prevented the problem:
- orchestration rules go here;
- implementation rules go in `BUILDER.md`;
- test rules go in `TEST-AGENT.md`;
- browser-testing rules go in `E2E-AGENT.md`.

Prefer a fact that saves a lookup (a proven recipe, the exact command, a gotcha) over general advice. If a lesson is about a topic, not this pipeline (a library's gotcha, the Turso migration workflow), put it in its own model-invoked skill at `.claude/skills/<topic>/SKILL.md` and add a pointer line under **Pointers** saying when to load it.

**Prune** while you edit: merge duplicates, and delete rules made stale or already covered by the environment.

## Pointers

None yet.
