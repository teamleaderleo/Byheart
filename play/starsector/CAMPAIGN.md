# Campaign state

Status: **session 01 complete — continuing campaign saved, game stopped**

## Identity

- Campaign/save name: `orison vale`
- Installed game/profile identity: Big Red `/home/leo/Games/starsector-0.98a-RC8`; installed mod set preserved.
- Active save path/copy: `/home/leo/Games/starsector-0.98a-RC8/saves/save_orisonvale_8892257165236837478`
- Started by: Codex
- Start date: 2026-09-09; March 1, cycle 206 in game.
- Current in-game date: March 31, cycle 206 — 30 days played.

## Current situation

- Location: Near Galatia Academy Station in Galatia; stationary and paused when saved.
- Credits: 20,000
- Fuel: 85/300
- Supplies: 487; approximately 0.7/day maintenance.
- Cargo/free space: 619/1050 used; 130 heavy machinery.
- Fleet summary: Venture cruiser, Tarsus freighter, Shepherd drone tender; 246 crew, minimum 205; CR 70%.
- Reputation/important relations: Independent start; Independent friendly 60/100 and Sebestyen cooperative 100/100 observed. No commission accepted.
- Active contracts/missions: `A History Mystery`: investigate the hyperspace anomaly below Arcadia, then use Transverse Jump next to the gate. Unpaid, no obligation. Strange Quantum Cube accepted free from Dorian Veynar at Prism's bar.
- Immediate threats/opportunities: No hostile encounter active. Fuel refill and income are priorities; exploration leads remain untested.
- Captain: level 1; Helmsmanship confirmed (+50% maneuverability, +15% top speed for piloted ship), 0 unspent skill points, 0 story points. Current modded character screen has combat skills and executive-officer slots, not the vanilla four skill trees.

## Current objective

Establish a viable exploration/salvage fleet, find a modest nearby expedition, and preserve operating cash.

## Next action

Launch the same save through current Preflight machinery, pause and inspect. Visit a nearby normal market for fuel and bar work, inspect flagship refit before combat, then evaluate the Arcadia anomaly against fuel range. Do not assume Academy research is paid work.

## Recent decisions worth preserving

- [observed] Mixed-age normal sector, Ensign start, Unknown background, help popups on, IronMode off. Starting fleet has ample supplies; Prism's description warns of marked-up high-end stock, so no purchases yet.
- [observed] Native fleet target name did not match resulting fleet; actual starting ships above are authoritative.
- [observed] Traveled Prism → Galatia Academy, consuming 55 fuel and 38 supplies in total. Direct local routing clipped the corona; readiness fell to 68% and recovered to 70%. No battles, trades, ship purchases, reloads, or paid jobs completed this session.
- [observed] Project Sonic requires donating 5,000 fuel; deferred. Sebestyen's standard contracts are held by the provost in this starting story state; he instead provided `A History Mystery`.

## Recovery / continuation

If a session ends, update this file before stopping. The next Codex session should be able to identify the exact save, inspect the current live state, and continue without replaying the whole campaign history.

- Completed Linux run: `/home/leo/.starsector-preflight/runs/20260909-204309-639-007ab0ed`; former PID 3880310, processStartedAt `2026-09-09T20:43:09.550Z`. Preflight confirmed this process stopped. A new launch must use its own identity.
- Installed engine SHA256: `fb59d11570ea59ddac3d67d12c5cdb1b9f657a39cc97f96dea7cf106fd830000`.
- Explicit UI save verified March 31 after accepting the lead and learning Helmsmanship. `campaign.xml` last written `2026-09-09T21:34:50.097786Z`; campaign digest `187a73bf0a88a9d00b6441490f43a0a2fa3eb5ebc78575483f829c02fdc5850b` across four files. Final paused screenshot retained in evidence.
- Baseline save hashes: `/home/leo/Projects/Byheart-play/session-01/saves-before.json`. No reloads or checkpoint branches used.
- End snapshot: same directory, `saves-after.json`. All ten pre-existing campaigns unchanged; this is the only added campaign. Global `saves/common` is outside the guard's scope.
- Mac attempted and stopped cleanly; its campaign saves were not loaded. Continuing campaign lives on Big Red.
- After stopping, Preflight `launch-settings set --memory-mb 8192 --confirm-settings-tools-closed` changed both initial/max heap from 2048 to 8192 MiB. Verified by its response; applies next launch, not yet tested in a new game JVM. Backup: `/home/leo/.starsector-preflight/launcher-file-backups/20260909-214521-021-09cb0bbc-starsector.sh`. User clarified low-memory warning alone is not a reason to stop.
- Automation entry points and compatibility notes: [AUTOMATION.md](AUTOMATION.md).
