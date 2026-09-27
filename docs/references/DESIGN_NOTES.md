# Design reference notes

## Artifact 01 — Dashboard wireframe

**File:** `01-dashboard-wireframe.html`

This low-fidelity wireframe tested the combined dashboard layout before visual styling. It helped decide that:

- Today should be the default screen;
- tasks and the active timer should remain visible together;
- the selected task must stay visible above the timer;
- life areas belong in secondary navigation rather than every task row;
- progress should remain visually quieter than task and timer controls.

## Artifact 02 — Visual style study

**File:** `02-style-study.html`

This study compared three original visual directions:

1. **Sage Studio** — calm, tactile, and focused;
2. **Warm Paper** — personal and reflective;
3. **Night Orchard** — immersive and low-light.

The recommended primary direction is **Sage Studio** because it supports a calm desktop dashboard without looking clinical or overly game-like. Warm Paper may inform report/history surfaces. Night Orchard may inform an optional distraction-free focus state.

## Artifact 03 — Focus-state prototype

**File:** `03-focus-state-prototype.html`

This clickable prototype tests the major timer states:

- running focus;
- paused;
- short break;
- completed;
- vault unavailable.

It helped decide the wording and control hierarchy for each state. It also demonstrates that vault failures should appear as a non-blocking queued-event warning, and that the pause state can feel reassuring without using third-party character artwork.

## Shared visual principles

- Original design rather than copying Forest, Todoist, or other researched products
- Warm neutral surfaces with one muted botanical accent
- Strong timer numerals and clear text labels
- Gentle progress rather than points, currency, or punishment
- Minimal motion with reduced-motion support
- No generated or unlicensed Wallace & Gromit imagery

## Design quality self-audit

The artifacts were reviewed at desktop viewport sizes after browser rendering.

- **Dashboard wireframe:** 0/10 slop score. It is intentionally low fidelity, uses an Operate/Monitor composition, and avoids decorative styling.
- **Style study:** 0/10 slop score. Equal columns are appropriate because this is a Compare surface; the three options differ in visual posture rather than simple color swaps.
- **Focus-state prototype:** 0/10 slop score. It uses a Monitor/Operate composition, one purposeful accent, and no fake statistics or decorative feature tiles.

Annotations in the wireframe were repositioned after visual review so they do not cover task capture, selected-task context, timer controls, or progress.

## Design review checkpoint

Before production styling is finalized, review the three artifacts and confirm:

- Sage Studio as the primary direction;
- whether Night Orchard should become an optional focus-only theme;
- whether the dashboard density feels appropriate;
- whether the abstract pause companion is acceptable until a user-supplied licensed/local animation is available.
