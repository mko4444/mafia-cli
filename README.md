# mafia-cli

A terminal game of **Mafia** (social deduction) played against AI agents powered by Claude.
You're one of 7 players; the other 6 are AI with distinct personalities who discuss, accuse,
bluff, and vote. Play as Town (deduce who the Mafia are) or as Mafia (lie your way to victory).

## Quick start

```bash
pnpm install
cp .env.example .env   # add your ANTHROPIC_API_KEY (optional — see mock mode)
pnpm dev               # play in your terminal
```

Run in a real terminal (the UI needs an interactive TTY).

### Modes & flags

```bash
pnpm dev                      # play vs Claude (needs ANTHROPIC_API_KEY)
pnpm dev --mock               # play vs offline heuristic bots (no API key needed)
pnpm dev --auto               # watch a full game play itself, headless (no input/TTY)
pnpm dev --role mafia         # force your role: mafia | doctor | cop | villager | town | random
pnpm dev --seed 42            # deterministic game
pnpm dev --name Sam           # set your display name
```

Without an `ANTHROPIC_API_KEY`, the game automatically falls back to mock bots.

## Play with friends (multiplayer)

Other people join from their own terminal and play alongside the bots — each player sees only
their own private info (the firewall holds over the network too). The bots run on the **host's**
machine, so friends need **no API key**.

**You (the host):**

```bash
pnpm dev host --tunnel   # starts the server, prints a public  wss://…  URL to share
```

`--tunnel` needs [`cloudflared`](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/)
installed (zero-config public URL). Without it, friends on your network use the printed LAN
address. You also play in the same terminal; press **Enter** in the lobby to start — empty seats
fill with bots. The URL is new each session.

**Your friends** (only need [Node.js 22+](https://nodejs.org) installed — nothing else):

```bash
npx github:mko4444/mafia-cli join wss://your-url.trycloudflare.com --name Sam
```

`npx` fetches and runs the latest client each time, so when the code changes they just rerun the
same command to get the update.

## How it works

Roles for the balanced 7-player setup: **2 Mafia, 1 Doctor, 1 Cop, 3 Villagers**.
Each round: **Night** (Mafia kill, Doctor protects, Cop investigates) → **Day** (discussion) →
**Vote** (lynch). Town wins when all Mafia are dead; Mafia win at parity.

Three design ideas drive it:

- **Information firewall** — secrecy is enforced by *construction*, not by asking the model to
  keep secrets. `core/knowledge.ts` builds a per-agent `KnowledgeView` containing only what that
  agent legitimately knows; prompts are built solely from that view. (`tests/knowledge.test.ts`)
- **Hidden reasoning vs. public speech** — bots think privately (adaptive thinking) and return
  structured output `{ reasoning, notes, publicStatement, action/vote }`. `reasoning` powers the
  post-game reveal; `notes` is a per-bot scratchpad carried between turns so deception stays
  consistent. Strategy lives in `agents/prompt.ts` (effort/depth in `src/config.ts`).
- **Pure, testable engine** — `core/engine.ts` is an `async function*` with no Ink and no
  Anthropic dependency. The LLM is behind a mockable interface, so the full game loop, the
  firewall, and win conditions are unit-tested with zero API calls.

## Architecture

```
ui/ (Ink)  →  agents/ (LLM + personas, human, mock)  →  core/ (pure state machine)
```

The human is just another `PlayerAgent`, so the engine never special-cases them.
The agent model is set in `src/config.ts` (`claude-opus-4-8` by default — one line to change).

## Develop

```bash
pnpm test         # 25 tests: firewall, resolution, win conditions, full seeded game
pnpm typecheck    # tsc --noEmit
pnpm lint         # eslint --fix
```
