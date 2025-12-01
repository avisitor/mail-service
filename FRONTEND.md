# Frontend Development Workflow

The frontend uses TypeScript as the source of truth, with JavaScript files generated automatically.

## File Structure
- **Source**: `src/frontend/main.ts` (edit this file)
- **Generated**: `src/frontend/main.js` (auto-generated, do not edit)
- **Styles**: `src/frontend/styles.css` (edit directly)
- **HTML**: `src/frontend/index.html` (edit directly)

## Development Commands

### Single Build
```bash
npm run build:frontend
```
Compiles TypeScript and copies the generated JavaScript to the frontend directory.

### Watch Mode (Development)
```bash
npm run dev:frontend
```
Watches TypeScript files for changes and automatically rebuilds the frontend JavaScript.

### Copy Only
```bash
npm run copy:frontend
```
Copies already-compiled JavaScript from dist to src (useful after `npm run build`).

## Important Notes
- Always edit `main.ts`, never `main.js`
- The `main.js` file is auto-generated and will be overwritten
- Run `npm run build:frontend` after making changes to see them in the UI
- The server serves files directly from `src/frontend/` in development mode
- App styling metadata lives in `src/frontend/keys/apps.json`, but each entry can now provide a `configUrl` pointing to a remote JSON file hosted by the application itself. When `configUrl` is available, mail-service fetches that file, merges the resulting values with the local entry, and uses the final `css_url`, `banner`, `embeddedMenu`, etc. This lets applications own their layout definitions without hard-coding every detail into the central repo.