const endpoint = process.env.GENTLEDAY_CDP ?? 'http://127.0.0.1:9222'
const targets = await fetch(`${endpoint}/json/list`).then(response => response.json())
const target = targets.find(item => item.type === 'page' && (
  item.title.includes('Gentleday') || item.url.includes('localhost:5173')
))
if (!target) throw new Error(`Gentleday renderer target was not found: ${JSON.stringify(targets)}`)

const socket = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true })
  socket.addEventListener('error', reject, { once: true })
})

let nextId = 0
const pending = new Map()
socket.addEventListener('message', event => {
  const message = JSON.parse(event.data)
  if (!message.id) return
  const callback = pending.get(message.id)
  if (!callback) return
  pending.delete(message.id)
  message.error ? callback.reject(new Error(message.error.message)) : callback.resolve(message.result)
})

function request(method, params = {}) {
  const id = ++nextId
  socket.send(JSON.stringify({ id, method, params }))
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }))
}

async function evaluate(expression) {
  const result = await request('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
    userGesture: true
  })
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text)
  }
  return result.result.value
}

const wait = ms => new Promise(resolve => setTimeout(resolve, ms))

async function waitFor(expression, timeoutMs = 5000) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    if (await evaluate(expression)) return
    await wait(50)
  }
  throw new Error(`Timed out waiting for: ${expression}`)
}

async function clickText(text, root = 'document') {
  const found = await evaluate(`(() => {
    const root = ${root};
    const button = [...root.querySelectorAll('button')].find(item => item.textContent.trim() === ${JSON.stringify(text)});
    if (!button) return false;
    button.click();
    return true;
  })()`)
  if (!found) throw new Error(`Button not found: ${text}`)
}

async function setValue(selectorExpression, value, prototypeName = 'HTMLInputElement') {
  const changed = await evaluate(`(() => {
    const element = ${selectorExpression};
    if (!element) return false;
    const setter = Object.getOwnPropertyDescriptor(${prototypeName}.prototype, 'value').set;
    setter.call(element, ${JSON.stringify(value)});
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`)
  if (!changed) throw new Error(`Input not found: ${selectorExpression}`)
}

async function createTask(title, area, recurrence = 'daily') {
  await clickText('＋ Add task')
  await waitFor("Boolean(document.querySelector('.task-dialog'))")
  await setValue("document.querySelector('.task-dialog input[placeholder*=\"morning medication\"]')", title)
  await setValue("[...document.querySelectorAll('.task-dialog select')].find(item => [...item.options].some(option => option.text === 'Health'))", area, 'HTMLSelectElement')
  await setValue("[...document.querySelectorAll('.task-dialog select')].find(item => [...item.options].some(option => option.text === 'Every day'))", recurrence, 'HTMLSelectElement')
  await clickText('Add task', "document.querySelector('.task-dialog')")
  await waitFor(`document.body.innerText.includes(${JSON.stringify(title)})`)
}

await waitFor("Boolean(window.gentleday && document.querySelector('.app-shell'))")
if (process.env.SYNC_ONLY === '1') {
  const vaultPath = process.env.VAULT_PATH
  if (!vaultPath) throw new Error('VAULT_PATH is required with SYNC_ONLY=1')
  await evaluate(`(async () => {
    const state = await window.gentleday.loadState();
    state.settings.vaultPath = ${JSON.stringify(process.env.VAULT_PATH)};
    await window.gentleday.saveState(state);
    location.reload();
    return true;
  })()`)
  await waitFor(`window.gentleday.loadState().then(state =>
    state.settings.vaultPath === ${JSON.stringify(process.env.VAULT_PATH)} &&
    state.outbox.every(event => Boolean(event.deliveredAt))
  )`, 15000)
  const synced = await evaluate('window.gentleday.loadState()')
  console.log(JSON.stringify({
    vaultPath: synced.settings.vaultPath,
    deliveredEvents: synced.outbox.filter(event => event.deliveredAt).length,
    pendingEvents: synced.outbox.filter(event => !event.deliveredAt).length
  }, null, 2))
  socket.close()
  process.exit(0)
}
if (process.env.RESET_STATE === '1') {
  await evaluate(`window.gentleday.saveState({
    version: 1,
    tasks: [],
    sessions: [],
    outbox: [],
    deletedSeriesIds: [],
    settings: {
      lifeAreas: ['Health', 'Learning', 'Creative', 'Movement', 'Coursework'],
      focusMinutes: 25,
      shortBreakMinutes: 5,
      longBreakMinutes: 15,
      streaksEnabled: true,
      reducedMotion: false
    }
  })`)
  await evaluate('location.reload()')
  await waitFor("Boolean(window.gentleday && document.querySelector('.app-shell'))")
}
await createTask('Take morning medication', 'Health')
await createTask('Take zinc, magnesium, and vitamin D', 'Health')
await createTask('30 minutes of Mandarin lessons', 'Learning')
await createTask('20 minutes of drawing practice', 'Creative')

await evaluate(`(() => {
  const button = document.querySelector('button[aria-label="Complete Take morning medication"]');
  button.click();
})()`)
await waitFor("Boolean(document.querySelector('button[aria-label=\"Reopen Take morning medication\"]'))")
await evaluate("document.querySelector('button[aria-label=\"Reopen Take morning medication\"]').click()")
await waitFor("Boolean(document.querySelector('button[aria-label=\"Complete Take morning medication\"]'))")
await evaluate("document.querySelector('button[aria-label=\"Complete Take morning medication\"]').click()")

await evaluate(`(() => {
  const button = document.querySelector('button[aria-label="Edit 20 minutes of drawing practice"]');
  button.click();
})()`)
await waitFor("Boolean(document.querySelector('.task-dialog'))")
await setValue("document.querySelector('.task-dialog input[placeholder*=\"morning medication\"]')", '20 minutes of drawing practice (sketchbook)')
await clickText('Save changes', "document.querySelector('.task-dialog')")
await waitFor("document.body.innerText.includes('sketchbook')")

await createTask('Temporary verification task', 'Coursework', 'none')
await evaluate("window.confirm=()=>true")
await evaluate("document.querySelector('button[aria-label=\"Delete Temporary verification task\"]').click()")
await waitFor("!document.body.innerText.includes('Temporary verification task')")

await evaluate("document.querySelector('button[aria-label=\"Focus on 30 minutes of Mandarin lessons\"]').click()")
await clickText('Start focus')
await wait(1200)
await clickText('Pause')
await wait(1100)
await clickText('Resume')
await wait(1200)
await clickText('Complete')
await waitFor("window.gentleday.loadState().then(state => !Boolean(state.activeTimer))")

await evaluate("document.querySelector('button[aria-label=\"Focus on 20 minutes of drawing practice (sketchbook)\"]').click()")
await clickText('Start focus')
await wait(1100)
await clickText('Stop')
await waitFor("window.gentleday.loadState().then(state => !Boolean(state.activeTimer))")

await clickText('Short break')
await clickText('Start break')
await wait(1100)
await clickText('Complete')
await waitFor("window.gentleday.loadState().then(state => !Boolean(state.activeTimer))")

const state = await evaluate('window.gentleday.loadState()')
const summary = {
  tasks: state.tasks.length,
  completedTasks: state.tasks.filter(task => task.status === 'completed').length,
  sessions: state.sessions.map(session => ({
    kind: session.kind,
    status: session.status,
    activeSeconds: session.activeSeconds,
    pausedSeconds: session.pausedSeconds
  })),
  queuedEventTypes: state.outbox.filter(event => !event.deliveredAt).map(event => event.eventType)
}

console.log(JSON.stringify(summary, null, 2))
socket.close()
