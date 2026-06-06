// Tunables. The model id is the one place to change which Claude powers the agents.
export const MODEL = 'claude-sonnet-4-6'

// How hard the bots think. Higher = stronger play, more tokens/latency.
// 'low'/'medium' keep the game snappy; 'high'/'xhigh'/'max' (Opus) play deeper.
export const EFFORT = 'medium' as const

// Generous so heavy adaptive-thinking + chatty output never truncates before the
// JSON decision (truncation → parse failure → fallback). Under the streaming
// threshold, so a plain request is fine.
export const MAX_TOKENS = 16000

// Discussion passes per day. 1 keeps the game snappy; 2 = more back-and-forth.
export const DAY_ROUNDS = 1

// Multiplayer.
export const DEFAULT_PORT = 8787
// How long a remote human has to act before we default their turn to a bot move —
// so one AFK player can't freeze the sequential engine for everyone.
export const TURN_TIMEOUT_MS = 90_000

// Pacing for the view (the engine itself is instant; drama lives here).
export const PACING = {
  bannerMs: 800,
  thinkMs: 600, // how long the "X is thinking…" beat shows in mock mode
  lineMs: 350, // pause after each spoken line / vote
  deathMs: 1300,
}
