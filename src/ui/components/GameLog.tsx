import { Static, Text } from 'ink'
import type { FeedItem } from '~/ui/feed'

// <Static> prints each line once and lets the terminal scroll naturally — the
// transcript never gets clipped or re-rendered.
export function GameLog({ feed }: { feed: FeedItem[] }) {
  return (
    <Static items={feed}>
      {(item, i) => <Line key={i} item={item} />}
    </Static>
  )
}

function Line({ item }: { item: FeedItem }) {
  switch (item.kind) {
    case 'banner':
      return (
        <Text color="cyan" bold>
          {'\n'}
          {item.text}
        </Text>
      )
    case 'say':
      return (
        <Text>
          <Text color="green" bold>
            {item.speaker}:
          </Text>{' '}
          {item.text}
        </Text>
      )
    case 'mafia':
      return (
        <Text color="magenta">
          [night] <Text bold>{item.speaker}:</Text> {item.text}
        </Text>
      )
    case 'vote':
      return <Text color="yellow">🗳  {item.text}</Text>
    case 'death':
      return (
        <Text color="red" bold>
          {item.text}
        </Text>
      )
    case 'info':
      return <Text dimColor>{item.text}</Text>
    case 'win':
      return (
        <Text color="greenBright" bold>
          {'\n'}
          {item.text}
        </Text>
      )
    case 'reveal':
      return <Text dimColor>{item.text}</Text>
  }
}
