# moonim acceptance and verification record

**Verification date:** 2026-09-28
**Previous clean-clone baseline:** `2e0e0b6feaf2dcd66e9cd4a66f6a6de9efa7243e` (30-test Gentleday revision)
**Current moonim suite:** 47 tests plus revised packaging and design artifacts
**Platform:** macOS on Apple Silicon
**Current result:** Final feature commit `0b50406f7033e0bc1ad49d631fe1b781f0321386` passes clean-clone install, all 47 tests, typecheck, build, ARM64 packaging, dependency audit, packaged functional QA, forced-dark-OS light-default QA, explicit dark-theme QA, and independent review

## Automated verification

| Check | Result | Evidence |
|---|---:|---|
| Dependency install from lockfile | Pass | Existing lockfile install baseline plus current `npm audit`; 0 vulnerabilities |
| Unit, storage, and renderer tests | Pass | 47 tests across 5 files |
| Type safety | Pass | `npm run typecheck` |
| Production build | Pass | `npm run build` |
| macOS package | Pass | `npm run dist:mac`; `release/mac-arm64/moonim.app` created with custom icon |
| Source hygiene | Pass | `git diff --check`; final independent code/security and visual/accessibility re-reviews passed |
| Clean-clone revision | Pass | Exact feature commit `0b50406f7033e0bc1ad49d631fe1b781f0321386` |

## Acceptance matrix

| ID | Acceptance behavior | Verification | Result |
|---:|---|---|---:|
| 1 | Create a task and queue `task_created` | Product tests and Electron QA | Pass |
| 2 | Edit a task and retain the change | Product tests, Electron QA, persisted-state reload | Pass |
| 3 | Complete a task and queue `task_completed` | Product tests and Electron QA | Pass |
| 4 | Reopen a task and queue `task_reopened` | Product tests and Electron QA | Pass |
| 5 | Delete without removing historical events | Product tests and Electron QA | Pass |
| 6 | Create daily and weekly occurrences on their correct local dates | Recurrence tests and renderer rollover implementation | Pass |
| 6a | Save, validate, display, edit, and repeat an optional scheduled task time | Product/storage tests, task dialog inspection, and packaged Electron QA | Pass |
| 6b | Optionally use a task-specific focus duration while retaining the global default for other tasks | Product/storage tests and packaged Electron QA (`1500` default versus `1800` task-specific planned seconds) | Pass |
| 6c | Switch the task field among Today, This week, This month, and Calendar while keeping future work out of Today | Product view-filter tests and packaged renderer inspection | Pass |
| 6d | Keep all visible text and controls readable in light and dark themes | Explicit light/dark packaged screenshots and computed-style inspection | Pass |
| 6e | Select Today, This week, This month, or Calendar from a labeled dropdown and retain active undated work in broader views | Domain regression, packaged CDP interaction, and light/dark screenshots | Pass |
| 6f | Place the labeled task-range selector at the top of the task card instead of the superseded task heading | Renderer regression and packaged screenshot/DOM inspection | Pass |
| 6g | Open in the warm light theme by default while retaining an explicit, persisted dark-theme option | Product/storage/renderer tests and packaged QA launched with forced OS dark mode | Pass |
| 7 | Delete one occurrence or the full recurring series | Product tests and confirmation flow | Pass |
| 8 | Start focus and queue `focus_started` | Product tests and Electron QA | Pass |
| 9 | Pause without counting paused time | Timer tests and Electron QA | Pass |
| 10 | Resume the same focus session | Timer tests and Electron QA | Pass |
| 11 | Stop as cancelled and retain actual active time | Product tests and Electron QA | Pass |
| 12 | Complete automatically at zero | Timestamp timer seam and renderer completion effect | Pass |
| 13 | Complete early with actual active duration | Product tests and Electron QA | Pass |
| 14 | Restore running or paused timers from timestamps | Running/paused reconstruction tests and paused active-timer save/load test | Pass |
| 15 | Persist edited focus, short-break, and long-break defaults | Settings command test and atomic state-store reload of all three edited values | Pass |
| 16 | Link focus to a task or free-text activity | Product tests and Electron QA | Pass |
| 17 | Show completed/cancelled history with exact duration | Renderer history and Electron QA | Pass |
| 18 | Keep break records separate from focus totals | Product tests and renderer history | Pass |
| 18a | Clear Focus and Rest history independently without changing queued append-only events | Product tests and separate renderer controls | Pass |
| 18b | Preserve the previous packaged profile during the visible rebrand | Legacy-state migration tests; existing moonim state is never overwritten | Pass |
| 19 | Choose/change a vault through the main process | Native picker IPC with trusted-sender checks | Pass |
| 20 | Include date, time, ISO timestamp, timezone, type, status, IDs, and details | Vault-format tests | Pass |
| 21 | Route records to predictable Tasks, Focus, and Breaks folders | Vault path tests and real generated files | Pass |
| 22 | Retry idempotently without duplicate event IDs | Serialized append and duplicate-delivery tests | Pass |
| 23 | Continue offline and queue events if no vault is selected or a configured vault is unavailable | Packaged no-vault QA with 16 queued events; configured-vault outage storage test | Pass |
| 24 | Reconnect an unavailable configured vault automatically | Storage reconnection test | Pass |
| 25 | Keep core behavior independent of networking | No runtime network services; packaged offline QA | Pass |
| 26 | Cover state, timer, vault, persistence, validation, path safety, migration, recurrence, scheduling, task views, theme persistence, renderer layout, undated-task visibility, and independent history clearing | 47 automated tests | Pass |
| 27 | Complete the main macOS flow | Development and packaged Electron QA | Pass |
| 28 | Install, test, build, and package from a clean clone | Final feature commit `0b50406f7033e0bc1ad49d631fe1b781f0321386` plus earlier verified baselines | Pass |
| 29 | Keep assessment screenshots and final sample privacy-safe | Reviewed design artifacts and neutral final submission sample | Pass |
| 30 | Use records produced by the actual app | Real files written through Electron IPC to the selected vault | Pass |
| 31 | Include vault examples inside the PDF report as well as the separate Markdown sample | Three representative verbatim task/focus/break excerpts in `docs/FINAL_REPORT.md`; complete 16-event sample in `submission/Saule_Pranculyte_3IXD_Dev5_Obsidiansample.md` | Pass |
| 32 | Explain an alternative considered but rejected | Report explicitly rejects separate task/timer apps and explains why the combined architecture was selected; dark-first visual direction is also documented as a rejected default | Pass |
| 33 | Verify the submitted sample against original app output | All 16 submitted event IDs match the original isolated submission-vault task/focus/break files | Pass |

## Clean-clone verification

The private GitHub repository was previously cloned into a new scratch directory at commit `2e0e0b6…`. At that Gentleday revision, the suite contained 30 tests and both named submission artifacts. The following commands completed successfully:

```bash
npm ci
npm test
npm run typecheck
npm run build
npm run dist:mac
```

The clean-clone packaged application was then launched with a fresh user-data directory and driven through the real preload/main-process boundary. It created five task records and three sessions: one completed focus session, one cancelled focus session, and one completed short break. Because no vault was selected in this fresh profile, all 16 generated events remained safely queued.

The packaged application was terminated and relaunched with the same user-data directory. The restored state contained five tasks, three sessions, 16 queued events, and no active timer, confirming process-restart persistence.

The moonim artifact commit `d70cb4033cd5ff620784b766a6095368f8de6094` was then cloned into a separate scratch directory. That exact checkout passed `npm ci`, all 33 tests, TypeScript checking, the production build, ARM64 macOS packaging, `npm audit --audit-level=high`, and source-diff checks. The clean-clone packaged `moonim.app` passed the neutral real Electron QA flow. After quitting and relaunching that package with the same profile, the renderer/main-process boundary restored five tasks, one completed task, three sessions, 16 outbox events, and no active timer.

The current feature commit `ee3a7e48d26cadc22fa821b6025c8b1886149edd` was cloned into a new scratch directory. That exact checkout passed `npm ci`, all 43 tests, TypeScript checking, the production build, ARM64 packaging, `npm audit --audit-level=high`, and source-diff checks. Its packaged application passed the neutral Electron QA flow. After a normal quit and relaunch with the same isolated profile, it restored five tasks, one completed task, three sessions, 16 queued events, no active timer, and the weekly task’s `09:30` scheduled time and 30-minute focus duration.

The follow-up dropdown commit `7fd6346fa2bc1769b5a2a651b5a565ca3a8c0e4d` was cloned into another fresh directory. It passed `npm ci`, all 44 tests, TypeScript checking, the production build, ARM64 packaging, `npm audit --audit-level=high`, and source-diff checks. Its packaged renderer exposed Today, This week, This month, and Calendar in the labeled dropdown, showed three task rows in the week and month views, and rendered 42 calendar cells with dated task cards in both light and dark modes.

The final feature commit `0b50406f7033e0bc1ad49d631fe1b781f0321386` was cloned into a new scratch directory. It passed `npm ci`, all 47 tests across five files, TypeScript checking, the production build, ARM64 packaging, `npm audit --audit-level=high`, and source-diff checks. Its packaged app passed the neutral task/timer flow with five tasks, one completed task, three sessions, and 16 queued events. Launched with forced operating-system dark mode, the app still opened with `theme-light`, the task-range selector occupied the top of the task card, the superseded heading was absent, and the explicit Settings control successfully switched to `theme-dark`.

## Independent review

Earlier Gentleday review rounds identified and then verified fixes for:

- serialized atomic persistence;
- main-process vault ownership;
- temporary vault outage recovery;
- append idempotency and root/symlink protections;
- Electron sandbox, CSP, navigation, and origin controls;
- strict persisted-state and event validation;
- Markdown injection resistance;
- local-midnight recurrence and local-date metrics;
- exact duration display and retry behavior;
- functional progress and reduced-motion settings.

On 28 September 2026, the moonim redesign later committed as `d70cb4033cd5ff620784b766a6095368f8de6094` received a fresh fail-closed code/security review and a separate requirement/visual/documentation review. After the first review cycle identified profile migration, asset tracking, icon treatment, responsive layout, and documentation-attribution issues, the corrected redesign passed both final reviews. Those verdicts apply to the redesign baseline, not automatically to later revisions.

The current scheduling, task-view, icon, and theme revision was reviewed separately. Review rounds corrected explicit-profile migration during QA, task-view date semantics, calendar placement, daily-summary independence, recurring due-date persistence, and dark-mode contrast/focus visibility. The final fail-closed code/security and visual/accessibility re-reviews passed. Commit-specific clean-clone verification remains pending.

## Packaging notes

- The submitted bundle is unsigned because no Apple Developer ID certificate is installed.
- Electron Builder packages the newly supplied moonim reading image as the application icon; the user-supplied Gromit scene remains in Today’s Growth.
- macOS may therefore show a Gatekeeper warning on another machine; development and local assessment builds remain functional.
