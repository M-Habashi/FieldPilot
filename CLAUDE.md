# FieldPilot — Claude Code Instructions

## Project
Open-source Fieldwire clone (construction field management). Roadmap and phase breakdown: see `PLAN.md`. Currently in Phase 1: client-side PDF viewer + pins + side detail panel.

## Subagent policy
- When spawning subagents via the Agent tool, ALWAYS set `model: "opus"`. Never use sonnet, haiku, or fable for subagents.
- Exception: `subagent_type: "fork"` ignores model overrides (it inherits the parent model) — avoid forks when a model choice matters; prefer a fresh agent with `model: "opus"`.
