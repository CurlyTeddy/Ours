# E2E agent brief

You verify the feature in the spec you were given in a real browser, and report. You are only testing: edit no files.

Do every check through the Chrome MCP tools (`mcp__chrome-devtools__*`: navigate, click, fill, screenshot). Judge the app only by what the browser shows. Reading the source or fetching a URL with curl proves nothing about the UI.

## Setup

1. **Load the Chrome tools** with ToolSearch (`chrome`).
2. **Orphaned Chrome**: if the tools fail with "browser is already running", an earlier session didn't clean up. Kill its headless Chrome (the user's own browser is untouched), then retry:
   ```bash
   powershell.exe -File - <<'PS1'
   Get-CimInstance Win32_Process -Filter "name='chrome.exe'" |
     Where-Object { $_.CommandLine -like '*chrome-devtools-mcp*' } |
     ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
   PS1
   ```
3. **Dev server**: check whether something already listens on port 3000:
   ```bash
   powershell.exe -Command "Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue"
   ```
   If it does, reuse it: the user's own server would otherwise make yours fail or move ports. Otherwise start one in the background with `node --inspect node_modules/next/dist/bin/next dev` (the VS Code "Next.js: debug full stack" configuration), and wait for the `Local:` URL.
4. **Log in** at `http://localhost:3000/login` as email `fake@gmail.com`, password `12345678` (username `agent1`).

## Flows

Verify every flow in the spec's **User flows** section. Then run the **regression flows** below for each area the change touches.

For each flow:
1. Navigate to the page.
2. Screenshot it once loaded.
3. Interact.
4. Screenshot the outcome.
5. Judge it against the spec.

Run every flow at two widths: phone (`emulate` or `resize_page` to 375x812) and desktop (1280x800). Most users are on phones.

A flow **fails** when the outcome differs from the spec, or when:
- at phone width, the page scrolls sideways (`evaluate_script`: `document.documentElement.scrollWidth > window.innerWidth`);
- at phone width, an element is clipped, overlaps another, or is too small to tap;
- `list_console_messages` shows an error during the flow (hydration errors included);
- `list_network_requests` shows a 5xx during the flow.

**Known false positive:** the automation's synthetic clicks break Radix focus management. That logs `TypeError: Cannot read properties of null (reading 'focus')` from Radix dropdowns, which never happens in a real browser. Ignore it. If a Radix dropdown can't be operated at all, mark the flow **blocked (CDP)**, not failed.

## Test data

Prefix the title or name of every record you create with `[e2e]`, so it's recognizable in the shared dev database. Delete each one through the UI at the end; that also verifies delete. List any you couldn't delete.

## Regression flows

- **Auth**:
  - login with valid credentials;
  - login with invalid credentials shows `Invalid credential.`;
  - signup with a bad invite code shows `Invalid invite code. Please check your input.`;
  - logged out, a protected route redirects to `/login?callbackUrl=…`;
  - logout from the avatar dropdown.
- **Moments**:
  - the photo carousel loads;
  - upload a photo;
  - delete a photo through the confirm dialog;
  - the message board shows messages;
  - the days-together counter shows.
- **Two-Dos**:
  - the table loads;
  - create a todo from the Add dialog;
  - edit a todo at `/twodo/{id}/edit`;
  - mark a todo done with the Done At date picker;
  - delete a todo with its checkbox and the confirm dialog;
  - status icons show a green check when done and a gray circle when not.
- **Profile**:
  - `/profile` loads;
  - a display-name change persists after reload;
  - saving shows `Profile updated successfully!`.
- **Theme**: the dark-mode switch works and persists after reload.
- **Navigation**:
  - the Moments and Two Do links work;
  - when logged out, the landing page shows `Login to Our Space`.

## Report

| Flow | Width | Status | Notes |
|------|-------|--------|-------|
| ...  | 375 / 1280 | pass / fail / blocked (CDP) | ... |

For each failure, give:
- what the screenshot shows (your reader sees only text);
- the steps to reproduce;
- expected vs actual;
- console errors and failed requests, verbatim.

## Re-verify rounds

A later message names the flows to re-run after a fix. Redo the setup steps that no longer hold (server, page, login), run only those flows at both widths, and report in the same format.

## Cleanup

In this order:
1. Delete your `[e2e]` data through the UI.
2. Close every page you opened with `close_page`.
3. Stop the dev server only if you started it; leave a reused one running.
