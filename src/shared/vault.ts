import type { LogEvent } from './product'

function eventFolder(eventType: LogEvent['eventType']): 'Tasks' | 'Focus' | 'Breaks' {
  if (eventType.startsWith('task_')) return 'Tasks'
  if (eventType.startsWith('break_')) return 'Breaks'
  return 'Focus'
}

export function vaultRelativePath(event: LogEvent): string {
  const [year, month] = event.localDate.split('-')
  return `moonim/${eventFolder(event.eventType)}/${year}/${month}/${event.localDate}.md`
}

export function formatMarkdownEvent(event: LogEvent): string {
  const time = event.createdAt.includes('T') ? event.createdAt.split('T')[1].slice(0, 8) : event.createdAt
  const json = JSON.stringify(event.details, null, 2)
  // An indented block after a list renders as list text in Obsidian, so use a fence
  // longer than any backtick run in the content; titles can then never break out.
  const longestRun = Math.max(0, ...(json.match(/`+/g) ?? []).map(run => run.length))
  const fence = '`'.repeat(Math.max(3, longestRun + 1))
  const details = `${fence}json\n${json}\n${fence}`
  return [
    `## ${time} — ${event.eventType}`,
    '',
    `- Date: ${event.localDate}`,
    `- Time: ${time}`,
    `- Timestamp: ${event.createdAt}`,
    `- Timezone: ${event.timezone} (UTC${event.offset})`,
    `- Event type: ${event.eventType}`,
    `- Status: ${event.status}`,
    `- Entity ID: ${event.entityId}`,
    `- Event ID: ${event.id}`,
    '',
    details,
    '',
    ''
  ].join('\n')
}
