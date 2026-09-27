import { describe, expect, it } from 'vitest'
import { formatMarkdownEvent, vaultRelativePath } from './vault'
import type { LogEvent } from './product'

const taskEvent: LogEvent = {
  id: 'event-1',
  createdAt: '2026-09-27T08:30:00.000+02:00',
  localDate: '2026-09-27',
  timezone: 'Europe/Brussels',
  offset: '+02:00',
  eventType: 'task_completed',
  status: 'completed',
  entityId: 'task-1',
  details: { task: { title: 'Take morning medication', lifeArea: 'Health' } }
}

describe('Obsidian event seam', () => {
  it('routes task, focus, and break events to predictable daily Markdown files', () => {
    expect(vaultRelativePath(taskEvent)).toBe('Gentleday/Tasks/2026/09/2026-09-27.md')
    expect(vaultRelativePath({ ...taskEvent, eventType: 'focus_completed' })).toBe(
      'Gentleday/Focus/2026/09/2026-09-27.md'
    )
    expect(vaultRelativePath({ ...taskEvent, eventType: 'break_completed' })).toBe(
      'Gentleday/Breaks/2026/09/2026-09-27.md'
    )
  })

  it('formats every required field as a standalone append-only record', () => {
    const markdown = formatMarkdownEvent(taskEvent)
    expect(markdown).toContain('## 08:30:00 — task_completed')
    expect(markdown).toContain('- Date: 2026-09-27')
    expect(markdown).toContain('- Timestamp: 2026-09-27T08:30:00.000+02:00')
    expect(markdown).toContain('- Timezone: Europe/Brussels (UTC+02:00)')
    expect(markdown).toContain('- Status: completed')
    expect(markdown).toContain('- Entity ID: task-1')
    expect(markdown).toContain('Take morning medication')
    expect(markdown.endsWith('\n\n')).toBe(true)
  })

  it('renders details as an indented JSON block that cannot terminate a Markdown fence', () => {
    const markdown = formatMarkdownEvent({
      ...taskEvent,
      details: { note: '```\n## injected heading\n- Event ID: forged' }
    })

    expect(markdown).not.toContain('\n```')
    expect(markdown).toContain('    {\n      "note": "```\\n## injected heading\\n- Event ID: forged"\n    }')
  })
})
