import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

const BAND = {
  plugin: 'statusline-band',
  component: 'AbovePrompt',
  requestId: 'statusline-band',
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 10,
    bodyColumns: 80,
    scroll: { offset: 0, bodyRows: 10 },
    view: {},
  },
} as const

const START = { cwd: '/work/demo-project', surface: 'desktop', isInteractive: true } as const

/** The mod's own TICK, so a test advances the clock past a real tick. */
const TICK_MS = 2000
/** The mod's own BAR: the number of cells in the fill bar. */
const BAR = 10

/** Stands for the engine beneath the mod; hands back the clock the test drives. */
const seat = (on: On, percent?: number) => {
  const clock = mock.clock(on)
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.cwd', () => ({ value: '/work/demo-project' }))
  on('session.model', () => ({ value: 'Opus 5' }))
  on('session.usage', () => ({
    value: { startedAt: 0, context: { window: 200000, percent }, rateLimits: [] },
  }))

  return clock
}

test('the band draws the three readings above the prompt', async ($, on) => {
  seat(on, 61)
  await $.session.start(START)

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })

  expect((await ui.find({ type: 'Text', text: /demo-project/ }))?.text).toBe('demo-project')
  expect(await ui.find({ type: 'Text', text: /Opus 5/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /61%/ })).toBeDefined()
  await ui.unmount()
})

test('the band holds no button and presses nothing', async ($, on) => {
  seat(on, 84)
  let compacted = 0
  on('session.compact', () => {
    compacted += 1

    return { messages: [{ role: 'user', text: 'summary', toolUses: [] }] }
  })
  // The mod hooks turn.complete no longer, so the test stands in for the engine.
  on('turn.complete', (_, e) => ({ text: e.answer }))
  await $.session.start(START)

  for (const isWorking of [false, true]) {
    const ui = await $.ui.mount({
      ...BAND,
      surface: 'desktop',
      requestId: `working-${isWorking}`,
      props: { ...BAND.props, isWorking },
    })

    expect(await ui.find({ type: 'Button' })).toBeUndefined()
    expect(await ui.find({ key: 'compact' })).toBeUndefined()
    await ui.unmount()
  }

  // Nothing in the mod compacts any more, idle or working.
  await $.turn.complete({
    answer: 'done',
    durationMs: 10,
    isAborted: false,
    turnId: 't1',
    reason: 'answer',
  })
  expect(compacted).toBe(0)
})

test('the terminal is left to statusline-command.sh', async ($, on) => {
  seat(on, 61)
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>engine</Text>
  })
  await $.session.start({ ...START, surface: 'terminal' })

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })

  // The mod passed, so what draws is the engine's, not a row of its own.
  expect((await ui.find({ type: 'Text', text: /engine/ }))?.text).toBe('engine')
  await ui.unmount()
})

test('a survey keeps the band, and the mod yields', async ($, on) => {
  seat(on, 61)
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>survey</Text>
  })
  await $.session.start(START)

  const ui = await $.ui.mount({
    ...BAND,
    surface: 'desktop',
    props: { ...BAND.props, hasSurvey: true },
  })

  expect(await ui.find({ type: 'Text', text: /demo-project/ })).toBeUndefined()
  await ui.unmount()
})

test('the bar fills in step with the reading', async ($, on) => {
  let percent = 0
  const clock = mock.clock(on)
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.cwd', () => ({ value: '/work/demo-project' }))
  on('session.model', () => ({ value: 'Opus 5' }))
  on('session.usage', () => ({
    value: { startedAt: 0, context: { window: 200000, percent }, rateLimits: [] },
  }))
  await $.session.start(START)

  for (const [reading, cells] of [
    [0, 0],
    [50, 5],
    [99, 10],
  ] as const) {
    percent = reading
    // Past the reading cache, so the row is drawn from the new figure.
    await clock.advance(TICK_MS)

    const ui = await $.ui.mount({ ...BAND, surface: 'desktop', requestId: `fill-${reading}` })
    const bar = await ui.find({ type: 'Text', text: new RegExp(`${reading}%`) })

    expect(bar?.text).toContain('█'.repeat(cells) + '░'.repeat(BAR - cells))
    await ui.unmount()
  }
})

test('a clock keeps the readings fresh rather than cached', async ($, on) => {
  const clock = seat(on, 61)
  const invalidated: string[] = []
  on('ui.invalidate', (_, e) => {
    invalidated.push(e.event)

    return { value: undefined }
  })
  await $.session.start(START)

  expect(invalidated).toEqual([])

  await clock.advance(TICK_MS * 3)

  expect(invalidated.length).toBeGreaterThan(0)
  expect(invalidated.every(event => event === 'ui.render')).toBe(true)
})

test('an unread context window draws --%', async ($, on) => {
  seat(on, undefined)
  await $.session.start(START)

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })

  expect(await ui.find({ type: 'Text', text: /--%/ })).toBeDefined()
  await ui.unmount()
})
