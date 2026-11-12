# Super Members virtual office

This independent static app lives at `https://impact-series.web.app/super-members/`.
It is a developer conversation workspace, not the senior-facing Bapmunna product.

- Read README.md. Preserve the original app, its separate accounts, DB and mascot.
- Run `npm run test:office` from the repository root after changes. Also follow the root harness checks; their generic `full` profile does not replace these office-specific tests.
- Roles originate in `harness/team.json`; the build generates ignored `roster.mjs`. Never hand-edit the generated file.
- Real AI chat uses Firebase AI Logic/Gemini Developer API with mandatory App Check. No mock fallback, provider secrets, App Check debug tokens, or claim of repository/device execution in the public app.
- Keep Spark with no billing account attached. Setup/publish scripts assert this. Never link billing or lower App Check enforcement to solve an error.
- Use `scripts/publish.mjs plan` and inspect its complete preservation proof before an authorized publish. Do not deploy the staging folder with a normal blanket `firebase deploy` command.
- Preserve every path outside `/super-members/`, existing Hosting config and the baseline rollback version. Do not delete old releases to work around quota.
- App Check/AI setup and Hosting publication require authorization in the conversation, and are never part of build/test commands. Routine local edits and checks need no approval.
- Use synthetic chat content for QA. Do not load household records, credential files or other chats into model prompts. Do not record prompts, responses or session tokens in console logs.
