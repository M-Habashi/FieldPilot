# FieldPilot

Open-source construction field management — an alternative to Fieldwire. Load a PDF plan set,
drop pins on the sheets, and track tasks with properties, notes, and photos attached to each pin.

**Phase 1** is fully client-side: no server, no account. Your pins and photos persist in the
browser (IndexedDB), keyed to the PDF's fingerprint — reopen the same plan and everything is
back. See [PLAN.md](PLAN.md) for the full roadmap.

## Quick start

```bash
npm install
npm run dev
```

Open the printed URL, then click **Load demo plan** (a bundled 3-sheet sample) or open your own
PDF plan set.

## Using it

| Action | How |
|---|---|
| Open a plan | **Open PDF** in the action bar, or drag a PDF onto the empty state |
| Navigate sheets | Status-bar arrows (bottom), or `←` / `→` |
| Pan / zoom | Drag to pan (or middle-mouse drag in any mode), scroll or pinch to zoom, controls bottom-right |
| Add a pin | Toggle **Add pin** (or press `P`), click the sheet |
| Edit a task | Click its pin — the properties panel has title, status, priority, category, assignee, due date, description, notes, photos |
| Move a pin | Drag it |
| Add a markup | **Markup** menu: text box, pen, highlight, line, arrow, rectangle, ellipse, revision cloud, callout, or Cloud+; callouts and Cloud+ include adjustable two-segment arrow leaders |
| Constrain a markup | Hold **Shift** while drawing or moving a handle: lines, arrows, dimensions, and calibration references snap orthogonally; Callout/Cloud+ leader elbows force the non-arrow segment horizontal or vertical while the arrow segment keeps its angle; box-like shapes become square |
| Measure | **Measure** menu: calibrate a sheet, add length dimensions, or measure rectangular/polygon areas |
| Save an annotated PDF | **File → Save marked-up PDF** downloads a local PDF with markups flattened onto their sheets |
| Draw orthogonally | Hold `Shift` while drawing or reshaping applicable markups to lock line segments horizontal or vertical |
| Edit a markup | Choose **Markup → Select / edit**, then drag the markup or its blue handles; double-click text on the plan to edit it in place |
| Calibrate measurements | **Measure → Calibrate scale**, drag across a known distance (hold **Shift** for a horizontal/vertical reference), then enter its real-world length and unit |
| Add a dimension | After calibrating that sheet, choose **Measure → Dimension** and drag between two points |
| Task list | Toggle **Tasks** (right-side pane) — click a row to jump to its pin |
| Switch design | Palette menu in the action bar: **Blueprint**, **Studio**, or **Carbon** |
| Backup / share | **Import** / **Export** in the action bar (JSON, photos included) |

Markups and page calibrations persist with the plan alongside tasks, and are included in project exports.

## Tech

React 19 + TypeScript + Vite, Tailwind CSS v4, PDF.js, Zustand, IndexedDB (`idb-keyval`).

Pins are stored with coordinates normalized 0–1 against the PDF page box, so they stay glued to
the drawing at any zoom and survive re-renders.

### Design system

All components consume semantic tokens (`--fp-*`, mapped to Tailwind utilities in
`src/index.css`). Each design in `src/themes/design-*.css` redefines the full token set —
palette, fonts, radii, shadows, motion — under `:root[data-design="<id>"]`, so a single CSS
file restyles the whole app. Add a fourth design by copying one file and registering it in
`src/themes/designs.ts`.

## License

TBD (MIT or AGPL — decision pending).
