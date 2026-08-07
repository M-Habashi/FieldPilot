# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Construction field teams: general contractors, subcontractors, architects, owners' representatives, and smaller firms working from plans in the office and in the field.

## Product Purpose

FieldPilot is an open-source construction field-management application. Teams upload PDF plans, place and manage task pins, attach evidence, and collaborate on work within a project.

## Positioning

FieldPilot combines plan-based work management with open data and a lower-cost, self-hosting-friendly alternative to products such as Fieldwire.

## Operating Context

Projects contain PDF plan sets, sheets, tasks, notes, attachments, and project members with role-based access. The core workflow is upload plans, place pins, assign and track work, verify it, and report it.

## Capabilities and Constraints

- Tasks retain their plan-specific sheet and normalized PDF coordinates.
- The project photo map is a separate, photo-first view: photos own optional geographic locations and can optionally be assigned to one existing task without changing their location.
- New map uploads are unassigned by default; task-panel uploads are assigned to the current task.
- Photos without readable GPS remain unmapped until an editor places them manually.
- Existing photo files are retained but become unassigned and unmapped when the photo map data model is introduced.
- The map uses Leaflet with OpenStreetMap tiles for normal interactive viewing only, with visible attribution and no offline or prefetch behavior.
- Project members can view the photo map; editors and admins can add, move, assign, and delete photos.
- Undo is user-specific, session-only, and keeps the latest 100 supported photo actions.

## Evidence on Hand

- [README.md](README.md) documents the current plan, pin, task, and photo workflow.
- [PLAN.md](PLAN.md) records the construction-field-management vision and the planned project photo gallery.

## Product Principles

- Keep field evidence tied to its actual capture location.
- Preserve task and plan context without forcing it to define geographic location.
- Make high-impact changes reversible and safe in collaborative projects.
- Favor clear, direct tools for field use over dense workflow complexity.

## Accessibility & Inclusion

- Icon-only map controls must provide accessible names and tooltips.
- Touch devices must have equivalents for desktop hover and right-click interactions.

## Photo Map Visual Regression Checklist

Before handing off a photo-map change, run the local app at `http://localhost:5173` and check the map in both sidebar states.

1. Open a plan, switch to **Map**, then expand and collapse the left sidebar. The map toolbar, map canvas, empty state, and bottom statistics bar must begin to the right of the sidebar at both widths; no control may be hidden underneath the sidebar or its collapse button.
2. At 100%, 125%, and a narrow browser width, confirm the first two toolbar controls are **Undo** and **Redo**, followed by Add, Move, and Filter. Disabled controls stay visible and readable rather than overlapping or wrapping under the sidebar.
3. Confirm map statistics live only in the bottom status bar (photo count, mapped count, and unmapped count when applicable); the toolbar is reserved for actions and short move-mode guidance.
4. Check the empty state, an unmapped photo, and a mapped-photo marker. Pan, zoom, and fit must remain reachable without covering the bottom statistics bar.
5. Run `pnpm lint`, `pnpm typecheck`, and the relevant tests. If browser automation is available, capture one expanded-sidebar and one collapsed-sidebar desktop screenshot before handoff.
