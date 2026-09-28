# moonim

moonim is an offline macOS desktop application that combines personal task management, daily routines, focus/break tracking, local persistence, and append-only activity logging to a user-selected Obsidian vault.

The project was created for **3IXD Dev 5 — Assignment 1**. Its main design goal is calm, honest progress: interrupted sessions retain their real active time, unfinished one-off tasks remain visible, and missed routines are never framed as failure.

## Features

### Tasks

- Create, edit, complete, reopen, and delete tasks
- Optional life area, due date, and priority
- Daily recurring routines with local-midnight rollover
- Today view that retains unfinished one-off work
- Choice between deleting one recurring occurrence or an entire routine

### Focus and breaks

- Editable 25-minute focus, 5-minute short break, and 15-minute long break defaults
- Start, pause, resume, stop/cancel, complete early, or complete automatically at zero
- Paused time excluded from actual active duration
- Link focus to a task or enter a free-text activity
- Restore running and paused timers from persisted timestamps
- Separate, independently scrollable and clearable focus and rest history
- Native phase-completion notifications; the next phase starts manually

### Local and Obsidian persistence

- Versioned local JSON state with serialized atomic writes
- Local outbox for events that cannot yet reach the vault
- Native macOS folder picker; the main process owns the approved vault path
- Automatic 30-second retry plus a manual retry control
- Append-only, duplicate-resistant Markdown records
- Predictable daily files under:

```text
Gentleday/
├── Tasks/YYYY/MM/YYYY-MM-DD.md
├── Focus/YYYY/MM/YYYY-MM-DD.md
└── Breaks/YYYY/MM/YYYY-MM-DD.md
```

Each record includes a stable event ID, local date/time, ISO timestamp, timezone and UTC offset, event type, status, entity ID, and structured details.

### Interface and accessibility

- Today, History, and Settings screens
- Retro paper-and-olive visual direction based on the user-supplied interface reference
- User-supplied Gromit artwork in Today’s Growth and as the macOS application icon
- Optional completion-progress/growth display
- Reduced-motion setting and operating-system reduced-motion support
- Keyboard-visible focus indicators and text-labeled controls

## Security model

moonim keeps privileged behavior in the Electron main process.

- Chromium sandbox enabled
- Context isolation enabled
- Node integration disabled in the renderer
- Narrow preload API
- Trusted-origin IPC validation
- Content Security Policy and navigation/window-open guards
- Runtime validation for persisted state and vault events
- Canonical vault approval with filesystem identity and symlink/root-replacement checks
- Serialized state and vault writes
- Injection-safe Markdown detail rendering

## Requirements

- macOS on Apple Silicon for the packaged assignment build
- Node.js 24 and npm 11 are the verified development versions

The application has no runtime account, cloud, or network dependency.

## Install from a clone

```bash
git clone https://github.com/ps786586785857867978/local-productivity-system-dev5.git
cd local-productivity-system-dev5
npm ci
```

The repository is private, so the cloning account must have access.

## Run in development

```bash
npm run dev
```

## Test and verify

```bash
npm test
npm run typecheck
npm run build
npm audit
```

The verified implementation passes **33 tests across four files** and reports **0 dependency vulnerabilities**.

Detailed results and the acceptance matrix are in [`docs/testing/ACCEPTANCE_TESTS.md`](docs/testing/ACCEPTANCE_TESTS.md).

## Package for macOS

```bash
npm run dist:mac
```

Output:

```text
release/mac-arm64/moonim.app
```

The local assignment build is unsigned because no Apple Developer ID certificate is installed. It uses the user-supplied Gromit artwork as its custom icon. macOS may show a Gatekeeper warning when the bundle is copied to another machine.

## First use

1. Launch moonim.
2. Open **Settings**.
3. Select **Choose vault** and choose an Obsidian vault or another local folder.
4. Return to **Today** and add a task.
5. Link the task to a focus session or enter a short activity.
6. Open the generated Markdown records from the vault's `Gentleday` folder. This legacy folder name is intentionally preserved so existing append-only records remain continuous after the visible rebrand.

If the selected folder is temporarily unavailable, normal task and timer behavior continues. Events remain queued locally and retry automatically when the folder returns.

## Project documentation

- [`docs/PRD.md`](docs/PRD.md) — approved product requirements
- [`docs/GRILL_SESSION.md`](docs/GRILL_SESSION.md) — product decision interview
- [`docs/research/PRODUCT_RESEARCH.md`](docs/research/PRODUCT_RESEARCH.md) — cited comparison of six products
- [`docs/references/DESIGN_NOTES.md`](docs/references/DESIGN_NOTES.md) — design rationale
- [`docs/testing/ACCEPTANCE_TESTS.md`](docs/testing/ACCEPTANCE_TESTS.md) — verification evidence
- [`docs/FINAL_REPORT.md`](docs/FINAL_REPORT.md) — cited final report, AI-use statement, reflection, and limitations
- [`docs/project-log.md`](docs/project-log.md) — chronological Git-tracked record
- [`submission/Saule_3IXD_Dev5_PRD.PDF`](submission/Saule_3IXD_Dev5_PRD.PDF) — required PDF submission artifact
- [`submission/Saule_Pranculyte_3IXD_Dev5_Obsidiansample.md`](submission/Saule_Pranculyte_3IXD_Dev5_Obsidiansample.md) — required app-generated Obsidian sample

## Architecture

```text
src/main/       Electron lifecycle, state store, vault writer, validation, IPC
src/preload/    Context-isolated renderer bridge
src/renderer/   React interface and styles
src/shared/     Product state, timer model, vault formatting, and tests
scripts/        Real-Electron CDP QA flow
docs/           Research, PRD, design references, testing, and report material
```

## Privacy and offline behavior

Operational data remains on the local Mac and in the folder selected by the user. moonim does not create an account, contact a cloud service, or transmit task/history data. Personal examples used during development should be replaced with neutral content in public assessment material.

## Known limitations

- First-version target is macOS only.
- macOS Focus/Do Not Disturb integration is not included; the app provides an in-app distraction-free fallback.
- No cloud synchronization or collaboration.
- No code signing.
- Streak scoring was deferred; the current motivation feature is optional completion progress and a gentle growth scene.
