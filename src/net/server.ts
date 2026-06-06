// The game server. Runs the engine in-process, fans events out to clients with
// per-recipient filtering, and treats each connected human as a remote PlayerAgent.
//
// FIREWALL: the only game data sent to a client is its own buildKnowledgeView()
// and feed events vetted for that recipient (mafia-channel chatter goes to mafia
// seats only). A raw GameState is never serialized to anyone.

import { WebSocket, WebSocketServer } from 'ws'
import { makeAiAgent } from '~/agents/aiAgent'
import { makeMockAgent } from '~/agents/mockAgent'
import { anthropicClient } from '~/agents/llmClient'
import { PERSONAS } from '~/agents/personas'
import type { DecisionRequest, PlayerAgent } from '~/agents/PlayerAgent'
import { MODEL, PACING, TURN_TIMEOUT_MS } from '~/config'
import { runGame } from '~/core/engine'
import { buildKnowledgeView } from '~/core/knowledge'
import { makeRng, shuffle, type Rng } from '~/core/rng'
import { assignRoles, DEFAULT_ROLES, type Seat } from '~/core/roles'
import type { AgentDecision, GameEvent, GameState, KnowledgeView, PlayerId } from '~/core/types'
import { makeRemoteAgent, type RemoteTransport } from '~/net/remoteAgent'
import { send, type ClientMsg, type LobbyPlayer } from '~/net/protocol'
import type { FeedEvent } from '~/ui/feed'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const isOpen = (ws: WebSocket) => ws.readyState === WebSocket.OPEN
const token = () => `tok_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`

const paceFor = (ev: FeedEvent): number => {
  switch (ev.kind) {
    case 'phaseStart':
      return PACING.bannerMs
    case 'thinking':
      return PACING.thinkMs
    case 'statement':
    case 'voteCast':
    case 'noDeath':
      return PACING.lineMs
    case 'death':
      return PACING.deathMs
    default:
      return 0
  }
}

interface Client {
  ws: WebSocket
  name: string
  token: string
  seatId?: PlayerId // set at game start
}

class Hub implements RemoteTransport {
  private lobby: Client[] = [] // join order; index 0 is the host
  private started = false
  private state!: GameState
  private agents: Record<PlayerId, PlayerAgent> = {}
  private seatSocket = new Map<PlayerId, WebSocket>()
  private mafiaSeats = new Set<PlayerId>()
  private pending = new Map<number, { seatId: PlayerId; finish: (d: AgentDecision | null) => void }>()
  private reqId = 0
  private phase: GameState['phase'] = 'night'
  // Public feed history for reconnect replay (mafiaOnly events only replay to mafia).
  private backlog: { ev: FeedEvent; mafiaOnly: boolean }[] = []

  constructor(private rng: Rng) {}

  onConnection(ws: WebSocket) {
    ws.on('message', (data) => {
      let msg: ClientMsg
      try {
        msg = JSON.parse(String(data))
      } catch {
        return
      }
      if (msg.t === 'join') this.onJoin(ws, msg.name)
      else if (msg.t === 'rejoin') this.onRejoin(ws, msg.token)
      else if (msg.t === 'start') this.onStart(ws)
      else if (msg.t === 'decision') this.pending.get(msg.reqId)?.finish(msg.decision)
    })
    ws.on('close', () => this.onClose(ws))
    ws.on('error', () => {})
  }

  // ── RemoteTransport ──
  connected(seatId: PlayerId): boolean {
    const ws = this.seatSocket.get(seatId)
    return !!ws && isOpen(ws)
  }

  requestDecision(
    seatId: PlayerId,
    view: KnowledgeView,
    request: DecisionRequest,
    timeoutMs: number,
  ): Promise<AgentDecision | null> {
    return new Promise((resolve) => {
      const reqId = ++this.reqId
      const finish = (d: AgentDecision | null) => {
        if (!this.pending.has(reqId)) return
        this.pending.delete(reqId)
        clearTimeout(timer)
        resolve(d)
      }
      this.pending.set(reqId, { seatId, finish })
      const timer = setTimeout(() => finish(null), timeoutMs)
      const ws = this.seatSocket.get(seatId)
      if (!ws || !isOpen(ws)) return finish(null)
      send(ws, { t: 'decide', reqId, view, request, deadlineMs: timeoutMs })
    })
  }

  // ── lobby ──
  private onJoin(ws: WebSocket, name: string) {
    if (this.started) return this.reject(ws, 'game already started')
    if (this.lobby.length >= DEFAULT_ROLES.length) return this.reject(ws, 'game full')
    this.lobby.push({ ws, name: name || `Player ${this.lobby.length + 1}`, token: token() })
    this.broadcastLobby()
  }

  private onStart(ws: WebSocket) {
    if (!this.started && this.lobby[0]?.ws === ws) this.start()
  }

  private broadcastLobby() {
    const players: LobbyPlayer[] = this.lobby.map((c) => ({ name: c.name, connected: isOpen(c.ws) }))
    this.lobby.forEach((c, i) => {
      if (isOpen(c.ws)) send(c.ws, { t: 'lobby', players, you: i, host: i === 0, started: this.started })
    })
  }

  private reject(ws: WebSocket, reason: string) {
    send(ws, { t: 'aborted', reason })
    ws.close()
  }

  // ── start the game ──
  private start() {
    this.started = true
    const k = this.lobby.length
    const personas = shuffle(PERSONAS, this.rng)
    const seats: Seat[] = [
      ...this.lobby.map((c) => ({ name: c.name, isHuman: true })),
      ...personas.slice(0, DEFAULT_ROLES.length - k).map((p) => ({ name: p.name, isHuman: false })),
    ]
    const players = assignRoles(seats, this.rng, DEFAULT_ROLES) // roles random + hidden
    this.state = {
      players,
      phase: 'night',
      round: 1,
      log: [],
      winner: null,
      mafiaChannel: [],
      copResults: [],
    }
    this.mafiaSeats = new Set(players.filter((p) => p.role === 'mafia').map((p) => p.id))

    const useMock = !process.env.ANTHROPIC_API_KEY
    const llm = useMock ? null : anthropicClient(MODEL)
    players.forEach((p, i) => {
      if (i < k) {
        const c = this.lobby[i]
        c.seatId = p.id
        this.seatSocket.set(p.id, c.ws)
        this.agents[p.id] = makeRemoteAgent(p.id, this, makeMockAgent(p.id, this.rng), TURN_TIMEOUT_MS)
      } else {
        this.agents[p.id] =
          useMock || !llm ? makeMockAgent(p.id, this.rng) : makeAiAgent(p.id, personas[i - k], llm, this.rng)
      }
    })

    // Hand each human their seat + initial (firewalled) view, then run.
    this.lobby.forEach((c) => {
      if (!c.seatId) return
      send(c.ws, { t: 'started', you: c.seatId, name: c.name, token: c.token })
      this.sendView(c.seatId)
    })
    void this.run()
  }

  private async run() {
    for await (const ev of runGame(this.state, { agents: this.agents, rng: this.rng })) {
      const pace = this.dispatch(ev)
      if (pace) await sleep(pace)
    }
  }

  // Route one engine event to clients; returns how long to pause after it.
  private dispatch(ev: GameEvent): number {
    if (ev.kind === 'state') {
      this.state = ev.state
      for (const seatId of this.seatSocket.keys()) this.sendView(seatId)
      return 0
    }
    if (ev.kind === 'phaseStart') this.phase = ev.phase
    // Night "X is thinking" would leak who holds a night role — suppress it.
    if (ev.kind === 'thinking' && this.phase === 'night') return 0

    const mafiaOnly = ev.kind === 'statement' && ev.channel === 'mafia'
    this.backlog.push({ ev, mafiaOnly })
    for (const [seatId, ws] of this.seatSocket) {
      // Mafia chatter goes to mafia seats and to eliminated spectators only.
      if (mafiaOnly && !this.mafiaSeats.has(seatId) && !this.isDead(seatId)) continue
      if (isOpen(ws)) send(ws, { t: 'event', ev })
    }
    return paceFor(ev)
  }

  private isDead(seatId: PlayerId): boolean {
    return this.state.players.find((p) => p.id === seatId)?.alive === false
  }

  private sendView(seatId: PlayerId) {
    const ws = this.seatSocket.get(seatId)
    if (ws && isOpen(ws)) send(ws, { t: 'view', view: buildKnowledgeView(this.state, seatId) })
  }

  // ── disconnect / reconnect ──
  private onRejoin(ws: WebSocket, tok: string) {
    const c = this.lobby.find((x) => x.token === tok)
    if (!c || !c.seatId) return this.reject(ws, 'unknown session')
    c.ws = ws
    this.seatSocket.set(c.seatId, ws)
    send(ws, { t: 'started', you: c.seatId, name: c.name, token: c.token })
    this.sendView(c.seatId)
    const seesMafia = this.mafiaSeats.has(c.seatId) || this.isDead(c.seatId)
    for (const b of this.backlog) {
      if (b.mafiaOnly && !seesMafia) continue
      send(ws, { t: 'event', ev: b.ev })
    }
  }

  private onClose(ws: WebSocket) {
    if (!this.started) {
      const idx = this.lobby.findIndex((c) => c.ws === ws)
      if (idx >= 0) {
        this.lobby.splice(idx, 1)
        this.broadcastLobby()
      }
      return
    }
    let seatId: PlayerId | undefined
    for (const [sid, s] of this.seatSocket) if (s === ws) seatId = sid
    if (!seatId) return
    this.seatSocket.delete(seatId)
    // Any pending request for this seat falls back to a bot move immediately.
    for (const [, p] of this.pending) if (p.seatId === seatId) p.finish(null)
    // Host leaving ends the game for everyone (v1).
    if (this.lobby[0]?.seatId === seatId && !this.state.winner) {
      for (const [, s] of this.seatSocket) if (isOpen(s)) send(s, { t: 'aborted', reason: 'host left' })
    }
  }
}

export function startServer(port: number, seed = Math.floor(Math.random() * 1e9)): WebSocketServer {
  const wss = new WebSocketServer({ port })
  const hub = new Hub(makeRng(seed))
  wss.on('connection', (ws) => hub.onConnection(ws))
  // Keep idle connections alive through tunnels (cloudflared drops silent WS).
  const beat = setInterval(() => {
    for (const ws of wss.clients) if (isOpen(ws)) ws.ping()
  }, 30_000)
  wss.on('close', () => clearInterval(beat))
  return wss
}
