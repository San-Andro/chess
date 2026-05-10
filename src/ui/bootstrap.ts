import { ChessApp } from './chessApp'
import { createAppShell } from './dom/appShell'

export function bootstrapApp(mount: HTMLElement) {
  mount.innerHTML = ''
  mount.append(createAppShell())

  const app = new ChessApp({
    root: mount,
    now: () => Date.now(),
    cryptoRandomId: () => {
      const bytes = new Uint8Array(8)
      crypto.getRandomValues(bytes)
      return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
    },
  })
  app.start()
}

