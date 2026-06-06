import { useState } from 'react'
import { Box, Text } from 'ink'
import SelectInput from 'ink-select-input'
import TextInput from 'ink-text-input'
import { allowedTargets } from '~/agents/prompt'
import type { AgentDecision, PlayerId } from '~/core/types'
import type { Pending } from '~/ui/feed'

export function Prompt({
  pending,
  onSubmit,
}: {
  pending: Pending
  onSubmit: (d: AgentDecision) => void
}) {
  const { view, request } = pending
  const base = { reasoning: '(human)', suspicions: {} as Record<PlayerId, number> }

  if (request.ask === 'daySpeak') {
    return (
      <SpeakInput
        onSubmit={(text) =>
          onSubmit({ ...base, publicStatement: text || '(I keep quiet.)' })
        }
      />
    )
  }

  const nameOf = (id: PlayerId) =>
    view.alivePlayers.find((p) => p.id === id)?.name ?? id

  if (request.ask === 'vote') {
    const items = [
      ...view.alivePlayers
        .filter((p) => p.id !== view.you.id)
        .map((p) => ({ label: `Lynch ${p.name}`, value: p.id })),
      { label: 'Abstain', value: 'abstain' },
    ]
    return (
      <Chooser
        title="🗳  Cast your vote:"
        items={items}
        onSelect={(value) =>
          onSubmit({ ...base, publicStatement: '', vote: value })
        }
      />
    )
  }

  // night actions
  const verb =
    request.ask === 'mafiaKill'
      ? 'kill'
      : request.ask === 'doctorSave'
        ? 'protect'
        : 'investigate'
  const items = allowedTargets(view, request.ask).map((id) => ({
    label: `${cap(verb)} ${nameOf(id)}${id === view.you.id ? ' (yourself)' : ''}`,
    value: id,
  }))
  return (
    <Chooser
      title={`☾  Night — choose who to ${verb}:`}
      items={items}
      onSelect={(value) =>
        onSubmit({
          ...base,
          publicStatement:
            request.ask === 'mafiaKill' ? `Let's take out ${nameOf(value)}.` : '',
          action: value,
        })
      }
    />
  )
}

function SpeakInput({ onSubmit }: { onSubmit: (t: string) => void }) {
  const [text, setText] = useState('')
  return (
    <Box>
      <Text color="green">Your turn — say something: </Text>
      <TextInput value={text} onChange={setText} onSubmit={() => onSubmit(text)} />
    </Box>
  )
}

function Chooser({
  title,
  items,
  onSelect,
}: {
  title: string
  items: { label: string; value: string }[]
  onSelect: (value: string) => void
}) {
  return (
    <Box flexDirection="column">
      <Text color="green">{title}</Text>
      <SelectInput items={items} onSelect={(item) => onSelect(item.value)} />
    </Box>
  )
}

const cap = (s: string) => s[0].toUpperCase() + s.slice(1)
