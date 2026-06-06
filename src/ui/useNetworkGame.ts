// The network (client) source. Connects to a game server, joins the lobby, and
// drives the SAME view-model the local engine produces — so GameView renders
// identically. The server has already paced and filtered events, so this just
// applies them. submit() sends the decision back over the socket.

import { useEffect, useMemo, useRef, useState } from 'react'
import { WebSocket } from 'ws'
import type { AgentDecision, Faction, KnowledgeView, PlayerId, ReasoningEntry } from '~/core/types'
import { send, type LobbyPlayer, type ServerMsg } from '~/net/protocol'
import {
  rosterFromView,
  translate,
  type FeedItem,
  type GameVM,
  type Pending,
  type RosterEntry,
} from '~/ui/feed'

export type NetStatus = 'connecting' | 'lobby' | 'game' | 'aborted'

export interface NetGame {
  status: NetStatus
  lobby: { players: LobbyPlayer[]; host: boolean } | null
  abortReason: string | null
  start: () => void // host-only; ignored by the server otherwise
  vm: GameVM
}

export function useNetworkGame(url: string, name: string): NetGame {
  const [status, setStatus] = useState<NetStatus>('connecting')
  const [lobby, setLobby] = useState<{ players: LobbyPlayer[]; host: boolean } | null>(null)
  const [abortReason, setAbortReason] = useState<string | null>(null)

  const [feed, setFeed] = useState<FeedItem[]>([])
  const [thinking, setThinking] = useState<string | null>(null)
  const [pending, setPending] = useState<Pending | null>(null)
  const [over, setOver] = useState(false)
  const [winner, setWinner] = useState<Faction | null>(null)
  const [reveal, setReveal] = useState<ReasoningEntry[]>([])
  const [myView, setMyView] = useState<KnowledgeView | null>(null)
  const [roster, setRoster] = useState<RosterEntry[]>([])

  const wsRef = useRef<WebSocket | null>(null)
  const viewRef = useRef<KnowledgeView | null>(null)
  const reqIdRef = useRef<number | null>(null)
  const idRef = useRef(0)

  const applyView = (v: KnowledgeView) => {
    viewRef.current = v
    setMyView(v)
    setRoster(rosterFromView(v))
  }

  useEffect(() => {
    const ws = new WebSocket(url)
    wsRef.current = ws

    ws.on('open', () => send(ws, { t: 'join', name }))
    ws.on('error', () => {
      setAbortReason('connection failed')
      setStatus('aborted')
    })
    ws.on('close', () => setStatus((s) => (s === 'aborted' ? s : 'aborted')))

    ws.on('message', (data) => {
      let msg: ServerMsg
      try {
        msg = JSON.parse(String(data))
      } catch {
        return
      }
      switch (msg.t) {
        case 'lobby':
          setLobby({ players: msg.players, host: msg.host })
          setStatus((s) => (s === 'game' ? s : 'lobby'))
          break
        case 'started':
          setStatus('game')
          break
        case 'view':
          applyView(msg.view)
          break
        case 'decide':
          applyView(msg.view)
          reqIdRef.current = msg.reqId
          setPending({ view: msg.view, request: msg.request })
          break
        case 'event': {
          const v = viewRef.current
          const ctx = {
            humanId: v?.you.id ?? ('' as PlayerId),
            humanIsMafia: v?.you.faction === 'mafia',
            nameOf: (id: PlayerId) =>
              v?.alivePlayers.find((p) => p.id === id)?.name ??
              v?.deadPlayers.find((p) => p.id === id)?.name ??
              (id === v?.you.id ? v.you.name : id),
          }
          const tr = translate(msg.ev, ctx)
          if (tr.feed.length) {
            const withIds = tr.feed.map((it) => ({ ...it, id: ++idRef.current }))
            setFeed((f) => [...f, ...withIds])
          }
          if (tr.thinking !== undefined) setThinking(tr.thinking)
          if (tr.over) {
            setReveal(tr.over.reveal)
            setWinner(tr.over.winner)
            setOver(true)
          }
          break
        }
        case 'gameOver':
          setReveal(msg.reveal)
          setWinner(msg.winner)
          setOver(true)
          break
        case 'aborted':
          setAbortReason(msg.reason)
          setStatus('aborted')
          break
      }
    })

    return () => ws.close()
  }, [url, name])

  const submit = (d: AgentDecision) => {
    const ws = wsRef.current
    const reqId = reqIdRef.current
    if (ws && reqId != null) send(ws, { t: 'decision', reqId, decision: d })
    reqIdRef.current = null
    setPending(null)
    setThinking(null)
  }

  const start = () => {
    const ws = wsRef.current
    if (ws) send(ws, { t: 'start' })
  }

  const vm: GameVM = useMemo(
    () => ({ feed, thinking, pending, over, winner, reveal, myView, roster, submit }),
    [feed, thinking, pending, over, winner, reveal, myView, roster],
  )

  return { status, lobby, abortReason, start, vm }
}
