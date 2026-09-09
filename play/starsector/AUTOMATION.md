# Campaign automation

Read current Preflight instructions before launching. Its run directory and `runtime-process.json` are the identity boundary; a remembered PID is never sufficient. Session 01 used the Linux GNOME Wayland/XWayland driver and the existing Big Red RDP desktop for contextual pointer actions.

## Three recurring commands

From a built Byheart checkout (`npm install`, `npm run build`, Node 22+):

```sh
node play/starsector/session.mjs RUN_DIRECTORY observe
node play/starsector/session.mjs RUN_DIRECTORY pause
node play/starsector/session.mjs RUN_DIRECTORY unpause
```

These use `FilePreflightRuntimeTransport`, `PreflightGameSurface`, and `ReplayEngine`. Each pause operation creates a one-step semantic capability and stores the actual capability, result, and events below `RUN_DIRECTORY/byheart/`. The adapter checks action delivery separately from the observed pause effect. Active interaction dialogs are rejected; observe the UI and handle them normally.

[verified] Pause and unpause each succeeded in multiple distinct live runs. A pause request racing arrival at Galatia correctly failed with `campaign-interaction-active`; the following screenshot showed the jump dialog. This is useful refusal evidence, not a reason to bypass the boundary.

## PID-bound Linux screenshot helper

```sh
sh play/starsector/capture.sh PREFLIGHT_JAR RUN_DIRECTORY
sh play/starsector/capture.sh PREFLIGHT_JAR RUN_DIRECTORY key tab
```

The helper compiles with Java 17 and calls Preflight's existing Linux desktop driver. The optional key/click is restricted by that driver's reviewed catalog. Capture output is `RUN_DIRECTORY/desktop-smoke.png`; inspect it after every action. Contextual market/map clicks continue through real RDP UI input.

Requires an engine containing [Preflight PR #1310](https://github.com/teamleaderleo/preflight/pull/1310), which adds observation-only attachment. Compilation deliberately fails against older jars; never fall back to the ordinary attach, which activates the window and clicks its center. Temporary compiled helper classes are removed automatically. No code is injected into the game by this helper.

[verified] Session 01's final helper compiled against the newly packaged engine at `/home/leo/Projects/Byheart/runtime/preflight-observer.jar`, then captured the unchanged paused campaign. The running game itself continued using its original installed engine bytes; the observer jar did not replace the running game engine.

Resolve the current graphical session environment on Big Red with `systemctl --user show-environment`; use its actual `DISPLAY`, `XAUTHORITY`, session type, and DBus address. The helper sets `GDK_BACKEND=x11` for the existing XWayland capture path. Never reuse the old Xauthority filename without checking it.

## RDP and effect checks

- [observed] Follow the existing `big-red-rdp` skill and its connection script. Select the saved Windows App connection. Do not launch a second game through an app-name lookup.
- [observed] RDP's rendered frame sometimes froze while input still worked. Fresh Preflight screenshots were authoritative for effect checks.
- [observed] Session 01 mapped the 2048×1280 game into a 594×372 RDP rectangle at (297,232) in the Mac app screenshot. Reinspect the window before deriving coordinates; these dimensions are not a reusable target catalog.
- [observed] Use `mouseButton: 'right'` for map courses and explicit single keystrokes for dialog choices. Read each new menu before selecting: option numbers change.
- [verified] The corrected observer repeatedly captured dialogs without changing their options. Its original focus-click behavior is why screenshots must not implicitly focus a game window.

## Saves and shutdown

[observed] In paused campaign: Escape → Save → confirm Save writes the same continuing slot, then returns to the paused campaign. Verify save timestamp/content with Preflight's `save_state_guard.py` snapshot. Its disposable-save comparison is not a fresh-campaign attestation: for session 01, compare the two snapshot maps, require every prior campaign digest unchanged, and require exactly the new continuing campaign added. See `evidence/starsector/session-01/save-boundary.json`.

Use Preflight's exact-PID stop after the save is verified when ending a session. The campaign was not reloaded to erase ordinary mistakes.

## Limits retained

The main Byheart CLI discovery/replay route is still browser-oriented. This small helper uses the existing game surface directly; no browser trace or promoted skill was fabricated. No reusable market/trading/refit composition was verified this session. Make one only after the actual procedure repeats.
