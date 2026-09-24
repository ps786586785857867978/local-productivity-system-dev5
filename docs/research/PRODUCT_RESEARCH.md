# Product research — task management and Pomodoro tools

**Research date:** 2026-09-24  
**Status:** preliminary product research complete; personal workflow interview pending

## Scope and product selection

The task-management comparison uses the three products supplied by the user: Todoist, Quire, and Evernote. The focus comparison uses Forest, a likely match for the user’s “PomoTimes” reference called **PomoTime**, and Pomofocus as a third contrasting product. The user should confirm whether PomoTime is the intended “PomoTimes” product before the final report is locked.

## Task-management products

### 1. Todoist

Todoist centers its workflow on fast task capture, projects, sections, subtasks, priorities, labels, recurring dates, reminders, filtering, multiple views, and collaboration.[1]

**Essential ideas for this project**

- Quick task creation with a clear title
- Edit, delete, complete, and reopen actions
- A simple distinction between active and completed work
- Optional due date or priority when it helps the user decide what to do next

**Useful but not essential**

- Sections or lightweight categories
- Search and filtering
- Recurring tasks
- A compact “today” view

**Unnecessary for the first version**

- Team collaboration and assignment
- Large integration ecosystems
- Complex productivity scoring
- Advanced natural-language parsing

**Lesson:** task capture should be low-friction, while extra metadata should remain optional.

### 2. Quire

Quire emphasizes nested tasks and several representations of the same work, including list, board, timeline, calendar, personal task, and reporting views.[2]

**Essential ideas for this project**

- A readable task list with strong visual hierarchy
- Enough structure to understand what belongs together
- Clear status changes without navigating through many screens

**Useful but not essential**

- A board view
- Subtasks
- Calendar or timeline views
- Basic progress summaries

**Unnecessary for the first version**

- Deeply nested project trees
- Multiple enterprise planning views
- Team health and workload reporting
- Complex dependencies

**Lesson:** one underlying task model can support different useful views, but the assignment does not require building every view.

### 3. Evernote Tasks

Evernote places tasks inside notes while also collecting them into a central task view, allowing task work to retain surrounding notes and context.[3]

**Essential ideas for this project**

- A task may need a short description or context, not only a title
- The user should be able to connect a focus session to a task or a free-form activity
- Completed work should remain reviewable

**Useful but not essential**

- Notes attached to tasks
- Recurring due dates and reminders
- Flags or lightweight prioritization

**Unnecessary for the first version**

- A full note editor
- Document scanning and web clipping
- Large knowledge-management features
- Rebuilding an entire second-brain system inside the app

**Lesson:** task context matters, but Obsidian already provides the long-form knowledge layer, so the app should link or log context instead of becoming a note-taking suite.

## Pomodoro and time-tracking products

### 1. Forest

Forest turns uninterrupted focus into a growing virtual tree and discourages leaving the focus experience; it also includes focus statistics, allow lists, collaborative planting, rewards, and an environmental theme.[4]

**Essential ideas for this project**

- A focus session needs a clear start, pause, stop, and completion state
- The timer should make the current state obvious
- Completed sessions should create visible progress and history

**Useful but not essential**

- Gentle visual rewards
- Daily or weekly focus summaries
- A distraction warning before cancelling
- A small sense of growth or continuity

**Unnecessary for the first version**

- Social focus rooms
- Reward currencies
- Real-tree purchasing integrations
- Aggressive application blocking

**Lesson:** emotional feedback can make a timer feel meaningful, but the product should not punish the user for real-life interruptions.

### 2. PomoTime — tentative match for “PomoTimes”

The PomoTime listing describes a traditional Pomodoro timer with work and break cycles, visible cycle counts, notifications, and configurable appearance.[5]

**Essential ideas for this project**

- Configurable focus and break durations
- Clear alternation between focus and break modes
- Notifications when a phase finishes
- Simple session counts

**Useful but not essential**

- Theme controls
- Automatic progression to the next phase
- Long-break rules after several focus sessions

**Unnecessary for the first version**

- Heavy visual customization
- Many timer presets before the core workflow is proven

**Lesson:** conventional timer controls and clear phase changes are more important than decorative options.

### 3. Pomofocus

Pomofocus combines configurable focus and break timers with task selection, estimates, templates, reports, alarms, themes, and visual activity summaries.[6]

**Essential ideas for this project**

- Connect a timer to a specific task or short activity description
- Show completed sessions in a reviewable history
- Preserve the actual elapsed duration rather than only the planned duration

**Useful but not essential**

- Estimated focus sessions per task
- Daily and weekly reports
- Reusable timer settings
- A small progress indicator for the selected task

**Unnecessary for the first version**

- Account-based cloud sync
- Complex templates
- Extensive sound and theme libraries
- Subscription features

**Lesson:** the strongest connection between the two halves of the assignment is selecting a real task directly from the timer.

## Cross-product synthesis

### Essential feature set

1. Fast task creation, viewing, editing, deletion, completion, and reopening
2. Durable local task storage
3. Start, pause, stop/cancel, resume, and complete timer behavior
4. Configurable focus and break durations
5. A focus session linked to a task or free-form description
6. Reviewable completed and cancelled session history
7. Actual duration recorded for finished work
8. A user-selected Obsidian vault with predictable folders and append-only Markdown events
9. Date, time, timezone, event type, status, and relevant task/session details on every vault event
10. Clear offline behavior without requiring an account

### Useful features to consider after the core works

- Today view
- Priority or category
- Subtasks
- Recurring tasks
- Focus estimates per task
- Daily/weekly summaries
- Gentle visual progress
- Optional automatic break transition
- Search or filtering

### Features to avoid in the first version

- Collaboration and team assignment
- Cloud accounts and synchronization
- Full note editing
- Enterprise planning views
- Social focus rooms
- Punitive distraction blocking
- Reward currencies
- Large theme or integration marketplaces

## Early custom-feature directions

### 1. Life-area focus balance

Tasks may optionally belong to a small user-defined life area such as study, work, health, home, or personal. The app can summarize completed focus time by life area without turning the task form into a complex project-management system. The exact life areas must come from the user’s real routine.

### 2. Honest session history

The timer should preserve completed, cancelled, and partially completed sessions rather than treating only perfect Pomodoros as meaningful. Users publicly ask for timers that integrate directly with tasks and for tools that retain partial Pomodoros, suggesting that task connection and honest interruption history solve real workflow gaps.[7][8]

## Questions carried into the personal workflow interview

1. Which real-life areas should tasks cover?
2. Does the user plan mainly by day, priority, project, deadline, or energy?
3. Are subtasks important, or would they add friction?
4. Should paused time count toward actual duration?
5. What should happen when a focus session is interrupted?
6. Should a task show an estimated number of sessions?
7. Which visual reward feels motivating without feeling childish or punitive?
8. Which information should appear in Obsidian logs versus only inside the app?
9. Does the user want one dashboard or separate Task and Focus screens?
10. Which devices and operating systems need to run the app?

## Sources

[1] https://www.todoist.com/task-management
[2] https://quire.io/features
[3] https://help.evernote.com/hc/en-us/articles/1500003792141-Tasks-Overview
[4] https://www.forestapp.cc
[5] https://play.google.com/store/apps/details?id=pomotime.idealapps.ge
[6] https://pomofocus.io
[7] https://www.reddit.com/r/pomodoro/comments/1vgl5is/i_built_a_pomodoro_timer_thats_baked_into_a
[8] https://www.reddit.com/r/pomodoro/comments/1v3fio2/pomodoro_app_that_tracks_partial_pomodoros
