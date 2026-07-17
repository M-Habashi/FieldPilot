# Shipping UI test

Last run: 2026-07-17 | Baseline: `7489d6b` | Scope: screenshots + shallow clicks

## Improve

1. Replace the full-width Collapse row with a small rail-edge chevron.
2. Build a real icon-only collapsed rail; do not clip the 200px sidebar inside 56px.
3. Use one right drawer shell for Tasks and Properties.
4. Make Tasks and Properties exactly the same width.
5. Default the one-item sidebar to a narrow rail; expand only when navigation grows.
6. Remove the static Site user footer unless it opens a useful menu.
7. Merge/tighten the two top bars to return height to the plan.
8. Move Import/Export into a project overflow menu.
9. Hide the design switcher in shipping builds; it reads like demo tooling.
10. Add responsive drawers; fixed left + right widths crush the plan on small screens.
11. Prevent pane transitions from exposing chopped/cut content at the right edge.
12. Simplify task rows: title + primary status, then calmer secondary metadata.
13. Strengthen selected-task styling and its visual link to the selected pin.
14. Make the property title clearly editable before focus.
15. Separate Delete from Close; move Delete to a labeled danger action/menu.
16. Collapse the two-column properties form when the drawer is narrow.
17. Keep photo removal discoverable on touch/keyboard, not hover-only.
18. Add a direct Add pin CTA to the empty Tasks pane.
19. Clarify Fit-to-screen; the current icon resembles fullscreen.
20. Reduce/relocate the floating zoom control so it does not cover drawings.
21. Simplify the tiny low-contrast status bar; prioritize sheet navigation and mode.
22. Reduce the graph-paper contrast behind dense plan linework.
23. Raise key control targets toward 40–44px and avoid essential 10–11px text.
24. Preserve labels or provide strong tooltips/ARIA when toolbar buttons become icon-only.

## Next run

Check: expanded/collapsed rail, Tasks→Properties width/transition, narrow viewport, toolbar overflow, empty Tasks CTA, all themes. Stop after shallow button clicks.
