# statusline-band

A Claude Code mod that draws one row above the prompt: the working directory, the
model, and how full the context window is.

```
my-project   Opus 5   ██████░░░░ 61%
```

The bar takes its colour from the theme rather than from fixed ANSI codes, so it
tracks light and dark: `success` under 50%, `warning` from 50, `error` from 80.
An unread context window draws `--%`.

## Install

At the prompt of a terminal session:

```
/plugin install statusline-band --marketplace akstrek/statusline-band
```

Answer `y` to add the marketplace, then press Enter to take the user scope.

From a shell:

```
claude plugin install statusline-band --marketplace akstrek/statusline-band
```

In the desktop app, where `/plugin` does not run: click + next to the prompt box,
then Plugins, Add marketplace with `akstrek/statusline-band`, then Add plugin.

## What to expect

**The row is drawn around a turn, not continuously.** The `AbovePrompt` band is
not mounted on the desktop surface while the session sits idle, so the row
appears as a turn starts and goes when it ends. A clock invalidates `ui.render`
every two seconds, which keeps the figures current while the row is up; it cannot
conjure a site that is not mounted. If you want something that holds while idle,
a `Pane` persists — but the surface alone decides whether a pane is docked beside
the transcript or placed inline above the prompt, and the desktop app docks it.

**The terminal is left alone.** The hook passes on the `terminal` surface, on the
assumption that a terminal already has a `statusLine` command drawing the same
three figures. Delete `e.surface === 'terminal' ||` in `hooks/register.tsx` to
draw there too.

**A survey wins.** While a survey holds the band the mod stands down.

## How it works

One hooks module, `hooks/register.tsx`, with two hooks:

- `session.start` — starts the redraw clock, replacing any timer a hot reload left
  behind, and clears the status line.
- `ui.render` on `{ component: 'AbovePrompt' }` — draws the row.

Readings come from `$.session.cwd()`, `$.session.model()` and
`$.session.usage()`, cached for 1.5 seconds. `$.session.usage()` is called plain:
its `breakdown` option is what counts categories through the token-count API, and
the band does not need it, so the mod costs no usage. It holds no `$.state` and
writes nothing to disk.

## Development

```
claude plugin validate .
claude plugin test .
tsc -p .
```

Run it from a folder without installing: `claude --plugin-dir <this folder>`, or
name the folder in `CLAUDE_CODE_PLUGIN_DIRS`.
