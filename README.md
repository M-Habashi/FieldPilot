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

Open `http://localhost:5173`. The repository includes non-secret development and production browser
endpoints, so a fresh clone can run both `pnpm dev` and `pnpm build` without reconstructing
`.env.local`. Port 5173 is fixed because it is the registered local OAuth callback; if it is occupied,
stop that process and run `pnpm dev` again instead of using another port.

To use a personal Convex deployment, copy `.env.example` to `.env.local`, run
`pnpm convex dev --once`, and keep `VITE_CONVEX_URL` and `VITE_CONVEX_SITE_URL` on the same deployment.
Provider secrets stay in Convex and must never be added to either file.

### Temporary developer accounts

The login screen accepts two shared developer accounts. They are provisioned automatically in the
configured Convex deployment on first sign-in, so dashboard, PDF viewer, and collaboration changes
are real and persist across devices:

| Email                       | Password     |
| --------------------------- | ------------ |
| `fake_acc_1@fieldpilot.dev` | `fake_acc_1` |
| `fake_acc_2@fieldpilot.dev` | `fake_acc_2` |

These credentials are intentionally public and must only be used for non-sensitive test data. To
disable new temporary-account sign-ins everywhere, set
`TMP_ACCOUNT_DEV_FEATURE_ENABLED` to `false` in
`convex/lib/tmpAccountDevFeature.ts` and deploy the Convex functions.

## Using it

| Action           | How                                                                                                                                                                                       |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Open a plan      | **Open PDF** in the action bar, or drag a PDF onto the empty state                                                                                                                        |
| Navigate sheets  | Status-bar arrows (bottom), or `←` / `→`                                                                                                                                                  |
| Pan / zoom       | Drag to pan (or middle-mouse drag in any mode), scroll or pinch to zoom, controls bottom-right                                                                                            |
| Add a pin        | Toggle **Add pin** (or press `P`), click the sheet                                                                                                                                        |
| Edit a task      | Click its pin — edit workflow, assignment, one or more quantity items, dates, location, tags, resources, notes, and photos; owners/admins can manage the shared optional-attribute layout |
| Move a pin       | Drag it                                                                                                                                                                                   |
| Add a markup     | **Markup** menu: text, pen, highlight, lines, shapes, revision clouds, callouts, or Cloud+                                                                                                |
| Edit a markup    | Choose **Markup → Select / edit**, then drag the markup or its blue handles; double-click its text to edit                                                                                |
| Measure a plan   | **Measure** menu: calibrate a sheet, then add dimensions, areas, radii, diameters, or arcs                                                                                                |
| Constrain / snap | Hold `Shift` for orthogonal drawing; toggle **Snap** to target plan geometry and other markup points                                                                                      |
| Save annotations | **File → Save marked-up PDF** downloads the source PDF with its current markups flattened onto each sheet                                                                                 |
| Task list        | Toggle **Tasks** (right-side pane) — click a row to jump to its pin                                                                                                                       |
| Quantity report  | Open **Quantities** in the project rail to total planned, completed, remaining, and overrun work across every plan                                                                        |
| Task activity    | Open a pin to review dated comments, photo uploads, and attribute or quantity changes in one chronological log                                                                            |
| Backup / share   | **Import** / **Export** in the action bar (JSON, photos included)                                                                                                                         |

Tasks, markups, and per-sheet measurement calibrations are stored in Convex and shared with
project members according to their role.

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
