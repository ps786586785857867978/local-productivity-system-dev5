# moonim acceptance and verification record

**Verification date:** 2026-09-28
**Previous clean-clone baseline:** `2e0e0b6feaf2dcd66e9cd4a66f6a6de9efa7243e` (30-test Gentleday revision)
**Current moonim suite:** 33 tests plus revised packaging and design artifacts
**Platform:** macOS on Apple Silicon
**Current result:** Local and independent verification passed; moonim clean-clone verification pending its commit

## Automated verification

| Check | Result | Evidence |
|---|---:|---|
| Dependency install from lockfile | Pass | Existing lockfile install baseline plus current `npm audit`; 0 vulnerabilities |
| Unit and storage tests | Pass | 33 tests across 4 files |
| Type safety | Pass | `npm run typecheck` |
| Production build | Pass | `npm run build` |
| macOS package | Pass | `npm run dist:mac`; `release/mac-arm64/moonim.app` created with custom icon |
| Source hygiene | Pass | `git diff --check`; independent moonim code/security and requirement/visual reviews passed |
| Clean-clone revision | Pending | To be run after the moonim revision is committed and pushed |

## Acceptance matrix

| ID | Acceptance behavior | Verification | Result |
|---:|---|---|---:|
| 1 | Create a task and queue `task_created` | Product tests and Electron QA | Pass |
| 2 | Edit a task and retain the change | Product tests, Electron QA, persisted-state reload | Pass |
| 3 | Complete a task and queue `task_completed` | Product tests and Electron QA | Pass |
| 4 | Reopen a task and queue `task_reopened` | Product tests and Electron QA | Pass |
| 5 | Delete without removing historical events | Product tests and Electron QA | Pass |
| 6 | Create one daily occurrence after local midnight | Recurrence tests and renderer rollover implementation | Pass |
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
| 26 | Cover state, timer, vault, persistence, validation, path safety, migration, and independent history clearing | 33 automated tests | Pass |
| 27 | Complete the main macOS flow | Development and packaged Electron QA | Pass |
| 28 | Install, test, build, package, and relaunch from a clean clone | Clean-clone verification | Pending for the moonim commit |
| 29 | Keep assessment screenshots and final sample privacy-safe | Reviewed design artifacts and neutral final submission sample | Pass |
| 30 | Use records produced by the actual app | Real files written through Electron IPC to the selected vault | Pass |

## Clean-clone baseline and pending moonim verification

The private GitHub repository was previously cloned into a new scratch directory at commit `2e0e0b6…`. At that Gentleday revision, the suite contained 30 tests and both named submission artifacts. The following commands completed successfully:

```bash
npm ci
npm test
npm run typecheck
npm run build
npm run dist:mac
```

The clean-clone packaged application was then launched with a fresh user-data directory and driven through the real preload/main-process boundary. It created five task records and three sessions: one completed focus session, one cancelled focus session, and one completed short break. Because no vault was selected in this fresh profile, all 16 generated events remained safely queued.

The packaged application was terminated and relaunched with the same user-data directory. The restored state contained five tasks, three sessions, 16 queued events, and no active timer, confirming process-restart persistence. The same real Electron QA flow now passes locally against the packaged moonim revision; a new clean-clone run will replace this baseline after commit.

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

On 28 September 2026, the staged moonim revision received a fresh fail-closed code/security review and a separate requirement/visual/documentation review. After the first review cycle identified profile migration, asset tracking, icon treatment, responsive layout, and documentation-attribution issues, the corrected staged tree passed both final reviews. The final code/security review reported no security concerns or logic errors. The final requirement/visual review reported no missing requirements, visual or usability errors, or documentation errors.

## Packaging notes

- The submitted bundle is unsigned because no Apple Developer ID certificate is installed.
- Electron Builder packages the user-supplied Gromit image as the application icon.
- macOS may therefore show a Gatekeeper warning on another machine; development and local assessment builds remain functional.
