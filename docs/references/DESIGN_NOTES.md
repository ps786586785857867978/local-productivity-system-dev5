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

The initial recommended direction was **Sage Studio** because it supported a calm desktop dashboard without looking clinical or overly game-like. That direction informed the first verified implementation and is retained here as process evidence. It was later superseded by the final moonim redesign described below.

## Artifact 03 — Focus-state prototype

**File:** `03-focus-state-prototype.html`

This clickable prototype tests the major timer states:

- running focus;
- paused;
- short break;
- completed;
- vault unavailable.

It helped decide the wording and control hierarchy for each state. It also demonstrates that vault failures should appear as a non-blocking queued-event warning.

## Final moonim redesign — 28 September 2026

After the first verified release, the user supplied a new interface reference and a local Gromit image. The final renderer therefore uses:

- lowercase `moonim` product identity;
- olive navigation, warm paper surfaces, graph-paper texture, outlined panels, and typewriter-style typography;
- the exact heading `Take matters into your own hands`;
- no tagline beneath the product name;
- a more spacious focus-description and Start focus layout;
- independently scrollable and clearable Focus and Rest history;
- the supplied Gromit scene in Today’s Growth;
- a padded, Gromit-centred crop for the macOS application icon.

The final dashboard evidence is `moonim-dashboard.png`. The visible rebrand does not rename the established `Gentleday/` Obsidian folder because preserving one continuous append-only history is more important than changing an internal storage label.

## Shared visual principles

- Original layout and styling rather than copying Forest, Todoist, or other researched products
- Warm neutral surfaces with one muted botanical accent
- Strong timer numerals and clear text labels
- Gentle progress rather than points, currency, or punishment
- Minimal motion with reduced-motion support
- No generated character imagery; the final Gromit asset was supplied by the user for the local coursework application

## Design quality self-audit

The artifacts were reviewed at desktop viewport sizes after browser rendering.

- **Dashboard wireframe:** 0/10 slop score. It is intentionally low fidelity, uses an Operate/Monitor composition, and avoids decorative styling.
- **Style study:** 0/10 slop score. Equal columns are appropriate because this is a Compare surface; the three options differ in visual posture rather than simple color swaps.
- **Focus-state prototype:** 0/10 slop score. It uses a Monitor/Operate composition, one purposeful accent, and no fake statistics or decorative feature tiles.

Annotations in the wireframe were repositioned after visual review so they do not cover task capture, selected-task context, timer controls, or progress.

## Design review outcome

The initial three references were approved before implementation. The later moonim reference superseded their production styling while preserving the validated task/timer hierarchy, quiet-mode option, non-punitive feedback, reduced-motion support, and offline behavior.
