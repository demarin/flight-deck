# Flight Deck

A Claude Code plugin that changes how Claude talks to you while it works:

- **In flight** (while tools run): one or two telegraphic log lines per key step —
  `→ [DB] Connecting to replica…`, `✓ Build passed. Running migrations…` — and nothing else.
- **Atomic queries** (a commit message, a regex, one config value): the payload only, no wrapper.
- **Final turn**: a self-contained debrief you can read without scrolling back —
  objective, what was done, outcome, obstacles, decisions for you, side findings.

The full protocol is in [`skills/flight-deck/SKILL.md`](skills/flight-deck/SKILL.md).

**What installing it does.** The plugin changes Claude's behaviour in every session, on purpose:
a SessionStart hook adds the protocol to the context of each new session, and a UserPromptSubmit
hook adds a one-line reminder of the current mode to each of your messages. You can switch it off
per session or per shell (see below). It sends nothing anywhere; see
[What the hooks see and store](#what-the-hooks-see-and-store).

## Install

```text
/plugin marketplace add <git-url-or-owner/repo>
/plugin install flight-deck@flight-deck
```

Start a new session. The mode loads automatically ("Loading flight-deck mode..." at startup).

To try it without installing: `claude --plugin-dir /path/to/flight-deck`.

## Examples

**A fix that takes several steps** — `Fix the failing test in tests/test_parser.py`

While Claude works you see only short status lines:

```text
→ [tests] Running tests/test_parser.py: 1 failure in test_empty_input
→ [parser] parse() indexes tokens[0] before checking for empty input
✓ Guard added; 14/14 tests pass
```

The final message then stands on its own: the objective Claude set itself, what it changed and
why, the result, what got in the way, and any decision left to you.

**An atomic request** — `Write a commit message for the staged changes`

The reply is the commit message itself, with no "Here is…" around it.

**A value that lives in several places** — `Which AWS region does this project use?`

```text
• Shell (AWS_DEFAULT_REGION): eu-west-1
• ~/.aws/config [default]: us-east-1
• terraform/backend.tf: eu-west-1
```

**A diagnosis** — `Why does the upload fail with SignatureDoesNotMatch?`

The first sentence is the answer (for example, which header breaks the signature); the mechanics,
the fix and how to verify it follow.

## Switching it on and off

| Command | Effect |
|---|---|
| `/flight-deck off` | Off for this session. Claude is told to disregard the protocol from then on. |
| `/flight-deck on` | On again. If the protocol never reached this session, it is sent with your next message. |
| `/flight-deck status` (or bare `/flight-deck`) | Shows the current mode. |

The mode is kept **per session**: switching it off in one terminal leaves other sessions alone.
A resumed session keeps its mode. These commands are handled by a hook and cost no model turn.
Type the command alone on the line; `/flight-deck off and fix X` is not recognised as a switch.

To start every session in a shell with the mode off: `FLIGHT_DECK=off claude`.

## Output styles

An output style such as *Explanatory* asks for teaching asides while Claude works. Flight Deck
tells Claude to drop them in flight and keep only those that carry real value for the final
debrief. A plugin cannot switch your output style off; if asides still leak in, set the style to
Default in `/config`.

## How it works

| Piece | Role |
|---|---|
| `hooks/session-start.js` | SessionStart hook: prints the protocol, which Claude Code adds to the session's context. Re-injects it after compaction. |
| `hooks/prompt-submit.js` | UserPromptSubmit hook: handles `/flight-deck on\|off\|status`; adds a one-line reminder of the mode to every other prompt. |
| `hooks/lib/state.js` | Per-session state in `~/.claude/flight-deck/state/<session_id>.json`, pruned after 14 days. |
| `skills/flight-deck/SKILL.md` | The protocol — the one file to edit. |

Requires Node.js 18+. Tests: `npm test` (no dependencies).

## What the hooks see and store

- **SessionStart** reads the session id and why the session started (new, resumed, compacted) and
  prints the protocol from `SKILL.md`. It reads nothing else.
- **UserPromptSubmit** receives each prompt you send, as every hook of this kind does. It only
  checks whether the prompt is a `/flight-deck` command. Prompts are not stored, logged or sent
  anywhere.
- **Stored on disk:** one small file per session, `~/.claude/flight-deck/state/<session_id>.json`,
  holding the mode (`on` or `off`) and whether the protocol has been loaded. Files untouched for
  14 days are deleted.
- **Network:** none. The protocol is read from the plugin folder; nothing is downloaded at runtime.

## Troubleshooting

| Symptom | Check |
|---|---|
| No "Loading flight-deck mode..." at startup, Claude talks as usual | `/plugin` lists `flight-deck` as enabled; `node --version` works in the shell Claude Code starts from; `FLIGHT_DECK` is not set to `off`. |
| `/flight-deck off` starts a normal answer instead of switching | Type the command alone on the line. Text after it makes it an ordinary prompt. |
| `/flight-deck status` says ON but replies ignore the protocol | Start a new session: a session that started before the install never got the protocol. A long session may also drift; `/flight-deck on` sends a reminder with the next message. |
| Teaching asides or `★ Insight` blocks appear between tool calls | An output style asks for them; set the style to Default in `/config`. |
| The protocol seems to load twice | Another copy is installed, e.g. a `flight-deck` skill in `~/.claude/skills/` or a hand-made SessionStart hook in `settings.json`. Remove it. |

## License

[MIT](LICENSE)
