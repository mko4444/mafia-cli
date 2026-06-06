import 'dotenv/config'
import { spawn } from 'node:child_process'
import os from 'node:os'
import { render } from 'ink'
import { makeAiAgent } from '~/agents/aiAgent'
import { makeMockAgent } from '~/agents/mockAgent'
import type { PlayerAgent } from '~/agents/PlayerAgent'
import { PERSONAS } from '~/agents/personas'
import { anthropicClient } from '~/agents/llmClient'
import { DEFAULT_PORT, MODEL } from '~/config'
import { runGame } from '~/core/engine'
import { makeRng, pick, shuffle } from '~/core/rng'
import { assignRoles, DEFAULT_ROLES, type Seat } from '~/core/roles'
import type { GameState, PlayerId, Role } from '~/core/types'
import { runClient } from '~/net/client'
import { startServer } from '~/net/server'
import { startTunnel } from '~/net/tunnel'
import { App } from '~/ui/App'

interface Opts {
  cmd: 'local' | 'host' | 'join'
  url?: string // join target
  port: number
  tunnel: boolean
  mock: boolean
  auto: boolean
  seed: number
  name: string
  humanRole?: Role
}

function parseArgs(argv: string[]): Opts {
  const get = (flag: string) => {
    const i = argv.indexOf(flag)
    return i >= 0 ? argv[i + 1] : undefined
  }
  const cmd = argv[0] === 'host' ? 'host' : argv[0] === 'join' ? 'join' : 'local'
  return {
    cmd,
    url: cmd === 'join' ? argv[1] : undefined,
    port: Number(get('--port') ?? DEFAULT_PORT),
    tunnel: argv.includes('--tunnel'),
    mock: argv.includes('--mock'),
    auto: argv.includes('--auto'),
    seed: Number(get('--seed') ?? Math.floor(Math.random() * 1e9)),
    name: get('--name') ?? 'You',
    humanRole: resolveRole(get('--role'), makeRng(1)),
  }
}

function resolveRole(arg: string | undefined, rng: () => number): Role | undefined {
  if (!arg || arg === 'random') return undefined
  if (arg === 'town') return pick<Role>(['doctor', 'cop', 'villager'], rng)
  if (['mafia', 'doctor', 'cop', 'villager'].includes(arg)) return arg as Role
  return undefined
}

function setup(opts: Opts) {
  const rng = makeRng(opts.seed)
  const allPersonas = shuffle(PERSONAS, rng)
  const seatPersonas = allPersonas.slice(0, DEFAULT_ROLES.length - 1)
  const seats: Seat[] = [
    { name: opts.name, isHuman: true },
    ...seatPersonas.map((p) => ({ name: p.name, isHuman: false })),
  ]
  const players = assignRoles(seats, rng, DEFAULT_ROLES, opts.humanRole)

  // --auto runs every seat as a bot (AI vs AI when a key exists) — the eval harness.
  const useMock = opts.mock || !process.env.ANTHROPIC_API_KEY
  const llm = useMock ? null : anthropicClient(MODEL)
  const aiAgents: Record<PlayerId, PlayerAgent> = {}
  players.forEach((p, i) => {
    if (p.isHuman && !opts.auto) return // the human seat is interactive unless --auto
    const persona = p.isHuman ? allPersonas[DEFAULT_ROLES.length - 1] : seatPersonas[i - 1]
    aiAgents[p.id] =
      useMock || !llm
        ? makeMockAgent(p.id, rng)
        : makeAiAgent(p.id, persona, llm, rng)
  })

  const human = players.find((p) => p.isHuman)!
  const initialState: GameState = {
    players,
    phase: 'night',
    round: 1,
    log: [],
    winner: null,
    mafiaChannel: [],
    copResults: [],
  }
  return { rng, aiAgents, initialState, humanId: human.id, humanRole: human.role, useMock }
}

// Headless run: every seat is a bot (AI vs AI with a key, else mock); prints the
// public transcript and exits. No TTY needed — CI, quick demos, and bot eval.
async function runAuto(s: ReturnType<typeof setup>) {
  const agents = s.aiAgents // setup gave every seat an agent in --auto
  const nameOf = (id: string) =>
    s.initialState.players.find((p) => p.id === id)?.name ?? id
  for await (const ev of runGame(s.initialState, { agents, rng: s.rng })) {
    switch (ev.kind) {
      case 'phaseStart':
        console.log(`\n— ${ev.phase.toUpperCase()} ${ev.round} —`)
        break
      case 'statement':
        if (ev.channel === 'day') console.log(`${ev.name}: ${ev.text}`)
        break
      case 'voteCast':
        console.log(
          `🗳  ${ev.voterName} -> ${ev.target === 'abstain' ? 'abstain' : nameOf(ev.target)}`,
        )
        break
      case 'death':
        console.log(`💀 ${ev.name} (${ev.role}) ${ev.cause}`)
        break
      case 'noDeath':
        console.log('…no one died.')
        break
      case 'gameOver':
        console.log(`\n*** ${ev.winner.toUpperCase()} WINS ***`)
        console.log(
          'Roles: ' +
            s.initialState.players.map((p) => `${p.name}=${p.role}`).join(', '),
        )
        break
    }
  }
}

const lanAddress = (port: number) => {
  for (const ifaces of Object.values(os.networkInterfaces())) {
    for (const i of ifaces ?? []) {
      if (i.family === 'IPv4' && !i.internal) return `ws://${i.address}:${port}`
    }
  }
  return `ws://localhost:${port}`
}

// Best-effort copy to the OS clipboard; returns false if no tool is available.
function copyToClipboard(text: string): boolean {
  const tools =
    process.platform === 'darwin'
      ? [['pbcopy']]
      : process.platform === 'win32'
        ? [['clip']]
        : [['wl-copy'], ['xclip', '-selection', 'clipboard'], ['xsel', '--clipboard', '--input']]
  for (const [cmd, ...args] of tools) {
    try {
      const p = spawn(cmd, args, { stdio: ['pipe', 'ignore', 'ignore'] })
      p.on('error', () => {})
      p.stdin.end(text)
      return true
    } catch {
      // try the next tool
    }
  }
  return false
}

// Host = run the server AND play locally via a loopback connection, so it's one
// command. Friends join the printed URL; empty seats fill with bots.
async function runHost(opts: Opts) {
  const wss = startServer(opts.port)
  if (!wss.address()) await new Promise((res) => wss.once('listening', res))
  let share = lanAddress(opts.port)
  if (opts.tunnel) {
    const t = await startTunnel(opts.port)
    if (t) share = t.url.replace(/^https/, 'wss')
    else
      console.log(
        'cloudflared not found — share the LAN address below instead.\n' +
          'Install: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/',
      )
  }
  const joinCmd = `npx github:mko4444/mafia-cli join ${share}`
  const copied = copyToClipboard(joinCmd)
  console.log(`\nMafia server on :${opts.port}`)
  console.log(`Share this command with friends${copied ? ' (copied to clipboard)' : ''}:`)
  console.log(`  ${joinCmd}\n`)
  await runClient(`ws://localhost:${opts.port}`, opts.name)
  wss.close()
}

const opts = parseArgs(process.argv.slice(2))

if (opts.cmd === 'join') {
  if (!opts.url || opts.url.startsWith('--')) {
    console.error('usage: mafia join <ws-url> [--name YourName]')
    process.exit(1)
  }
  await runClient(opts.url, opts.name)
} else if (opts.cmd === 'host') {
  await runHost(opts)
} else {
  const s = setup(opts)
  if (opts.auto) {
    await runAuto(s)
  } else {
    if (!opts.mock && s.useMock) {
      console.log('No ANTHROPIC_API_KEY found — running with mock agents (no API).')
    }
    console.log(`Mafia · seed ${opts.seed} · ${s.useMock ? 'mock' : MODEL}\n`)
    const app = render(
      <App
        initialState={s.initialState}
        aiAgents={s.aiAgents}
        humanId={s.humanId}
        humanRole={s.humanRole}
        rng={s.rng}
      />,
    )
    await app.waitUntilExit()
  }
}
