// The terminal client: join a game over WebSocket and play. Renders a lobby until
// the host starts, then the shared GameView driven by the network view-model.

import { Box, render, Text, useApp, useInput } from 'ink'
import { GameView } from '~/ui/App'
import { useNetworkGame } from '~/ui/useNetworkGame'

function NetApp({ url, name }: { url: string; name: string }) {
  const net = useNetworkGame(url, name)
  const { exit } = useApp()
  useInput((input, key) => {
    if (net.status === 'lobby' && net.lobby?.host && key.return) net.start()
    if ((net.status === 'aborted' || net.vm.over) && (input === 'q' || key.escape)) exit()
  })

  if (net.status === 'connecting') return <Text dimColor>Connecting to {url}…</Text>
  if (net.status === 'aborted')
    return (
      <Text color="red">
        Game ended: {net.abortReason ?? 'disconnected'} — press q to quit.
      </Text>
    )
  if (net.status === 'lobby')
    return <Lobby players={net.lobby?.players ?? []} host={!!net.lobby?.host} />

  return <GameView g={net.vm} />
}

function Lobby({ players, host }: { players: { name: string; connected: boolean }[]; host: boolean }) {
  return (
    <Box flexDirection="column">
      <Text bold color="cyan">
        Mafia — lobby
      </Text>
      {players.map((p, i) => (
        <Text key={i} color={p.connected ? undefined : 'gray'}>
          ● {p.name}
          {i === 0 ? ' (host)' : ''}
        </Text>
      ))}
      <Text> </Text>
      <Text dimColor>
        {host
          ? 'You are the host. Press Enter to start — empty seats fill with bots.'
          : 'Waiting for the host to start…'}
      </Text>
    </Box>
  )
}

export async function runClient(url: string, name: string) {
  const app = render(<NetApp url={url} name={name} />)
  await app.waitUntilExit()
}
