/**
 * DeepSeek Harness (DSH) Plugin: /btw Slash Command
 *
 * Implements ephemeral side-question capability inspired by Claude Code,
 * OMP (Oh My Pi / pi-coding-agent), and JCode.
 *
 * Key guarantees:
 * 1. Zero context pollution: Command input and output are logged as direct surface events
 *    (`command/run` and `command/done`), completely bypassing model turn history.
 * 2. Grounded in session context: Forks the active session's conversation history prefix
 *    (via `fork` in-process subagent provider) or runs in-process with parent scope.
 * 3. Non-interruptive: The main agent task state and trajectory remain intact.
 */

const name = "plugin-btw";
const inject = ["commands", "subagents"];

const USAGE = "Usage: /btw <question>";

const BTW_PERSONA = [
  "You are a fast, concise side-assistant responding to a /btw (by the way) question from the user while their main task is active.",
  "Answer the user's question directly, accurately, and tersely.",
  "You have access to inspection and search tools if needed, but do not make destructive modifications to the codebase.",
  "Your answer will be presented directly to the user as an ephemeral side response and will not derail the main session."
].join(" ");

/**
 * Register the `/btw` command into DSH's command registry.
 *
 * @param {import('@deepseek-ai/cordis').Context} ctx
 */
export function apply(ctx) {
  const handler = async (invocation) => {
    const question = invocation.rawInput.trim();
    if (!question) {
      return {
        kind: "error",
        text: USAGE
      };
    }

    // Determine subagent provider: prefer 'fork' for seeded context, fallback to 'spawn'
    const subagents = ctx.subagents;
    const provider = subagents?.getProvider?.("fork")
      ? "fork"
      : subagents?.getProvider?.("spawn")
        ? "spawn"
        : undefined;

    if (!provider) {
      return {
        kind: "error",
        text: "/btw: Subagent execution provider is unavailable."
      };
    }

    try {
      const run = await subagents.start(provider, {
        label: "btw",
        prompt: [{ type: "text", text: question }],
        parent: invocation.agent,
        signal: invocation.signal,
        persona: BTW_PERSONA,
        toolFilter: {
          deny: [
            "cordis_undefine",
            "cordis_stop",
            "cordis_run",
            "cordis_define",
            "write",
            "edit"
          ]
        }
      });

      const result = await run.result;
      await run.dispose().catch(() => {});

      const textBlocks = (result.output || [])
        .filter((block) => block && block.type === "text" && typeof block.text === "string")
        .map((block) => block.text);

      const answer = textBlocks.join("\n").trim();
      if (!answer) {
        return {
          kind: "error",
          text: result.diagnostic || "The BTW agent returned an empty response."
        };
      }

      return {
        kind: "success",
        text: answer
      };
    } catch (error) {
      if (invocation.signal?.aborted) {
        return {
          kind: "error",
          text: "BTW query was cancelled."
        };
      }
      return {
        kind: "error",
        text: `BTW query failed: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  };

  const registerBtw = (commandName) =>
    ctx.commands.register({
      name: commandName,
      description:
        "Ask a quick side question mid-session without derailing the main task or polluting conversation history",
      input: {
        hint: "<question>",
        attachments: false
      },
      handler
    });

  ctx.effect(() => {
    const disposeBtw = registerBtw("btw");
    const disposeSide = registerBtw("side"); // pi-btw compatible alias
    return () => {
      disposeBtw();
      disposeSide();
    };
  }, "dsh-plugin-btw: command registration");
}

export { name, inject };
export default { name, inject, apply };
