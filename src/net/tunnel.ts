// Optional zero-config public access: spawn `cloudflared` to expose the local
// server on a public *.trycloudflare.com URL. Returns null if cloudflared isn't
// installed so the host can fall back to a LAN address.

import { spawn, type ChildProcess } from 'node:child_process'

const URL_RE = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/

export interface Tunnel {
  url: string // https://… (use wss://… for the WebSocket client)
  stop: () => void
}

export function startTunnel(port: number, timeoutMs = 20_000): Promise<Tunnel | null> {
  return new Promise((resolve) => {
    let child: ChildProcess
    try {
      child = spawn('cloudflared', ['tunnel', '--url', `http://localhost:${port}`])
    } catch {
      return resolve(null)
    }

    let settled = false
    const done = (t: Tunnel | null) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(t)
    }
    const stop = () => child.kill()
    const onData = (buf: Buffer) => {
      const m = String(buf).match(URL_RE)
      if (m) done({ url: m[0], stop })
    }

    child.stdout?.on('data', onData)
    child.stderr?.on('data', onData) // cloudflared prints the URL to stderr
    child.on('error', () => done(null)) // not installed
    child.on('exit', () => done(null))
    process.on('exit', stop)

    const timer = setTimeout(() => done(null), timeoutMs)
  })
}
