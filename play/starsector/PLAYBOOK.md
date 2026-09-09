# Starsector playbook

Keep only reusable knowledge that should change later decisions.

## UI and controls

- [verified] Use real RDP input with fresh Preflight PID-bound screenshots; a delivered input is not proof of effect. RDP's own displayed frame sometimes freezes while input continues.
- [observed] Bulk text dropped characters; discrete keys entered the captain's name successfully, in lowercase.
- [observed] Leaving a dock resumes time. Pause immediately for planning.

## Campaign navigation

- [observed] Tab opens the map; Q selects sector, W selects system. Right-clicking a system lays in a course. After closing the map, A resumes that course; verify destination at lower right.
- [observed] Jump points present a dialog with explicit fuel cost. First exit from Sintalta cost 7 fuel; Galatia route estimated 47 additional fuel over 6.8 light-years.
- [observed] A direct local route can pass through a stellar corona. Inspect the line and add a waypoint around the star; this session paid supplies and temporary readiness for skipping that check.
- [observed] Inhabited-system jump dialog offers to turn on the transponder before jumping. Use it for ordinary legal visits.

## Economy and logistics

- [observed] Venture/Tarsus/Shepherd start has ample supplies but only 140/300 fuel. Hyperspace travel uses fuel by distance; in-game tutorial warns empty tanks can strand the fleet.

## Markets, trading, and smuggling

- [observed] Prism Freeport in Sintalta sells high-end stock at a large markup according to its station description. Avoid speculative early purchases with only 20,000 credits.

## Fleet building and refit

Nothing retained yet.

## Combat and encounter decisions

Nothing retained yet.

## Factions, missions, and reputation

- [observed] Academy → comm directory → Alviss Sebestyen offered `A History Mystery`, an unpaid anomaly investigation below Arcadia requiring Transverse Jump. Standard contracts were denied by the provost in this campaign's starting story state.

## Strategic acquisitions

- [observed] Academy → Research Tracts → Project Sonic requires 5,000 donated fuel. This is a later research investment, not an early courier contract.

## Reliable procedures

- [verified] `node play/starsector/session.mjs RUN_DIRECTORY pause|unpause` invokes Byheart's Preflight surface through ReplayEngine and records capability/result/events under the exact run's `byheart/` directory. Both actions succeeded in distinct live runs; effect receipts verify pause state.
- [observed] Docking: while paused, set the visible station as destination, then unpause through Byheart; observe the dock dialog before selecting a service.

## Reliable recovery rules

- [observed] Linux desktop driver's ordinary attach focuses and clicks the window center. Do not use it for read-only screenshots: it changed menus during this session. `attachForObservation` is the narrow repair, with a test excluding activation/input.
- [observed] CUA could not attach the Mac's dynamic Java app by its resolved bundle ID or executable path. Existing Preflight semantic actions still worked; that alone did not provide arbitrary market/map UI control. User authorized the working Big Red fallback.

## Sources / guide notes still worth remembering

No external guides consulted in session 01; lessons above came from live UI, tooltips, and repository/runtime evidence. Mod-sensitive story and skill behavior must not be generalized to vanilla.
