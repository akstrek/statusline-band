import type { EngineInterface, RenderElement, RenderInput, Register } from 'claude-code'

/** Cells in the fill bar. */
const BAR = 10
/** How long the cwd, model and context readings are reused, in milliseconds. */
const TTL = 1500
/**
 * How often the band is invalidated.
 *
 * A drawing is cached per input value, so without a clock the readings would
 * hold at whatever they were when the band's props last changed.
 */
const TICK = 2000

type Readings = { cwd: string; model: string; percent: number | null }

/** Stops the clock, so a reload replaces its timer instead of stacking one. */
let stopTick: (() => void) | null = null
let cache: Readings | null = null
let readAt = 0

/** Says what went wrong on the status line, which persists on every surface. */
function warn($: EngineInterface, line: string) {
  $.ui.status(`statusline-band: ${line}`)
}

/** The cwd, model and context fill, re-read at most every TTL milliseconds. */
async function readings($: EngineInterface) {
  const now = await $.clock.now()
  if (cache === null || now - readAt > TTL) {
    const [cwd, model, usage] = await Promise.all([
      $.session.cwd(),
      $.session.model(),
      $.session.usage(),
    ])
    cache = { cwd, model, percent: usage.context.percent ?? null }
    readAt = now
  }

  return cache
}

/** The band's row: where the session is, what it runs on, and how full it is. */
async function drawRow($: EngineInterface, e: RenderInput): Promise<RenderElement> {
  const { cwd, model, percent: raw } = await readings($)
  const percent = raw === null ? null : Math.round(raw)
  const filled = percent === null ? 0 : Math.min(BAR, Math.round((percent / 100) * BAR))
  const tone =
    percent === null ? 'subtle' : percent >= 80 ? 'error' : percent >= 50 ? 'warning' : 'success'
  const { Box, Text } = $.ui.resolve(e)

  return (
    <Box flexDirection="row" gap={1}>
      <Text color="text">{cwd.split(/[\\/]/).filter(Boolean).pop() ?? cwd}</Text>
      <Text dimColor>{model}</Text>
      <Text color={tone}>
        {'█'.repeat(filled)}
        {'░'.repeat(BAR - filled)} {percent === null ? '--' : percent}%
      </Text>
    </Box>
  )
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    // session.start runs again on every reload, so drop the previous timer first.
    try {
      stopTick?.()
      const timer = $.clock.every(TICK, () => $.ui.invalidate('ui.render'))
      stopTick = () => timer.cancel()
      // Take down any line an earlier start or reload left up.
      $.ui.status(undefined)
    } catch (err) {
      warn($, `clock failed: ${String(err).slice(0, 60)}`)
    }

    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    // statusline-command.sh already draws these three under the terminal prompt,
    // and a survey owns the band whenever it holds it.
    if (e.surface === 'terminal' || e.props.hasSurvey) {
      return next(e)
    }

    try {
      return await drawRow($, e)
    } catch (err) {
      warn($, `could not draw: ${String(err).slice(0, 80)}`)

      return next(e)
    }
  })
}
