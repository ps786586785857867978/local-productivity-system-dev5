# Project activity log

This is a chronological project record. Entries are append-only.

## 2026-09-24 13:57 CEST

### Event: project setup

- Status: completed
- GitHub account: `ps786586785857867978`
- Working folder: `/Users/saules/Documents/Dev5-Productivity-System`
- Planned repository: `local-productivity-system-dev5`
- Architecture direction: one combined application unless the Grill session finds a reason to split it.
- Required behavior: offline operation, local persistence, user-selected Obsidian vault, append-only event history.

### Event: user-provided research starting points

- Pomodoro/time-tracking references: Forest (`forestapp.cc`) and “PomoTimes” (exact product identity still to be verified).
- Task-management references: Todoist, Quire, and Evernote.
- Requirement from user: track project work in both Obsidian and GitHub.
- Personalization note: the final product must support tasks from the user's real life; personal workflow input will be requested before the Grill session and PRD are finalized.

## 2026-09-24 14:02 CEST

### Event: preliminary product research completed

- Status: completed_pending_user_confirmation
- Task products reviewed: Todoist, Quire, Evernote
- Focus products reviewed: Forest, PomoTime, Pomofocus
- Caveat: confirm whether the user's “PomoTimes” reference meant PomoTime.
- Research artifact: `docs/research/PRODUCT_RESEARCH.md`
- Citation ledger: `docs/research/sources.json`
- Citation verification: passed in strict mode
- Next checkpoint: collect the user's real-life task and focus workflow before the Grill session.

## 2026-09-24 14:10 CEST

### Event: personal workflow input collected — Grill round 1

- Status: completed
- Product reference confirmed: “PomoTimes” means PomoTime.
- Real-life routines include health/medication, language learning, drawing practice, walking, reading, and self-entered coursework deadlines.
- Planning preference: combine Today, deadlines, life areas, and priority.
- Focus preference: visual progress and gentle gamification.
- Interruption preference: pausing should enter a reassuring “ready to continue” state with a cute existing animation.
- Asset constraint: do not generate a Wallace & Gromit image; only use a user-supplied or appropriately licensed existing asset. Keep copyrighted personal details out of any future public repository/report unless explicitly approved.
- Next step: continue the Grill decision tree before writing the final PRD.

## 2026-09-27 20:59 CEST

### Event: Grill decision tree synthesized

- Status: awaiting_user_alignment
- Artifact: `docs/GRILL_SESSION.md`
- Platform: macOS desktop
- Task model: Today plus editable life areas, optional due date and priority, daily recurring routines
- Focus model: editable 25/5/15 defaults, active-time accounting, resumable pause, cancelled Stop, early completion allowed
- Visual direction: dashboard, gentle growing scene/companion, optional streaks, non-punitive language
- Obsidian reliability: append-only events with a local retry queue if the vault is unavailable
- Privacy: neutral demo tasks in public assessment material
- Remaining decisions: user approval, pause asset later, macOS Focus technical spike, framework/database selection
