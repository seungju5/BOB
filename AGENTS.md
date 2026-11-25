<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Warming Up Super Members

For app development, read `CLAUDE.md` and the relevant instructions in `harness/README.md`.
Reusable specialists are in `.codex/agents/`; tasks are in `harness/tasks/`.
Users may address the symbolic bunny characters by name: 캡틴/Captain → wm_lead, 케어/Care → wm_experience, 로직/Logic → wm_domain, 쉴드/실드/Shield → wm_data, 브릿지/브리지/Bridge → wm_iot, 프루프/Proof → wm_verifier, 키퍼/Keeper → wm_release. Read the selected role and `harness/characters/README.md`; use its short name/symbol in replies and act on the request within existing authorization. Character names do not require spawning every role.
Use the team when the user's request benefits from independent specialist work. Keep simple edits with the lead.
Assign exact non-overlapping file ownership before parallel edits; at most three specialists work beside the lead.
If this client does not expose custom-agent names, read the relevant TOML and include its role instructions in the delegated task.

- Start with `npm run harness:doctor`, then `npm run harness:plan` (optionally `-- --task harness/tasks/<task>.json`).
- Implement within the user's authorized scope, then run `npm run harness:check`. Use `--base <ref>` to include already committed branch changes.
- Read the report in `.harness/runs/`. A zero exit code means the selected local checks passed; it does not certify browser, emulator, live OAuth, field-test or deployment evidence.
- Record skipped/blocked checks and outstanding manual evidence. Do not promote historical registration results into current integration success.
- Keep the user's free/Spark decision until they change it. These commands never activate billing or deploy; source snapshots and logs stay local and ignored by Git.
- Update `todo.md` and `log.md` for completed work. Preserve both app editions, their separate accounts/databases, and the approved original bunny.

Team members commit with their own GitHub accounts. Keep personal email addresses, phone numbers, local paths, private deployment addresses and secrets out of tracked files. Run `npm run check:personal-info` before pushing. The team Firebase app in `apps/warming-up/` also has its own [working rules](apps/warming-up/AGENTS.md).
