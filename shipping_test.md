# Shipping UI test

Last run: 2026-07-17 | Baseline: `7489d6b`

## Current decisions

- Rail: 56px icon-only by default; 200px expanded; bottom chevron; no user footer.
- Drawer: Tasks and Properties share one 384px shell; in-flow at `lg+`, overlay below.
- Layout: app fits the viewport; no page scrollbar. Drawer content may scroll internally.
- File: one muted-text menu for Open PDF, Import, Export; keep design switcher.
- Tasks: compact rows, clear selection, empty-state Add pin CTA.
- Properties: editable title, narrow one-column layout, visible photo remove, separate Danger zone.
- Viewer: compact working zoom out/in/fit controls; centered sheet navigation.
- Keep unchanged: two top bars, fit icon, canvas grid, global target-size rules.

## Verified this run

- Production build passes.
- Rail expands cleanly; File menu styling and disabled states are correct.
- Zoom out, zoom in, and fit all work.
- Tasks -> Properties swaps at identical width; no window-level overflow.

## Next run

Recheck narrow viewport, all themes, photo keyboard/touch removal, and Delete/Close separation.
