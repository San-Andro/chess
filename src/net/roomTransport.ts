export type RoomMessage =
  | { type: 'hello'; peerId: string; name: string; at: number }
  | { type: 'goodbye'; peerId: string; at: number }
  | { type: 'state'; peerId: string; at: number; fen: string; clocks: { wMs: number; bMs: number; turnStartAt: number } }
  | { type: 'move'; peerId: string; at: number; move: { from: string; to: string; promotion?: string } }
  | { type: 'chat'; peerId: string; name: string; at: number; text: string }
  | { type: 'reset'; peerId: string; at: number }

export interface RoomTransport {
  send(message: RoomMessage): void
  onMessage(handler: (message: RoomMessage) => void): () => void
  close(): void
}

export class BroadcastChannelTransport implements RoomTransport {
  private readonly channel: BroadcastChannel
  private handler: ((message: RoomMessage) => void) | null = null

  constructor(roomId: string) {
    this.channel = new BroadcastChannel(`chess-room-${roomId}`)
    this.channel.onmessage = (ev) => {
      const msg = ev.data as RoomMessage
      this.handler?.(msg)
    }
  }

  send(message: RoomMessage): void {
    this.channel.postMessage(message)
  }

  onMessage(handler: (message: RoomMessage) => void): () => void {
    this.handler = handler
    return () => {
      if (this.handler === handler) this.handler = null
    }
  }

  close(): void {
    this.channel.close()
  }
}

