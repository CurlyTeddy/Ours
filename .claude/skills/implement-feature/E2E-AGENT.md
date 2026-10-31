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
4. **Logged-out flows** run in a fresh isolated context (`new_page` with an isolated context). The shared headless profile keeps session cookies from earlier runs: `/signup` silently redirecting to `/moments` means you are still logged in.
5. **Log in** at `http://localhost:3000/` (scroll to the bottom, click `Log in`, fill the "Welcome home" dialog) as email `fake@gmail.com`, password `12345678` (username `agent1`).

## Flows

Verify every flow in the spec's **User flows** section. Then run only the **regression flows** your prompt names: the orchestrator picks them from the areas the diff touches. If your prompt names none, run none. A flow that ends on another page (for example, login lands on `/moments`) checks only that the page arrived. Don't exercise that page's features.

For each flow:
1. Navigate to the page.
2. Screenshot it once loaded.
3. Interact.
4. Screenshot the outcome.
5. Judge it against the spec.

Run every flow at two widths: phone (`emulate` to 375x812) and desktop (1280x800). Most users are on phones. Avoid `resize_page`: after it, the page stops receiving clicks and keys even after a reload; switching widths needs a fresh `new_page` plus `emulate`.

The first `next dev` compile of a route or API takes 2–3s. Poll for the expected state with an `evaluate_script` loop before you screenshot.

A dialog fading in looks dim and seems to sit behind other layers. Wait about 600ms and check `elementFromPoint` before you report a stacking bug. To check an extended hit area, probe 2.9px past the visual edge, not 3.0px: sub-pixel rounding returns the container exactly at the boundary.

`fill` on an `<input type="date">` does not fire React's change handler. Click the month spinbutton, then `type_text` the digits, e.g. "10192026".

For hidden file inputs (`className="hidden"`), un-hide the input with `evaluate_script` (`el.classList.remove("hidden")`), then use `upload_file` on it.

The MCP has no wheel or pinch input: dispatch synthetic `WheelEvent`s or two-finger `TouchEvent`s on the target with `evaluate_script`, and read the resulting state from the DOM (e.g. the `transform` of `.reactEasyCrop_Image` for crop zoom).

A flow **fails** when the outcome differs from the spec, or when:
- at phone width, the page or any scroll container in it scrolls sideways. Run this with `evaluate_script`: `[document.documentElement, ...document.querySelectorAll("*")].filter(el => el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflowX !== "hidden" && el.clientWidth > 300)`. Intentional chip rows are fine. The page-level check alone missed a `main` with `overflow-x: auto` that clipped a button;
- at phone width, an element is clipped, overlaps another, or is too small to tap;
- `list_console_messages` shows an error during the flow (hydration errors included);
- `list_network_requests` shows a 5xx during the flow.

When the spec ports a reference build (a handoff page), compare a suspected visual failure against the reference at the same viewport before reporting it. A difference that the reference shows too is not a failure. A reference page with no viewport meta lays out at 980px under mobile emulation, so compare it with non-mobile emulation at the same width. In a `.dc.html` handoff, the playable page (e.g. `Main.dc.html`) renders as an unfilled template (`{{cal.day}}`). Compare against the static artboards (e.g. `Mobile.dc.html`) instead.

**Known false positive:** the automation's synthetic clicks break Radix focus management. That logs `TypeError: Cannot read properties of null (reading 'focus')` from Radix dropdowns, which never happens in a real browser. Ignore it. If a Radix dropdown can't be operated at all, mark the flow **blocked (CDP)**, not failed.

## Test data

Prefix the title or name of every record you create with `[e2e]`, so it's recognizable in the shared dev database. Delete each one through the UI at the end; that also verifies delete. List any you couldn't delete.

## Regression flows

- **Auth**:
  - login with valid credentials;
  - login with invalid credentials shows `Invalid credential.`;
  - signup with a bad invite code shows `Invalid invite code. Please check your input.`;
  - logged out, a protected route redirects to `/?callbackUrl=…` with the login dialog open;
  - logout from the avatar dropdown lands on `/`.
- **Moments** (the sticky-note wall):
  - the wall loads with the "Since 2022" / "Day N" chips and the calendar;
  - create a note from the pad, and it persists after reload;
  - delete a note through the confirm dialog;
  - the header's Map tab (`/map`) shows the globe and pins, and picking a trip in "Show on map" shows its numbered stops.
- **Two-Dos** (trips board at `/twodo?list=…`):
  - Inspiration loads with its rows, and the sidebar (phone: chips) lists the trips;
  - create a trip, then add a to-do to it from "Add to this trip";
  - tick an Inspiration idea and pick a trip in "Which trip was it on?", then Undo;
  - edit a to-do in its dialog, then delete it through the confirm dialog.
- **Profile**:
  - `/profile` loads;
  - a display-name change persists after reload;
  - saving shows `Profile updated successfully!`.
- **Theme**: the header's sun/moon theme toggle works and persists after reload.
- **Navigation**:
  - the Moments, Two Do and Map links work;
  - when logged out, the landing page `/` is the pop-up storybook: scrolled to the bottom, it shows a `Log in` button that opens the "Welcome home" dialog.

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
