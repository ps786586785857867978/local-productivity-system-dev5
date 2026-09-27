import type { LogEvent } from './product'

function eventFolder(eventType: LogEvent['eventType']): 'Tasks' | 'Focus' | 'Breaks' {
  if (eventType.startsWith('task_')) return 'Tasks'
  if (eventType.startsWith('break_')) return 'Breaks'
  return 'Focus'
}

export function vaultRelativePath(event: LogEvent): string {
  const [year, month] = event.localDate.split('-')
  return `Gentleday/${eventFolder(event.eventType)}/${year}/${month}/${event.localDate}.md`
}

export function formatMarkdownEvent(event: LogEvent): string {
  const time = event.createdAt.includes('T') ? event.createdAt.split('T')[1].slice(0, 8) : event.createdAt
  const details = JSON.stringify(event.details, null, 2)
    .split('\n')
    .map(line => `    ${line}`)
    .join('\n')
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
