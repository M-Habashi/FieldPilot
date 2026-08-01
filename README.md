# FieldPilot

Open-source construction field management — an alternative to Fieldwire. Load a PDF plan set,
drop pins on the sheets, and track tasks with properties, notes, and photos attached to each pin.

The current build supports Google OAuth and verified email/password sign-in through Convex Auth.
Projects, uploaded plans, pins, task fields, and notes are stored in Convex and shared with project
members according to their role. See [PLAN.md](PLAN.md) for the full roadmap.

## Quick start

```bash
pnpm install
pnpm dev
```

Open the printed URL, then click **Load demo plan** (a bundled 3-sheet sample) or open your own
PDF plan set.

## Using it

| Action          | How                                                                                                                        |
| --------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Open a plan     | **Open PDF** in the action bar, or drag a PDF onto the empty state                                                         |
| Navigate sheets | Status-bar arrows (bottom), or `←` / `→`                                                                                   |
| Pan / zoom      | Drag to pan (or middle-mouse drag in any mode), scroll or pinch to zoom, controls bottom-right                             |
| Add a pin       | Toggle **Add pin** (or press `P`), click the sheet                                                                         |
| Edit a task     | Click its pin — the properties panel has title, status, priority, category, assignee, due date, description, notes, photos |
| Move a pin      | Drag it                                                                                                                    |
| Task list       | Toggle **Tasks** (right-side pane) — click a row to jump to its pin                                                        |
| Backup / share  | **Import** / **Export** in the action bar (JSON, photos included)                                                          |

## Tech

React 19 + TypeScript + Vite, Tailwind CSS v4, PDF.js, Zustand, IndexedDB (`idb-keyval`), Convex,
Convex Auth, Google OAuth, and Brevo transactional email.

The selected hosted architecture and every current or conditional external provider are documented
in [`docs/providers.md`](docs/providers.md). The ownership model and implemented Convex schema are in
[`docs/data-model.md`](docs/data-model.md).

Run the local quality baseline with:

```bash
pnpm check
pnpm build
```

Pins are stored with coordinates normalized 0–1 against the PDF page box, so they stay glued to
the drawing at any zoom and survive re-renders.

### Design system

The PDF viewer uses the Blueprint design. Components consume semantic tokens (`--fp-*`, mapped to
Tailwind utilities in `src/index.css`), while `src/themes/tokens.css` owns the Blueprint palette,
typography, radii, shadows, motion, and viewer geometry.

## License

TBD (MIT or AGPL — decision pending).
