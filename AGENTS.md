# Repository Guidelines

## Project Structure & Module Organization
- `src/`: backend runtime code.
  - `server.js`: Express + WebSocket API entrypoint.
  - `tmux.js`: tmux command wrapper (send keys, capture pane).
  - `pane-follower.js`: screen polling and snapshot push logic.
  - `terminal-text.js`: terminal text sanitizing/decoding helpers.
  - `util.js`: shared request/response utilities.
- `public/`: mobile web UI (`index.html`, `session.html`, `app.js`, `session.js`, `style.css`).
- `data/logs/`: runtime logs and captured terminal output files.
- `docs/`: design notes, implementation plans, screenshots.

## Build, Test, and Development Commands
- `npm install`: install dependencies.
- `npm start`: run the server on `127.0.0.1:5002` by default.
- `PORT=3000 npm start`: run on a custom port.
- `node --check src/server.js`: quick syntax check for a file (useful before commit).
- `curl --noproxy '*' http://127.0.0.1:5002/api/sessions`: sanity-check local API.
- Service deployment (if using systemd): `sudo systemctl restart mobilecc`.

## Coding Style & Naming Conventions
- Language: Node.js ESM (`"type": "module"`).
- Indentation: 2 spaces; keep code readable and avoid dense one-liners.
- Naming:
  - files: kebab-case (e.g., `pane-follower.js`);
  - functions/variables: camelCase;
  - constants: UPPER_SNAKE_CASE.
- Keep modules focused; put tmux interaction in `tmux.js`, not in route handlers.

## Testing Guidelines
- No formal test framework is configured yet.
- Use manual verification for changes:
  1. Start server, open session page on desktop/mobile.
  2. Verify snapshot updates, input send behavior, and reconnect flow.
  3. Validate APIs with `curl` for `sessions`, `attach`, and `log`.
- For bug fixes, include a short “repro + verify” note in PR description.

## Commit & Pull Request Guidelines
- Follow conventional commit style seen in history: `feat: ...`, `fix: ...`, `chore: ...`.
- Keep commits scoped to one logical change.
- PRs should include:
  - what changed and why;
  - impacted files/modules;
  - manual test evidence (commands/results);
  - screenshots for UI-visible changes.

## Security & Configuration Tips
- Do not expose this service directly to public internet without protection.
- Prefer Cloudflare Tunnel/Zero Trust or private network access.
- Do not commit secrets or machine-specific credentials.
