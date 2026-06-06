import { Box, Text } from 'ink'
import type { KnowledgeView, PlayerId } from '~/core/types'
import type { RosterEntry } from '~/ui/feed'

// Roster + the human's own private knowledge. The "You know" panel is computed
// from the human's KnowledgeView, so it shows exactly what the firewall allows.
// Both the local engine and the network client supply the same `roster` shape.
export function PlayerList({
  roster,
  myView,
  humanId,
}: {
  roster: RosterEntry[]
  myView: KnowledgeView
  humanId: PlayerId
}) {
  const nameOf = (id: PlayerId) =>
    roster.find((p) => p.id === id)?.name ?? (id === myView.you.id ? myView.you.name : id)

  return (
    <Box flexDirection="column" marginRight={2} minWidth={22}>
      <Text bold underline>
        Players
      </Text>
      {myView.spectator && <Text color="magenta">👻 spectating (you're out)</Text>}
      {roster.map((p) => (
        <Text key={p.id} color={p.alive ? undefined : 'gray'}>
          {p.alive ? '● ' : '✝ '}
          {p.id === humanId ? <Text bold>{p.name} (you)</Text> : p.name}
          {/* role shows only when revealed: for spectators, and for the dead at game over */}
          {p.role && <Text dimColor> — {p.role}</Text>}
        </Text>
      ))}

      <Box marginTop={1} flexDirection="column">
        <Text bold underline>
          You know
        </Text>
        <Text>
          Role: <Text bold>{myView.you.role}</Text> ({myView.you.faction})
        </Text>
        {myView.mafiaTeammates && (
          <Text color="magenta">
            Partners:{' '}
            {myView.mafiaTeammates.map((t) => t.name).join(', ') || '(none left)'}
          </Text>
        )}
        {myView.investigations?.map((r) => (
          <Text key={`${r.round}-${r.target}`} color="cyan">
            N{r.round}: {nameOf(r.target)} is {r.faction}
          </Text>
        ))}
      </Box>
    </Box>
  )
}
