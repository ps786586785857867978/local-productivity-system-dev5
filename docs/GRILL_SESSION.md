# Grill session — product decisions

**Session date:** 2026-09-27  
**Status:** synthesis awaiting user alignment

## Product objective

Build one offline macOS desktop application that combines personal task management and Pomodoro-style focus tracking. It should support the user’s real routines and coursework while keeping task capture simple, making progress visible, and writing an append-only activity history to a user-selected Obsidian vault.

## Intended user

The primary user is a student balancing coursework with recurring health, learning, creative, movement, and reading routines. They plan using a mixture of Today, deadlines, life areas, and priority rather than one rigid system.

## Agreed task behavior

- Create, view, edit, delete, complete, and reopen tasks.
- Store all application data locally and retain it after restart.
- Each task may have a life area, optional due date, and optional priority.
- Starting editable life areas: Health, Learning, Creative, Movement, and Coursework.
- Daily routines repeat automatically and reset at local midnight.
- Resetting creates a new daily occurrence without deleting the previous day’s completion event.
- Optional streaks count consecutive days completed.
- Missing a day resets a streak without punitive messaging.
- Deleting a recurring task asks whether to delete only today’s occurrence or the entire routine.
- Public screenshots and submission samples use neutral demo tasks rather than personal health routines.

## Agreed focus and break behavior

- Default durations: 25-minute focus, 5-minute short break, and 15-minute long break.
- Durations remain editable in Settings.
- A focus session links to an existing task or a short free-form activity.
- Controls: Start, Pause, Resume, Stop, and Complete.
- Paused time does not count toward actual focus duration.
- Pause keeps the current session resumable.
- Stop cancels the session and logs the active duration already completed.
- Reaching zero completes the session automatically.
- The user may complete early; the app records the actual active duration.
- If the app closes, it restores the running or paused session accurately from persisted timestamps and state.
- Phase completion sends a notification, but the user manually starts the next focus or break phase.
- Break events are retained in history but excluded from focus-task analytics.

## Distraction-control decision

- Ask for permission to support macOS Focus/Do Not Disturb where a supported user-authorized integration can be implemented.
- Always provide an in-app distraction-free focus mode as a fallback.
- Do not depend on undocumented or brittle macOS automation for the core timer.
- A technical spike must verify whether a Shortcut-based or other supported macOS integration is appropriate.

## Visual direction

- Use a dashboard with Today tasks beside the timer.
- Keep History and Settings as secondary screens.
- Provide visual progress and gentle gamification.
- Preferred reward direction: a calm growing scene or companion with optional streaks.
- Avoid points, punishment, noisy celebration, or childlike competitive mechanics.
- While paused, display a reassuring “Ready to continue?” state with a cute animation.
- Do not generate Wallace & Gromit imagery.
- Use only a user-supplied local/licensed animation; until one is provided, use a simple original text-and-motion fallback that does not imitate protected characters.

## Obsidian behavior

- The user selects a vault or folder through a macOS folder picker.
- Task and focus records use predictable folders and append-only Markdown event files.
- Every event contains local date, time, timezone, event type, status, and relevant task/session data.
- Task events include creation, edits, completion, reopening, and deletion.
- Focus events include starts, completions, and cancellations.
- Completed and cancelled focus events include actual active duration and linked task/activity.
- If the vault is unavailable, queue events locally and retry when it becomes available.
- Never silently overwrite a previous event.

## Proposed main flow

1. Open the app to the dashboard.
2. Review today’s recurring routines, due tasks, and prioritized tasks.
3. Create or select a task.
4. Start a focus session from the selected task or enter a short activity.
5. Enter distraction-free mode and optionally trigger a user-authorized macOS Focus integration.
6. Pause, resume, stop, complete early, or let the timer complete.
7. Review focus history, task history, streaks, and gentle visual progress.
8. Inspect the append-only Markdown history in Obsidian when desired.

## Edge cases resolved

- Midnight passes while the app is closed: generate the current day’s recurring occurrences on next launch while retaining prior history.
- Midnight passes while the app is open: roll routines into the new day without deleting old events.
- App closes during a timer: reconstruct state from timestamps and persisted pause intervals.
- Vault moves or disconnects: queue events and display a non-destructive warning until reconnected.
- A recurring task is deleted: confirm current occurrence versus complete series.
- A focus session ends early: Complete records it as completed with actual active time; Stop records it as cancelled with actual active time.
- Personal information in assessment material: use neutral demo content.

## Non-goals

- Cloud accounts or cloud synchronization
- Multi-user collaboration
- Full note editing or Evernote-style knowledge management
- Social focus rooms
- Reward currency or competitive leaderboards
- Aggressive application blocking
- Cross-platform support for the first submitted version
- Advanced project dependencies or enterprise reporting

## Open items before implementation

1. User alignment with this synthesis.
2. Select or supply an appropriately usable pause-state animation later; the fallback will work without it.
3. Run a small technical spike for supported macOS Focus integration.
4. Select the final framework and local database after comparing implementation risk.
