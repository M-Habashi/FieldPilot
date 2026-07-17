# FieldPilot — Project Plan

Open-source construction field management app (Fieldwire alternative).
Core idea: teams upload plan sheets (PDFs), drop pins on them (tasks, issues, punch items),
and manage everything attached to those pins — properties, notes, photos, checklists — from
the office or the field.

---

## 1. Product Vision

- **Who it's for:** general contractors, subcontractors, architects, owners' reps, small firms
  that can't justify Fieldwire/Procore pricing, and teams that want self-hosting.
- **Core loop:** upload plans → drop pins → assign & track work → verify & close → report.
- **Differentiators (long term):** self-hostable, open data (no lock-in), plugin-friendly,
  offline-first mobile.

---

## 2. Full Feature Inventory (target scope, all phases)

### 2.1 Plans & Viewer
- [ ] Upload PDF plan sets (single- and multi-page)
- [ ] Render sheets fast at any zoom (tiled rendering for large sheets)
- [ ] Pan / zoom / rotate; fit-to-width / fit-to-page
- [ ] Sheet gallery with thumbnails, search, folders/disciplines (A, S, M, E, P…)
- [ ] Automatic sheet number/title extraction from title block (OCR — later)
- [ ] Versioning: upload a new revision of a sheet, pins carry over, compare/overlay versions
- [ ] Hyperlinked callouts between sheets (later)
- [ ] Calibration + measurement tools (distance, area) using sheet scale

### 2.2 Pins & Tasks (the heart of the app)
- [ ] Drop a pin anywhere on a sheet with one click/tap
- [ ] Pin opens a side panel with full detail view
- [ ] Task properties: title, category, status (P1/P2/P3 priority or custom workflow),
      assignee(s), watcher(s), start/due date, tags, cost/manpower fields (later)
- [ ] Notes / comment thread on each pin (chronological activity feed)
- [ ] Photo attachments (camera or file upload), file attachments
- [ ] Checklists inside a task
- [ ] Move/re-position a pin; move a task to another sheet
- [ ] Task list view (table) with filter/sort/group by status, assignee, category, due date
- [ ] Related tasks / linked tasks
- [ ] Task templates
- [ ] @mentions in notes

### 2.3 Markup & Annotation
- [ ] Freehand draw, arrows, clouds, rectangles, ellipses, text boxes on sheets
- [ ] Color/stroke options; per-user markup layers; publish vs. personal markups
- [ ] Measurement annotations (uses calibration)

### 2.4 Projects, People & Permissions
- [ ] Multi-project workspace; project dashboard
- [ ] Roles: admin, member, follower (per project)
- [ ] Invite by email; per-category or per-task visibility rules (later)
- [ ] Company/team directory

### 2.5 Files & Photos
- [ ] Project file storage (folders, versions)
- [ ] Photo gallery across the project, filterable by sheet/task/date/author
- [ ] Photo markup (draw on photos)

### 2.6 Forms & Reports
- [ ] Form templates: daily reports, inspections, safety audits, timesheets, T&M tags
- [ ] Custom form builder
- [ ] PDF report generation: task reports (with sheet snapshots + photos), form exports
- [ ] Scheduled/automatic email reports

### 2.7 Scheduling
- [ ] Task Gantt / calendar view
- [ ] Look-ahead planning (3-week look-ahead)
- [ ] Dependencies between tasks (later)

### 2.8 Specs & RFIs (advanced, Fieldwire "Business" tier features)
- [ ] Specifications viewer with auto-split by section
- [ ] RFIs: create, track, respond, link to pins
- [ ] Submittals tracking
- [ ] Change orders / budget items (much later)

### 2.9 Sync, Offline & Mobile
- [ ] PWA first (installable, works on tablets)
- [ ] Offline mode: cached sheets + queued edits, conflict resolution on reconnect
- [ ] Native mobile apps (React Native / Capacitor) — later

### 2.10 Platform
- [ ] Self-host via Docker Compose
- [ ] REST/JSON API + webhooks; API tokens
- [ ] Notifications: in-app, email, push (mobile later)
- [ ] Audit log / full activity history per project
- [ ] Data export (ZIP of files + CSV/JSON of tasks)
- [ ] i18n (English first; RTL support incl. Arabic)

---

## 3. Recommended Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | **React + TypeScript + Vite** | Ecosystem, contributors, fast dev loop |
| PDF rendering | **PDF.js** (render to canvas) | Battle-tested, no license issues |
| Pin/markup layer | **SVG or Konva.js overlay** on top of the PDF canvas | Crisp hit-testing, zoom-independent pins |
| State | Zustand (app state) + TanStack Query (server state, from Phase 2) | Simple, minimal boilerplate |
| Styling | Tailwind CSS | Fast iteration, consistent UI |
| Backend (Phase 2+) | **Node.js + Fastify (or NestJS) + PostgreSQL + Prisma** | TypeScript end-to-end, easy self-hosting |
| File storage | Local disk / S3-compatible (MinIO for self-host) | Standard |
| Auth (Phase 4) | Email+password with JWT sessions; OAuth later | Simple to self-host |
| Realtime (Phase 4) | WebSockets (or Postgres LISTEN/NOTIFY → WS) | Live pin updates |
| Deployment | Docker Compose | One-command self-host |

**Phase 1 runs 100% client-side** (no backend): PDF loaded from disk, pins stored in
IndexedDB/localStorage with import/export to JSON. This gets a usable demo fast and forces a
clean separation between UI and storage that pays off when the backend arrives.

---

## 4. Data Model (core entities, designed in Phase 1, persisted server-side in Phase 2)

```
Project        { id, name, code, createdAt, ... }
Sheet          { id, projectId, name, number, discipline, fileRef, pageIndex, width, height, version, ... }
Pin/Task       { id, sheetId, x, y,            // normalized 0..1 coords relative to sheet
                 title, category, status, priority, assignee, dueDate, tags[],
                 createdBy, createdAt, updatedAt }
Note           { id, taskId, author, text, createdAt }
Attachment     { id, taskId, kind: photo|file, fileRef, thumbRef, createdAt }
ChecklistItem  { id, taskId, text, done, order }
Category       { id, projectId, name, color, icon }
Status         { id, projectId, name, color, order }   // customizable workflow
```

Key decision: **pin coordinates are normalized (0–1) against the sheet's PDF page box**, so
they survive zoom, re-render, window resize, and even sheet re-uploads at different DPI.

---

## 5. Phases

### ✅ Phase 0 — Project setup (part of Phase 1 work)
Repo scaffolding, Vite + React + TS + Tailwind, ESLint/Prettier, basic CI, LICENSE (MIT or AGPL — decide), README.

### 🚩 Phase 1 — Plan viewer + Pins + Detail panel  ← **CURRENT**

> **Status (2026-07-17):** implemented (viewer, pins, panel, notes/photos, IndexedDB
> persistence, task list, JSON export/import, 3 switchable designs, bundled demo plan).
> Acceptance criteria below still need hands-on verification.
Goal: a user can open a PDF plan, drop pins, click a pin to open a side panel, and edit its
properties, notes, and images. Everything persists locally.

**1.1 PDF Viewer**
- Load a PDF from file picker or drag-and-drop
- Render current page with PDF.js on canvas
- Pan (drag) and zoom (wheel / pinch / buttons), fit-to-screen
- Page navigation for multi-page PDFs (each page = a "sheet")
- Re-render at appropriate resolution on zoom (no blurry sheets)

**1.2 Pin layer**
- "Add pin" mode: click on the sheet drops a pin at that spot
- Pins stored with normalized coordinates; stay glued to the drawing at any zoom/pan
- Pin visuals: colored marker per category/status, selected state, hover state
- Click a pin → selects it and opens the side panel
- Drag a pin to reposition (with confirm or undo)
- Delete pin (from panel, with confirmation)

**1.3 Side panel (task detail)**
- Slide-in panel from the right when a pin is selected
- Editable fields: title, category (color-coded), status, priority, assignee (free text for
  now), due date, description
- Notes: add timestamped notes, shown newest-first
- Images: attach one or more images (file picker / paste / drag-drop), thumbnail grid,
  click to view full-size (lightbox)
- All edits save immediately (optimistic, no Save button)

**1.4 Local persistence**
- Pins/tasks/notes/images persist in IndexedDB keyed by document fingerprint
  (reopening the same PDF restores its pins)
- Export/import project as JSON (+ images) so work isn't trapped in one browser

**1.5 Task list (minimal)**
- Simple list of all pins on the current document with status/category chips
- Click item → jumps viewer to that pin and opens the panel

**Acceptance criteria for Phase 1**
1. Open a 30-sheet architectural PDF (50MB+) and navigate smoothly.
2. Drop 50 pins on a sheet; pins stay pixel-accurate at min/max zoom.
3. Click a pin → panel opens < 100 ms; edit title/status/notes; add 3 photos.
4. Close browser, reopen, load same PDF → all pins and data restored.
5. Export JSON, import in a fresh browser profile → identical state.

### Phase 2 — Backend, projects & sheet management
- Node/Fastify + Postgres + Prisma; REST API
- Project CRUD; upload PDFs to server, server-side page splitting into sheets + thumbnails
- Sheet gallery (thumbnails, disciplines/folders, search)
- Tasks/notes/attachments move to server storage; client keeps optimistic updates
- Docker Compose for one-command self-hosting

### Phase 3 — Team features
- Auth (register/login, JWT), project membership, roles (admin/member/follower)
- Real assignees, @mentions, watchers
- Real-time updates via WebSockets (two users see each other's pins live)
- In-app + email notifications
- Activity feed / audit log per task and per project

### Phase 4 — Markup, measurement & task power tools
- Drawing tools on sheets (arrows, clouds, shapes, text, freehand)
- Scale calibration + distance/area measurement
- Task list power view: filter/sort/group, bulk edit, saved views, CSV export
- Checklists, task templates, related tasks
- Sheet versioning with pin carry-over and version compare/overlay

### Phase 5 — Forms & reporting
- Form templates (daily report, inspection, safety) + custom form builder
- PDF report generator: task reports with sheet snapshots + photos
- Scheduled email reports
- Photo gallery across project

### Phase 6 — Offline & mobile
- PWA: offline sheet cache, queued mutations, conflict handling
- Tablet-optimized UI (big touch targets, field mode)
- Optional native wrapper (Capacitor) for camera/push

### Phase 7 — Advanced construction workflows
- Scheduling: Gantt / calendar / 3-week look-ahead
- RFIs, submittals, specs viewer
- Public API + webhooks, integrations (Drive/Dropbox), BIM viewer (exploratory)

---

## 6. Phase 1 Implementation Order (suggested PR-sized steps)

1. Scaffold: Vite + React + TS + Tailwind + ESLint, app shell (toolbar / canvas area / panel slot)
2. PDF.js integration: open file, render page, page nav
3. Viewport engine: pan/zoom with proper transform math (screen ↔ document coords)
4. Pin overlay: add-pin mode, render pins, select/hover states
5. Side panel: properties form wired to a Zustand store
6. Notes + image attachments in panel
7. IndexedDB persistence + PDF fingerprinting
8. Drag-to-move pin, delete pin, task list sidebar
9. JSON export/import; polish pass (empty states, keyboard shortcuts, dark mode)
