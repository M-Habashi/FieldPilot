# Shipping UI test

Last run: 2026-07-17 | Baseline: `a1400a5`

## Current contract

- Chrome: 44px header + 34px action bar; text-only actions; Tasks lives right.
- Tasks action always opens the list and deselects Properties; only pane X closes it.
- Drawer: one 384px shell, 12px base type, dense two-line task rows, internal scroll only.
- Motion: rail, drawer, drawer swaps, fit/zoom/focus use 220ms ease-in-out; pan stays direct.
- Properties: borderless text fields, compact spacing, task-color palette, separate Danger zone.
- Color: pin/list use the task color; new tasks reuse the last selected color from local storage.
- Layout: no page-level overflow; Tasks and Properties remain exactly equal width.
- Closed pin -> Properties uses the live task ID immediately; never flash the Tasks list first.
- Drawer mounts in the opening render, overlays the viewer at a fixed 384px, and animates only transform/opacity; task swaps do not remount/fade.
- Rail: keep a fixed 56px layout slot; expanded rail overlays and never moves the PDF.
- Pins: first click selects + names with a dedicated pointer-down ring; repeat/double-click opens Properties; an open Properties pane switches on one click; only locate icons center the PDF.

## Verified

- `pnpm build`; Chrome reports 384px/12px drawers and 220ms rail/drawer motion.
- Tasks is not a toggle; Properties -> Tasks works; text hover/selection has no box.
- Color picker updates the plan pin; zoom and fit work; no console errors or page overflow.
- Chrome sampled pin-open at 20ms/100ms: Properties present, Tasks absent, no main-view flash.
- Browser: rail 56->200 left main/world geometry unchanged; row/double-click do not navigate.
- Browser: list + Properties locate icons center the chosen pin; list locate keeps Tasks open.
- Browser: selection border, cross-pin selection, repeat-click open, double-click open, and live Properties switching pass with two pins.
- Browser frame samples: opening always shows Task details; selection swap stays 384px wide/fully opaque with stable main geometry.
- Browser: first-click ring opacity 0.79->1 with no zero frame; double-click open keeps main 1384px and PDF world geometry pixel-identical throughout.

## Next run

Recheck narrow viewport, all themes, multi-task density, and direct pan feel.
