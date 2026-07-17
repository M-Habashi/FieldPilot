# Shipping UI test

Last run: 2026-07-17 | Baseline: `8e5f2c6`

## Current contract

- Chrome: 44px header + 34px action bar; text-only actions; Tasks lives right.
- Tasks action always opens the list and deselects Properties; only pane X closes it.
- Drawer: one 384px shell, 12px base type, dense two-line task rows, internal scroll only.
- Motion: rail, drawer, drawer swaps, fit/zoom/focus use 220ms ease-in-out; pan stays direct.
- Properties: borderless text fields, compact spacing, task-color palette, separate Danger zone.
- Color: pin/list use the task color; new tasks reuse the last selected color from local storage.
- Layout: no page-level overflow; Tasks and Properties remain exactly equal width.

## Verified

- `pnpm build`; Chrome reports 384px/12px drawers and 220ms rail/drawer motion.
- Tasks is not a toggle; Properties -> Tasks works; text hover/selection has no box.
- Color picker updates the plan pin; zoom and fit work; no console errors or page overflow.

## Next run

Recheck narrow viewport, all themes, multi-task density, and direct pan feel.
