# Photo Map View — Fix Plan

**Executor:** DeepSeek (or any coding agent picking this up). All fixes target the map view.
**Scope:** the project photo map view (`ProjectPhotoMap`) and the app `Sidebar` that frames it.
**Repo rules (from `AGENTS.md`):** use `pnpm` (never `npm`); dev server must run at exactly `http://localhost:5173` against the tracked `.env.development` shared Convex deployment; do **not** create or modify `.env.local`; do not commit secrets; do not run git mutations.

---

## 0. Mandatory first step — write the validation list BEFORE coding

Before touching any code, copy the **Visual Validation Checklist** (section 13) into your working notes as a live TODO list. Every fix you implement must be ticked off against that list by actually looking at the running app (see section 12 for how to run it). A fix is only "done" when its checklist items pass visually and `pnpm check` is green.

---

## 1. Current architecture (read this first)

| Piece                       | File                                                                                                                     | Notes                                                                                                                                                                                                                                                                                                                          |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Map view                    | `src/components/projects/ProjectPhotoMap.tsx` (~1041 lines)                                                              | Leaflet map, markers, toolbar, overlays, context menu, status bar. This is the main file you will change.                                                                                                                                                                                                                      |
| Workspace frame             | `src/components/projects/ProjectPlanWorkspace.tsx`                                                                       | Renders `Sidebar` (absolute, z-50) + a width spacer + either the plan viewer or `ProjectPhotoMap` (line 425).                                                                                                                                                                                                                  |
| Left sidebar                | `src/components/Sidebar.tsx`                                                                                             | Two states: collapsed 56px (`w-14`) / expanded 200px (`w-50`). Collapse state lives in the zustand store (`useProject.sidebarCollapsed`, `toggleSidebar()` at `src/store/project.ts:792`).                                                                                                                                     |
| Marker styles               | `src/index.css` lines 302–437                                                                                            | `.fp-photo-map-marker-stack` and friends.                                                                                                                                                                                                                                                                                      |
| Status bar styles           | `src/index.css` line 91 (`.fp-statusbar`)                                                                                | 32px bar.                                                                                                                                                                                                                                                                                                                      |
| Task list (pattern to copy) | `src/components/TaskList.tsx` + `src/components/RightDrawer.tsx` + toggle button in `src/components/Toolbar.tsx:458–466` | The photos list must look/behave like this.                                                                                                                                                                                                                                                                                    |
| Lightbox (pattern to copy)  | `src/components/Lightbox.tsx`                                                                                            | **Do not reuse directly** — it is bound to the plan-store task photos. Copy its markup pattern into a map-local component.                                                                                                                                                                                                     |
| Slide-in animation hook     | `src/hooks/usePresence.ts`                                                                                               | Use for the new panels (same pattern as `RightDrawer`).                                                                                                                                                                                                                                                                        |
| Confirm dialog              | `src/components/ui/dialog.tsx` (`ConfirmDialog`)                                                                         | Used in `ProjectPlansPage.tsx` — copy that usage.                                                                                                                                                                                                                                                                              |
| Backend (no changes needed) | `convex/attachments.ts`                                                                                                  | Mutations already exist: `trashPhoto`, `restorePhoto`, `setPhotoLocation`, `clearPhotoLocation`, `restoreOriginalLocation`, `assignPhoto`. Attachment fields available for the properties panel: `fileName`, `size`, `createdAt`, `latitude/longitude`, `originalLatitude/originalLongitude`, `locationSource`, `contentType`. |
| Undo/redo                   | `src/lib/photo-map-undo.ts` + `pushUndo` in the map component                                                            | Reuse `handleTrash`, `handleMove`, `handleAssignment`, `handleRestoreOriginal` — they already push undo entries.                                                                                                                                                                                                               |

Line numbers are from the current commit and may drift as you edit — treat them as pointers, not gospel.

---

## 2. Fix 1 — Sidebar collapse arrow overlaps the map toolbar's Undo button

**Problem.** `Sidebar.tsx:50–62` renders the collapse chevron `absolute top-1 left-full`, i.e. floating _outside_ the sidebar on top of the content area. In map view it lands exactly on the Undo button (`ProjectPhotoMap.tsx:674`, first button of the `h-12` toolbar), blocking clicks.

**Change.**

1. **Delete the floating chevron button** from `Sidebar.tsx` entirely.
2. **Make the sidebar's right border the control.** Add a full-height drag handle:
   - `<div role="separator" aria-orientation="vertical" aria-label="Resize sidebar" tabIndex={0}>` positioned `absolute inset-y-0 -right-1 w-2 cursor-col-resize z-10` inside the `<aside>`.
   - Centered inside it, a small pill affordance with a horizontal-arrows icon (`ChevronsLeftRight` from lucide), visible on hover/focus of the handle (`opacity-0 group-hover:opacity-100` pattern or pure CSS on the handle).
   - **Drag:** on `pointerdown` capture the pointer, track `pointermove` — dragging right of the midpoint between 56px and 200px (~128px) expands, left of it collapses; on `pointerup` snap to the state. Movement < 4px counts as a click.
   - **Click:** toggles (same as the old chevron).
   - **Keyboard:** focused handle + `ArrowLeft` collapses, `ArrowRight` expands.
3. Add `setSidebarCollapsed(collapsed: boolean)` to `src/store/project.ts` next to `toggleSidebar()` (line ~792) so the handle can set an explicit target state during drag. Keep `toggleSidebar()` for click.
4. No change needed in `ProjectPlanWorkspace.tsx` — its spacer (lines 416–423) already follows `sidebarCollapsed`.

**Acceptance.** No floating button ever overlaps the map toolbar; Undo/Redo are clickable at both sidebar widths; border drag + click + keyboard all collapse/expand; the plans view still works identically.

---

## 3. Fix 2 — Delete a photo on demand

**Problem.** Delete exists only in the right-click context menu (`ProjectPhotoMap.tsx:1001–1007`). It must also be reachable from the photo detail UI.

**Change.**

1. In the new right-side detail panel (Fix 11), add a danger **Delete photo** button at the bottom of the actions.
2. Clicking it opens `ConfirmDialog` (see `ProjectPlansPage.tsx` usage): title `Delete <fileName>?`, description "The photo is removed from the project. You can restore it with Undo.", confirm label `Delete photo`, `danger`.
3. On confirm call the existing `handleTrash(photo)` (`ProjectPhotoMap.tsx:336`) — it already pushes an undo entry and clears selection.
4. Keep the context-menu Delete item as is.

**Acceptance.** Delete is available from both the detail panel (with confirmation) and the right-click menu; Undo restores the photo.

---

## 4. Fix 3 — Fit/extent button: wrong icon, inconsistent shape

**Problem.** `ProjectPhotoMap.tsx:772–782` uses the `LocateFixed` icon (reads as "my location") on a custom absolutely-positioned button that looks nothing like the Leaflet zoom in/out buttons below it.

**Change.**

1. Remove that custom `Button` block.
2. Add the fit action **as a native Leaflet control appended into the zoom control's own `leaflet-bar`**, so it is pixel-consistent (same size, borders, radius, hover):
   - In the map-init effect (lines 581–605), after creating the zoom control, call `const zoomContainer = zoomControl.getContainer()` (after `addTo(map)`) and `L.DomUtil.create('a', 'fp-leaflet-fit', zoomContainer)`.
   - Set `href="#"`, `role="button"`, `title="Fit photos to view"`, `aria-label="Fit photos to view"`, and inline an SVG of the lucide **`Maximize2`** icon (four corners outward — an "extent" glyph, not a location glyph). Inline SVG is required here because this is imperative DOM, not JSX.
   - Wire `L.DomEvent.on(link, 'click', L.DomEvent.stop)` and call `fitPhotos()` on click.
   - Store the element in a ref; in an effect on `mappedPhotos.length`, toggle the `leaflet-disabled` class + `aria-disabled` (and `tabIndex={-1}`) when there are no mapped photos.
3. Add a small CSS rule in `src/index.css` so the SVG centers in the `<a>` (`.fp-leaflet-fit { display: flex; align-items: center; justify-content: center } .fp-leaflet-fit svg { width: 15px; height: 15px }`). The `leaflet-bar` classes provide everything else.
4. Remove the now-unused `LocateFixed` import if nothing else uses it.

**Acceptance.** The fit button renders as a third segment of the zoom control bar (directly under +/−), shows an extent icon, greys out when there are no mapped photos, and still fits bounds on click.

---

## 5. Fix 4 — The map paints on top of everything

**Problem (root cause).** The map wrapper (`ProjectPhotoMap.tsx:770`, `div.relative min-h-0 flex-1`) creates **no stacking context**. Leaflet's internal panes/controls carry z-indexes of 200–1000, so they escape and compete with the app header (`z-60`), the sidebar (`z-50`), and the right drawer (`z-30`) — markers and controls paint over the chrome.

**Change.**

1. Add Tailwind's `isolate` class (`isolation: isolate`) to that wrapper div: `className={cn('relative min-h-0 flex-1 isolate', movingPhoto && 'cursor-crosshair')}`.
2. Inside the now-isolated context, the context menu's `z-[1000]` (line 963) can tie with Leaflet's `.leaflet-top`/`.leaflet-bottom` (z-index 1000) — bump the context menu to `z-[1100]`. The new panels (Fixes 9/11) sit at `z-[500]`–`z-[600]` inside the same context, which is fine.
3. Verify nothing else in the app relied on map internals leaking out (nothing should).

**Acceptance.** With the map open: the sidebar, app header, header dropdowns, the map's own Filter dropdown, and any dialog always paint above the map and its markers; the context menu and new panels still paint above the map.

---

## 6. Fix 4b — Redesign the "Assign task" picker

**Problem.** The current picker (inline in the top-left card, `ProjectPhotoMap.tsx:912–957`) visually groups the "Unassign task" row above the tasks, shows no task colors even though tasks have a `color` field, and — when a stack is selected — silently targets only the first photo.

**Change (the picker moves into the new right-side panel, Fix 11).**

1. The panel's **Assignment** section always shows the current state first: task color dot (`task.color`, fallback `#64748b` — same fallback as `taskColor()` at line 71), `#seq`, title; or "Unassigned".
2. An `Assign task` / `Reassign task` button expands the picker **inline in the panel**:
   - Header line naming the target: "Assign photo `<fileName>` to:" (truncated) — it is always explicit which photo is being assigned.
   - Search input (keep the existing `taskSearch`/`taskMatches` logic, lines 216–222).
   - A **flat** list of all matching tasks. Each row: color dot → `#seq` → title, single line, hover like `TaskList` rows. **One click assigns immediately** and closes the picker. No grouping, no sections, no intermediate step.
   - `Unassign task` is a single danger-styled row **pinned at the bottom**, rendered only when the photo currently has a task.
   - `Esc` or clicking outside closes without changes.
3. The context menu's `Assign task` item now opens this panel picker (select the photo, open panel, expand picker) instead of the old inline card.

**Acceptance.** Task rows show their colors; the list is flat; a single click assigns; the target photo is named; unassign is clearly separated at the bottom; works from panel and context menu; undo/redo still cover assignment.

---

## 7. Fix 5 — Move mode must lock the map so the PHOTO can be dragged

**Problem.** Move is currently click-to-place (map `click` handler, lines 650–661) while the map stays pannable — so trying to drag a photo just drags the map.

**Change.**

1. When `movingPhoto` is set (toolbar Move toggle or context menu "Move location"), enter a real move mode:
   - `map.dragging.disable()` and `map.boxZoom.disable()` in an effect on `movingPhoto`; re-enable on exit **and on unmount**.
   - Exclude the moving photo from `clusterPhotos` and render it as its own marker with `draggable: true`, `autoPan: true`, and `zIndexOffset: 1000` so it floats above clusters while dragged.
   - On marker `dragend`: `void handleMove(movingPhoto, marker.getLatLng())` then `setMovingPhoto(null)`. `handleMove` already pushes the undo entry.
2. **Cancel paths:** `Esc` cancels (extend the existing keydown effect at lines 480–501; make sure it doesn't fire while typing in an input); clicking the toolbar Move button again already toggles off. On cancel, the marker snaps back (it re-renders from data).
3. Remove the old map-`click`-to-place handler entirely.
4. While in move mode: do not let marker `click` change the selection, and disable the long-press context-menu timer (lines 631–639).
5. Keep the `cursor-crosshair` affordance on the wrapper.

**Acceptance.** In move mode the map cannot be panned by dragging; the photo marker follows the pointer (auto-pan near edges works); dropping commits the new location with a success toast and an undo entry; `Esc` and the Move button cancel cleanly; normal panning is restored afterwards.

---

## 8. Fix 6 — Markers are too small: increase by 100%

**Change.** Double the marker geometry in `src/index.css` (lines 302–411) and in `createPhotoIcon` (`ProjectPhotoMap.tsx:101–107`):

| Token                          | Now              | New               |
| ------------------------------ | ---------------- | ----------------- |
| `.fp-photo-map-marker-preview` | 46×46px          | 92×92px           |
| `.fp-photo-map-marker-stack`   | 48×54px          | 96×108px          |
| `::before` / `::after` cards   | 42×42px          | 84×84px           |
| `iconSize`                     | `[58, 66]`       | `[116, 132]`      |
| `iconAnchor`                   | `[29, 58]`       | `[58, 116]`       |
| count badge                    | 19px / 10px font | ~30px / 13px font |
| task pin badge                 | 14px             | ~22px             |
| `markerOverlapPx` (line 63)    | 28               | 56                |

Keep the hover `scale(1.45)` (it is relative). Keep borders at 2px unless the visual check shows they look thin at 2× — bumping to 3px is allowed; record the choice in the checklist. Re-tune the absolute offsets of the count badge and task pin so they sit on the doubled card correctly.

**Acceptance.** Markers are visibly ~2× larger, nothing clips, hover fan-out still works, clustering merges markers at a sensible distance.

---

## 9. Fix 7 — Don't render empty "stack" cards for 1–2 photos

**Problem.** `.fp-photo-map-marker-stack::before` and `::after` (`index.css:318–342`) always paint two empty backing cards, so a single photo looks like a stack of blank boxes.

**Change.**

1. In `createPhotoIcon`, add a modifier class from `group.photos.length`: `fp-photo-map-marker-stack--single` (1), `--pair` (2), none (3+).
2. CSS: `--single` hides both `::before` and `::after` (`content: none`); `--pair` hides only `::after`; 3+ unchanged. The count badge logic (only when >1) already exists and stays.

**Acceptance.** One photo = one clean card; two photos = one backing card; three or more = today's two-card fan.

---

## 10. Fix 8 — "Restore" is vague: make it explicit and only reachable via right-click while moving

**Change.**

1. The new detail panel (Fix 11) has **no Restore button at all** (the old card's button, lines 896–908, disappears with the card).
2. The right-click context menu shows **"Restore original GPS location"** **only while move mode is active** (`movingPhoto !== null`). Label it with the target coordinates when known, e.g. `Restore original GPS location (51.50740, -0.12776)`; keep it disabled with a tooltip when `originalLatitude === undefined`.
3. While move mode is active the context menu contains **only**: `Restore original GPS location` and `Cancel move`. All other items are hidden. Outside move mode there is no restore item anywhere.
4. The handler stays `handleRestoreOriginal` (line 276) — undo already works.

**Acceptance.** Restore can never be triggered accidentally; its label says exactly what it does and where the photo will go; it appears only in move mode's right-click menu.

---

## 11. Fix 9 — Photos list lives in a side panel; kill the bottom-left card

**Problem.** The only photo listing is the "Unmapped photos" floating card at the bottom-left of the map (lines 796–826). The user wants a proper list on the side, toggled like the task list.

**Change.**

1. **Delete the bottom-left unmapped-photos `<aside>` entirely.**
2. Add a toggle button to the map toolbar, next to Filter: lucide `Images` icon, `aria-pressed` reflecting state — mirroring the task-list toggle pattern in `Toolbar.tsx:458–466`.
3. New left-docked panel **inside the map wrapper** (so it inherits the Fix-4 isolation): `absolute inset-y-0 left-0 z-[500]`, width ~`270px`, surface styling like the drawer (`fp-panel` / `bg-surface border-r border-line-strong shadow-e2`), animated with `usePresence` exactly like `RightDrawer.tsx`.
4. Content modeled on `TaskList.tsx`:
   - Header: `Photos (n)` + close `X`.
   - One row per photo (respecting the all/assigned/unassigned filter): 28×28 thumbnail (or `Camera` placeholder), `fileName`, and a sub-line with the task color dot + `Task #n` or `Unassigned`, plus a warn-colored `No location` badge for unmapped photos.
   - Trailing hover action: a locate button (`LocateFixed`) that `map.flyTo([lat, lng], ≥ current zoom)` — disabled for unmapped photos.
   - Row click selects the photo and opens the right-side detail panel (Fix 11); if mapped, also pan the map to it.
5. Suggested new file: `src/components/projects/MapPhotoListPanel.tsx` (keep `ProjectPhotoMap.tsx` from growing further).

**Acceptance.** Bottom-left card is gone; the toolbar button toggles the list; rows match the task-list look; unmapped photos appear with a badge; locate pans the map; list and map selection stay in sync.

---

## 12. Fix 10 — Remove the weird label

**Change.**

1. Delete the toolbar status text `<p className="ml-2 text-xs text-t3">` (lines 763–767 — "N mapped photos" / "Click the map to place the selected photo."). Counts now live in the status bar (Fix 13).
2. Replace its move-mode hint with a small floating pill shown only while `movingPhoto`: centered at the top of the map (`absolute top-3 left-1/2 -translate-x-1/2 z-[500]`), e.g. `Move photo — drag it to the new spot · right-click for options · Esc to cancel`.
3. Keep the "Filtered" chip in the status bar (it is meaningful; it is **not** the label being removed).

---

## 13. Fix 11 + 12 — Right-side photo panel, lightbox, and stack drill-in

**Change.**

1. **Delete the top-left selected-photo card** (lines 828–959) including its inline task picker.
2. New right-docked panel inside the map wrapper: `absolute inset-y-0 right-0 z-[500]`, width `var(--fp-drawer-width)` (reuse the existing token so it matches the plan view's drawer), `usePresence` animation. Suggested file: `src/components/projects/MapPhotoDetailPanel.tsx`. Open whenever `selectedPhotos.length > 0`.
3. **Single photo** (`selectedPhotos.length === 1`):
   - **Photo first:** full-width preview at the top (height ~40–45% of the panel, `object-cover` over `bg-surface2`, `Camera` placeholder when no URL).
   - **Properties below:** Name (`fileName`), Location (formatted coordinates — reuse `formatLocation`, line 143 — plus the source label `Phone GPS` / `Manually placed` / `Location unavailable`), Date uploaded (`createdAt` via `Intl.DateTimeFormat` with date + time), Size (`size` — add a small `formatBytes` helper to `src/lib/utils.ts`).
   - **Assignment section** = the redesigned picker (Fix 4b).
   - **Actions:** `Move` (enters Fix-5 move mode) and danger `Delete photo` (Fix 2). **No Restore button** (Fix 8).
4. **Lightbox (view mode):** clicking the panel preview opens a full-screen viewer — copy the markup pattern of `src/components/Lightbox.tsx` (fixed inset-0, `z-90`, dark backdrop, centered `object-contain` image, top-right X, `useModalFocus`) into a **map-local** component (e.g. `MapPhotoLightbox`). **Clicking anywhere on the backdrop, the X, or `Esc` closes it.** Do not wire it to the zustand `lightboxPhotoId` store — that's for plan task photos.
5. **Stack drill-in (Fix 12):** when a cluster marker is clicked, `selectedPhotos` already becomes the whole group (line 624–627). With `length > 1` the panel shows a list view: header "N photos at this location" + the same row component as the list panel — effectively the photos list filtered to the stack. Clicking a row drills into that photo's detail view, with a `← All N photos` back link returning to the stack list.
6. Closing the panel clears `selectedPhotos`; `Esc` closes panel/lightbox (layered sensibly: lightbox first, then panel). The workspace `Esc` handler ignores the map view already (`ProjectPlanWorkspace.tsx:355`), so no conflict.

**Acceptance.** Clicking a marker or list row opens the right panel photo-first with name/location/date/size visible; preview click → centered view-mode lightbox that exits on any outside click; stack click → filtered list → drill-in → back; `Esc` behaves.

---

## 14. Fix 13 — Stats on the right of the status bar

**Change.** In the footer (lines 1012–1025): put the stats group on the right with `ml-auto` — order: optional `Filtered` chip, then `N photos`, `N mapped`, warn `N unmapped`. Keep `font-mono tabular-nums` so changing counts don't shift layout. Remove the old left placement and the old `ml-auto` on the "Filtered" span.

---

## 15. Suggested implementation order

1. Fix 4 (one-line isolation + z-index bump) — foundation.
2. Fix 1 (sidebar border handle; store setter).
3. Fix 3 (Leaflet fit control).
4. Fix 6 + 7 together (marker CSS + icon sizes).
5. Fix 5 (drag move), then Fix 8 (move-mode context menu with restore).
6. Fix 9 (list panel + toolbar toggle; remove bottom-left card).
7. Fix 11 + 12 (detail panel + lightbox + stack list; remove top-left card), with Fix 2 (delete) and Fix 4b (assign picker) built into the panel.
8. Fix 10 + 13 (toolbar label, status bar).
9. Validation pass (below).

---

## 16. How to run and validate (mandatory)

1. `pnpm install` if needed, then `pnpm dev` and open **exactly `http://localhost:5173`** (shared Convex dev deployment per `AGENTS.md`; do not create `.env.local`). Sign in with Google, open a project, open a plan, switch to the **Map** tab.
2. Test data: upload a few photos. Phone photos with GPS EXIF become mapped markers; plain screenshots become unmapped (place them via move mode after Fix 5). You need at least: 1 mapped single, a stack of 2+ at one spot (drop two photos at the same/nearby location), 1 unmapped.
3. Work through the **Visual Validation Checklist** below top to bottom, in the browser, marking each item pass/fail. Any fail → fix and re-check.
4. Finish with `pnpm check` (lint + typecheck + unit tests + format). All green.

### Visual Validation Checklist (copy this into your working notes FIRST)

- [ ] **1a.** No arrow button floats over the map toolbar; Undo/Redo clickable at both sidebar widths.
- [ ] **1b.** Dragging the sidebar border collapses/expands it; click toggles; keyboard arrows work when the handle is focused.
- [ ] **2.** Detail panel → Delete photo → confirm dialog → photo gone → Undo brings it back. Context-menu delete still works.
- [ ] **3.** Fit button is a segment of the zoom control bar (same shape/hover as +/−), shows an extent icon (not a location icon), is disabled with no mapped photos, and fits bounds with mapped photos.
- [ ] **4.** Map and markers never paint over the sidebar, app header, open dropdowns, or dialogs (open the Filter dropdown and the account menu to confirm).
- [ ] **4b.** Assign picker: task rows show color dots, flat list, one click assigns, target photo named, Unassign pinned at bottom, works from panel and right-click.
- [ ] **5.** Move mode: map can't be panned by dragging; the photo marker drags; drop commits with toast; Undo reverts; Esc and the Move button cancel.
- [ ] **6.** Markers are ~2× larger, no clipping, hover animation intact.
- [ ] **7.** Single photo shows one card; two photos show one backing card; three+ show the fan.
- [ ] **8.** No Restore button anywhere except the right-click menu **during move mode**; its label reads "Restore original GPS location (lat, lng)"; restoring works and is undoable.
- [ ] **9.** Toolbar Images button toggles the left photos list; the bottom-left unmapped card is gone; unmapped rows show a badge; locate pans the map.
- [ ] **10.** No text label in the map toolbar; the move-mode pill appears only while moving.
- [ ] **11.** Clicking a photo opens the right panel with the photo on top and Name / Location / Date / Size below; clicking the preview opens the centered lightbox; clicking anywhere outside closes it; Esc closes it.
- [ ] **12.** Clicking a stack shows the stack's photos as a list in the right panel; clicking one drills into its detail; back link returns to the stack list.
- [ ] **13.** Status-bar stats are right-aligned (`N photos · N mapped · N unmapped`, Filtered chip when active) and don't jump around when counts change.

---

## 17. Non-goals

- No backend/`convex/` changes (all needed mutations and fields exist).
- No changes to the plan viewer, pins, markups, or the zustand lightbox store.
- Do not remove the OpenStreetMap attribution.
- No git commits/pushes.
