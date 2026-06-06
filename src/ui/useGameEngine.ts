// The local (single-player) source. Runs the engine generator in-process, paces
// events into the transcript, and resolves the human-input promise. All event→feed
// mapping lives in feed.ts and is shared with the network client.

import { useEffect, useMemo, useRef, useState } from 'react'
import { makeHumanAgent } from '~/agents/humanAgent'
import type { DecisionRequest, PlayerAgent } from '~/agents/PlayerAgent'
import { buildKnowledgeView } from '~/core/knowledge'
import { runGame } from '~/core/engine'
import type { Rng } from '~/core/rng'
import {
  factionOf,
  type AgentDecision,
  type Faction,
  type GameState,
  type KnowledgeView,
  type PlayerId,
  type ReasoningEntry,
  type Role,
} from '~/core/types'
import {
  rosterFromView,
  translate,
  type FeedItem,
  type GameVM,
  type Pending,
  type RosterEntry,
} from '~/ui/feed'

export type { FeedItem, Pending } from '~/ui/feed'

export interface EngineProps {
  initialState: GameState
  aiAgents: Record<PlayerId, PlayerAgent>
  humanId: PlayerId
  humanRole: Role
  rng: Rng
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export function useGameEngine(props: EngineProps): GameVM {
  const { initialState, aiAgents, humanId, humanRole, rng } = props
  const initialView = useMemo(
    () => buildKnowledgeView(initialState, humanId),
    [initialState, humanId],
  )
  const [feed, setFeed] = useState<FeedItem[]>([])
  const [thinking, setThinking] = useState<string | null>(null)
  const [pending, setPending] = useState<Pending | null>(null)
  const [over, setOver] = useState(false)
  const [winner, setWinner] = useState<Faction | null>(null)
  const [reveal, setReveal] = useState<ReasoningEntry[]>([])
  const [myView, setMyView] = useState<KnowledgeView>(initialView)
  const [roster, setRoster] = useState<RosterEntry[]>(() => rosterFromView(initialView))

  const idRef = useRef(0)
  const resolverRef = useRef<((d: AgentDecision) => void) | null>(null)
  const cancelledRef = useRef(false)
  const humanIsMafia = factionOf(humanRole) === 'mafia'

  const nameOf = useMemo(() => {
    const m = new Map<PlayerId, string>()
    for (const p of initialState.players) m.set(p.id, p.name)
    return (id: PlayerId) => m.get(id) ?? id
  }, [initialState])

  const submit = (d: AgentDecision) => {
    const r = resolverRef.current
    resolverRef.current = null
    setPending(null)
    setThinking(null)
    r?.(d)
  }

  useEffect(() => {
    cancelledRef.current = false
    const push = (items: { kind: FeedItem['kind']; speaker?: string; text: string }[]) => {
      if (!items.length) return
      const withIds = items.map((it) => ({ ...it, id: ++idRef.current }))
      setFeed((f) => [...f, ...withIds])
    }

    const awaitInput = (view: KnowledgeView, request: DecisionRequest) =>
      new Promise<AgentDecision>((resolve) => {
        resolverRef.current = resolve
        setPending({ view, request })
      })

    const human = makeHumanAgent(humanId, awaitInput)
    const agents = { ...aiAgents, [humanId]: human }

    ;(async () => {
      for await (const ev of runGame(initialState, { agents, rng })) {
        if (cancelledRef.current) return
        if (ev.kind === 'state') {
          const v = buildKnowledgeView(ev.state, humanId)
          setMyView(v)
          setRoster(rosterFromView(v))
          continue
        }
        const t = translate(ev, { humanId, humanIsMafia, nameOf })
        push(t.feed)
        if (t.thinking !== undefined) setThinking(t.thinking)
        if (t.over) {
          setReveal(t.over.reveal)
          setWinner(t.over.winner)
          setOver(true)
        }
        if (t.paceMs) await sleep(t.paceMs)
      }
    })()

    return () => {
      cancelledRef.current = true
    }
    // The engine runs exactly once for the lifetime of the component.
  }, [])

  return { feed, thinking, pending, submit, over, winner, reveal, myView, roster }
}
