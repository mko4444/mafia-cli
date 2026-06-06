import { Box, Text, useApp, useInput } from 'ink'
import type { PlayerId } from '~/core/types'
import { GameLog } from '~/ui/components/GameLog'
import { PlayerList } from '~/ui/components/PlayerList'
import { Prompt } from '~/ui/components/Prompt'
import type { GameVM } from '~/ui/feed'
import { useGameEngine, type EngineProps } from '~/ui/useGameEngine'

// Local single-player wrapper.
export function App(props: EngineProps) {
  const g = useGameEngine(props)
  return <GameView g={g} humanId={props.humanId} />
}

// Presentational shell, driven purely by the view-model — shared by the local
// engine and the network client. It reads only `myView`/`roster`/`feed`, never a
// full GameState, so the client (which only has its firewalled view) renders too.
export function GameView({ g, humanId }: { g: GameVM; humanId?: PlayerId }) {
  const { exit } = useApp()
  useInput((input, key) => {
    if (g.over && (input === 'q' || key.escape || key.return)) exit()
  })

  if (!g.myView) {
    return <Text dimColor>Connecting…</Text>
  }
  const me = humanId ?? g.myView.you.id

  const phaseLabel =
    g.myView.phase === 'night'
      ? 'Night'
      : g.myView.phase === 'day'
        ? 'Day (discussion)'
        : g.myView.phase === 'vote'
          ? 'Day (vote)'
          : 'Game over'

  return (
    <Box flexDirection="column">
      <GameLog feed={g.feed} />
      {!g.over && (
        <Box marginTop={1}>
          <PlayerList roster={g.roster} myView={g.myView} humanId={me} />
          <Box flexDirection="column">
            <Text bold>
              {phaseLabel} {g.myView.round}
            </Text>
            {g.thinking && <Text dimColor>💭 {g.thinking} is thinking…</Text>}
            {g.myView.spectator ? (
              <Text color="magenta">👻 You're out — watching. You can see every role now.</Text>
            ) : (
              g.myView.phase === 'night' &&
              !g.pending &&
              !g.thinking && <Text dimColor>🌙 The town sleeps while the Mafia move…</Text>
            )}
            {g.pending && <Prompt pending={g.pending} onSubmit={g.submit} />}
          </Box>
        </Box>
      )}
      {g.over && (
        <Text bold color="cyan">
          Game over — press q to quit.
        </Text>
      )}
    </Box>
  )
}
