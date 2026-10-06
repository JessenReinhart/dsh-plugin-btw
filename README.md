# dsh-plugin-btw

A DeepSeek Harness (DSH) plugin that adds a **`/btw`** slash command — a quick side-question channel you can use mid-session, modelled after the `/btw` feature in **Claude Code**, **OMP** (`oh-my-pi` / `pi-coding-agent`), and **JCode**.

## What it does

`/btw <question>` runs an **isolated side-agent** to answer your question, then surfaces the answer as a compact command-result card. It never derails the active task and never writes the exchange into the main conversation's model context.

```
/btw what does the useDebounce hook in src/hooks do?
/btw where is the JWT secret configured?
/side is this failing test related to my last change?
```

## How it stays out of the main thread

- The side question is executed by a **subagent** (`ctx.subagents.start(...)`), not by the main agent's turn loop.
- DSH's command registry logs the invocation as direct surface events (`command/run`, `command/done`). These are **not** model-turn messages, so the side Q&A never becomes part of the main agent's future context window.
- The default `fork` provider seeds the child with the parent session's completed-turn history, so the answer is **grounded in your current work** (files, recent edits, decisions) without copying that history into the main transcript.
- The side-agent runs **read-only by default**: `write`, `edit`, and the `cordis_*` lifecycle tools are denied, so a "btw" can't silently mutate the working tree while your main task is running.

## Variants

The plugin registers two commands that share one handler:

| Command | Alias | Behaviour |
| --- | --- | --- |
| `/btw <question>` | — | Fork the session context, answer read-only |
| `/side <question>` | alias of `/btw` | Same as `/btw` (matches `pi-btw`'s `/side`) |

## Requirements (DSH host services)

- `commands` — human slash-command registry (`@deepseek-ai/dsh-commands`)
- `subagents` — subagent provider registry (`@deepseek-ai/dsh-subagent`)

The `fork` in-process provider (`@deepseek-ai/dsh-subagent-fork-in-process`) is preferred; the plugin falls back to `spawn` if only that is mounted. Both are part of the standard DSH host composition.

## Install into a DSH composition

1. Place this package under `node_modules/dsh-plugin-btw` (or link it).
2. Reference it in your `cordis.patch.yml` (or host composition):

   ```yaml
   - insert:
       - id: plugin-btw
         name: dsh-plugin-btw
   ```

3. Restart the host. Type `/btw` (or `/side`) in any session composer.

## Dynamic (Cordis) install

The same plugin can be mounted at runtime as a dynamic Cordis package via `cordis_define` + `cordis_run` with `inject: ['commands', 'subagents']` — no restart required. That is how it was validated in the session that produced this package.

## Notes / trade-offs

- The answer appears as a **command-result card** in the transcript (DSH logs every command execution). The card is compact; the underlying side-agent conversation stays in its own ephemeral session and is not projected into the main agent's context. A true floating overlay (as in Claude Code) would require a Client-half UI rendered into the `shell.overlay` slot plus command-node suppression, which needs client-package approval and is out of scope for this host-only build.
- If your deployment mounts no subagent provider, `/btw` returns a clear error instead of failing silently.
