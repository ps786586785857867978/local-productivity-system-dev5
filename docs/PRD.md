# moonim — Product Requirements Document

**Version:** 1.0
**Date:** 2026-09-28
**Status:** Approved, implemented, independently reviewed, and clean-clone verified at `7fd6346fa2bc1769b5a2a651b5a565ca3a8c0e4d`

## Product name and purpose

**moonim** is a local macOS productivity application that combines personal task management with Pomodoro-style focus tracking. It helps one student manage recurring life routines and coursework, focus on one concrete activity at a time, and maintain a trustworthy append-only record in Obsidian.

The approved product name is **moonim**.

## Intended user and problem

The primary user balances coursework with health, learning, creative, movement, and reading routines. Existing tools often separate tasks from focus sessions, add unnecessary collaboration or cloud features, or treat interrupted Pomodoros as failures.

The user needs one calm offline tool that:

- makes daily routines and deadlines visible together;
- connects focused time to a real task or activity;
- handles interruptions honestly;
- preserves progress without punitive language;
- writes readable Markdown history to their own Obsidian vault.

## Product principles

1. **Local first:** core behavior works without an account or internet connection.
2. **Low-friction capture:** a useful task requires only a title; metadata remains optional.
3. **Honest history:** completed, cancelled, paused, and partial work are represented accurately.
4. **Gentle progress:** visual feedback encourages continuation without punishment or competition.
5. **User-owned records:** the Obsidian vault is readable, predictable, and append-only.
6. **Recoverable state:** app restarts and temporarily missing folders do not silently lose work.

## Core features

### Task management

- Create, view, edit, and delete tasks.
- Complete and reopen tasks.
- Persist tasks after closing and reopening the application.
- Optional life area, due date, scheduled time, task-specific focus duration, and priority.
- Editable starting life areas: Health, Learning, Creative, Movement, Coursework.
- Today dashboard combining daily routines, due work, and prioritized work.
- Use a clearly labeled dropdown to switch the task field between Today, This week, This month, and a month calendar without losing task edit/delete access.
- Keep active undated one-off tasks visible in week/month lists and in a dedicated Unscheduled calendar tray rather than assigning them to an old creation date.
- Today includes current and overdue unfinished work but excludes future occurrences, which remain manageable through the broader views.
- Daily recurring routines that reset at local midnight.
- Weekly recurring routines that return on the same weekday.
- A selected due date becomes the first occurrence date for a recurring routine, and future occurrence dates advance with the cadence.
- Previous occurrences and events remain preserved.
- Deleting a recurring item asks whether to remove today’s occurrence or the complete routine.

### Focus and break tracking

- Start, pause, resume, stop, and complete focus sessions.
- Start and complete short or long breaks.
- Editable default durations: 25-minute focus, 5-minute short break, 15-minute long break.
- Link a focus session to an existing task or a short free-form activity.
- When a linked task has an optional focus duration, use it for that timer instead of the global focus default.
- Exclude paused time from actual focus duration.
- Stop marks a session cancelled and retains active duration.
- Reaching zero completes a session automatically.
- Complete may finish a session early and records actual active duration.
- Restore running and paused sessions accurately after an application restart.
- Notify when a phase ends; require the user to manually begin the next phase.
- Retain break history while excluding breaks from task-focus analytics.

### History and progress

- Review completed and cancelled focus sessions.
- Review active focus duration, linked task/activity, date, and status.
- Show optional daily completion progress without points, penalties, or negative messaging.
- Use a calm growing scene or companion as gentle visual feedback.
- Keep all text and controls readable in both light and dark operating-system themes.

### Distraction control

- Provide an in-app distraction-free timer state.
- Offer an optional user-authorized macOS Focus integration only if a supported implementation is verified.
- Keep the timer fully functional when macOS Focus integration is unavailable or declined.

### Obsidian vault logging

- Let the user select a vault or folder with the macOS folder picker.
- Store the selected location locally and allow it to be changed.
- Write predictable append-only Markdown records.
- Queue events locally when the vault is unavailable and retry later.
- Display failed/pending synchronization clearly without blocking core task and timer actions.
- Never silently replace an earlier event.

## Custom features

### Life-area balance

Tasks may belong to an editable life area. History can summarize completed routines and focus time by life area without requiring enterprise project structures.

### Honest session history

Cancelled and early-completed sessions preserve actual active time. The app treats interruptions as information, not failure.

### Pause reassurance

Paused sessions show a calm “Ready to continue?” state. A simple original text-and-motion fallback ships with the app. A user-supplied appropriately usable local animation can replace it later; the project will not generate or bundle unauthorized Wallace & Gromit imagery.

### Gentle growth

Completing tasks and focus sessions subtly advances a small visual scene or companion. The feedback remains secondary to the task and timer controls and respects reduced-motion settings.

## Non-goals

- Cloud accounts or synchronization
- Team collaboration or task assignment
- Full note editing or knowledge-management features
- Social focus rooms
- Reward currencies, competitive leaderboards, or punitive streak messaging
- Aggressive application blocking
- Advanced task dependencies
- Enterprise workload reporting
- Windows or Linux support for the submitted first version
- Bundling unlicensed third-party character artwork

## Main user flow

1. On first launch, select an Obsidian vault or postpone configuration.
2. Open the dashboard and review Today tasks and routines.
3. Create a task or select an existing task.
4. Start a focus session linked to that task or enter a short activity.
5. Enter the distraction-free timer state.
6. Pause and resume when interrupted, stop to cancel, complete early, or let the timer finish.
7. Receive a phase-complete notification and manually start a break.
8. Return to the dashboard and see task completion and gentle visual progress.
9. Open History to review sessions.
10. Open Obsidian to inspect human-readable append-only records.

## Screen layout

### Dashboard

- Left: Today tasks with visible life-area, due-date, priority, and recurrence metadata.
- Center/right: selected task, focus timer, primary controls, and current focus state.
- Secondary: compact routine progress and gentle growth indicator.
- Fast task entry remains visible without dominating the screen.

### History

- Chronological focus-session and break lists.
- Clear completed/cancelled status, actual active duration, and linked task/activity.
- Lightweight totals for completed focus, focused minutes, and completed tasks.

### Settings

- Focus, short-break, and long-break durations.
- Life-area management.
- Obsidian vault location and pending-event status.
- In-app distraction-free mode.
- Motion and completion-progress preferences.

## Usability decisions

- Important controls use text labels as well as icons.
- Start, Pause, Resume, Stop, and Complete remain visually distinct.
- Destructive actions require confirmation when scope is ambiguous.
- Forms expose optional fields progressively.
- Keyboard-visible focus states and text-labeled controls support desktop use; dedicated shortcuts are deferred.
- Motion is subtle and disabled or reduced when macOS reduced-motion preferences request it.
- Empty, unavailable-vault, and restored-session states explain the next action plainly.
- No guilt-based copy appears after missed routines or cancelled focus sessions.

## Technical decisions

### Framework

Use **Electron with React and TypeScript**.

Reasons:

- the existing machine has a current Node/npm toolchain;
- Electron provides a reliable macOS folder picker, notifications, file-system access, and application lifecycle hooks;
- React supports rapid iteration on the dashboard and timer state UI;
- TypeScript makes timer, recurrence, persistence, and IPC contracts explicit;
- the project can be packaged as a macOS desktop application while remaining straightforward to run from a clean clone.

Keep privileged file-system and operating-system behavior in the Electron main process. Expose a narrow typed preload API to the renderer; do not enable unrestricted Node access in UI code.

### Local storage

Use a **versioned JSON persistence module with atomic writes** for application state, including the local Obsidian-delivery outbox.

The expected dataset is small and personal. A focused storage module owns validation, temporary-file writes, rename-based commits, invalid-state quarantine, and all reads/writes. UI components do not access files directly. The version field reserves space for future migrations; version 1 does not implement migrations or backup recovery.

Persist:

- tasks and recurrence definitions;
- generated daily occurrences;
- focus and break sessions;
- timer recovery state and timestamps;
- settings and life areas;
- selected vault bookmark/path metadata;
- queued Obsidian events and delivery status.

### Obsidian vault structure

The visible product was renamed after the original storage format was verified. The existing `Gentleday` root is intentionally retained as a compatibility boundary so the rebrand does not fragment or orphan append-only history.

```text
Gentleday/
├── Tasks/
│   └── YYYY/
│       └── MM/
│           └── YYYY-MM-DD.md
├── Focus/
│   └── YYYY/
│       └── MM/
│           └── YYYY-MM-DD.md
└── Breaks/
    └── YYYY/
        └── MM/
            └── YYYY-MM-DD.md
```

Each daily file is append-only. Every event is a separate Markdown section with a stable event ID.

Required common fields:

- event ID
- local date and time
- ISO timestamp
- timezone name and UTC offset
- event type
- status

Task fields include task ID, title, life area, due date, priority, recurrence information, and changed fields when relevant. Focus fields include session ID, linked task/activity, planned duration, actual active duration, paused duration, and completion/cancellation status.

### Timer model

Model the timer as explicit states rather than scattered booleans:

- `idle`
- `running_focus`
- `paused_focus`
- `running_break`
- `paused_break`
- `completed`
- `cancelled`

Persist monotonic session data and wall-clock timestamps needed for restart recovery. Calculate active duration from recorded running intervals so paused time is excluded.

### Obsidian delivery model

Every important app action first creates a local event. The outbox attempts to append that event to the appropriate Markdown file. Successful event IDs are marked delivered. Failed events remain queued and retry safely. Before appending, the writer checks for the event ID to make retries idempotent without overwriting existing content.

## Test seams and testing decisions

Prefer tests at the highest stable behavior seams:

1. **Product state service:** task lifecycle, recurrence, settings, and day rollover through one public API.
2. **Timer service:** state transitions, active-duration calculation, early completion, cancellation, and restart recovery.
3. **Vault event writer:** Markdown formatting, append-only behavior, idempotent retry, and missing-vault outbox handling.
4. **Desktop user flows:** a small set of end-to-end tests covering task CRUD, complete/reopen, focus lifecycle, settings, persistence after restart, and real vault output.

Tests assert visible behavior and written records rather than component internals.

## Testable acceptance criteria

### Tasks

1. Creating a task displays it immediately and writes a `task_created` event when a vault is configured.
2. Editing a task persists after restart and appends a `task_edited` event describing the change.
3. Completing a task removes it from active work, preserves it in history, and appends `task_completed`.
4. Reopening a completed task restores it to active work and appends `task_reopened`.
5. Deleting a task removes it from current app state and appends `task_deleted` without deleting older events.
6. A daily routine creates one current-day occurrence after local midnight without overwriting the previous day.
7. Deleting a recurring occurrence offers current occurrence versus entire series.

### Focus and breaks

8. Starting a focus session changes the state to running and appends `focus_started`.
9. Pausing freezes active-time accumulation and displays the pause reassurance state.
10. Resuming continues the same session without counting paused time.
11. Stopping marks the session cancelled, records actual active duration, and appends `focus_cancelled`.
12. Reaching zero marks the session completed and appends `focus_completed`.
13. Completing early records completed status and actual active duration.
14. Closing and reopening the app restores a running or paused session accurately.
15. Focus and break durations can be changed and remain changed after restart.
16. A focus session can link to a task or a free-form activity.
17. Completed and cancelled sessions appear in History with status, actual duration, and task/activity.
18. Breaks are retained in history but excluded from focus totals.

### Obsidian and offline behavior

19. The user can choose and change a vault folder.
20. Generated records contain date, time, timezone, event type, status, and relevant entity data.
21. Task and focus events are stored in predictable separate folders.
22. Repeating or retrying delivery never overwrites or duplicates a previously delivered event ID.
23. When the vault is missing, actions remain usable and events enter a visible local queue.
24. Reconnecting the vault delivers queued events and preserves their original timestamps.
25. With networking disabled, all core task, timer, persistence, history, and vault behavior continues to work.

### Quality and submission

26. Automated tests cover the main state, timer, and vault seams.
27. Manual testing verifies the complete acceptance flow on macOS.
28. A clean clone can install dependencies, run tests, and launch using README instructions.
29. Public screenshots and sample records use neutral demo tasks.
30. Submitted Obsidian sample records are generated by the actual application, not manually fabricated.

## Alternative considered but not chosen

### Native SwiftUI application

SwiftUI would provide a smaller native bundle and closer macOS integration. It was not selected because the machine currently has the Swift command-line toolchain but not a verified full Xcode application workflow, while the available Node/npm environment supports faster UI iteration, automated testing, and reproducible clean-clone setup for this assignment.

### Tauri

Tauri would produce a smaller application than Electron. It was not selected because the required Rust toolchain is not currently installed, and adding Rust plus plugin integration would increase setup and debugging risk without improving the assessed core behavior.

## Approved design artifacts

1. Dashboard wireframe — validates information hierarchy and combined task/timer layout.
2. Visual style study — validates palette, type, density, and gentle-gamification direction.
3. Focus-state interaction prototype — validates running, paused, break, completed, and unavailable-vault states.
