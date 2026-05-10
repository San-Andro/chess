import { Position } from '../chess/position'
import { StandardRules } from '../chess/rules/standardRules'
import type { Color, Square } from '../chess/types'
import { algebraic, parseAlgebraic, sameSquare } from '../chess/types'
import type { Move } from '../chess/move'
import { BoardView } from './components/boardView'
import { BroadcastChannelTransport } from '../net/roomTransport'
import type { RoomMessage, RoomTransport } from '../net/roomTransport'

type Deps = {
  root: HTMLElement
  now: () => number
  cryptoRandomId: () => string
}

type Clocks = { wMs: number; bMs: number; turnStartAt: number }

export class ChessApp {
  private readonly deps: Deps
  private readonly rules = new StandardRules()

  private transport: RoomTransport | null = null
  private unsubscribe: (() => void) | null = null

  private peerId: string
  private peers = new Map<string, { name: string; lastSeenAt: number }>()

  private roomId: string | null = null
  private playerName = 'Student'
  private myColor: Color | 'spectator' = 'spectator'

  private position: Position = Position.start()
  private clocks: Clocks = { wMs: 5 * 60_000, bMs: 5 * 60_000, turnStartAt: 0 }
  private moveLog: string[] = []
  private selected: Square | null = null
  private legalTargets: Square[] = []
  private lastMove: { from: Square; to: Square } | null = null

  private boardView!: BoardView
  private tickTimer: number | null = null

  constructor(deps: Deps) {
    this.deps = deps
    this.peerId = deps.cryptoRandomId()
  }

  start(): void {
    this.hydrateFromUrl()
    this.bindUI()
    this.mountBoard()
    this.resetGame(false)
    this.renderAll()
    this.startTicker()
  }

  private bindUI(): void {
    const root = this.deps.root

    root.addEventListener('click', (ev) => {
      const el = ev.target as HTMLElement | null
      const actionEl = el?.closest<HTMLElement>('[data-action]')
      const action = actionEl?.dataset.action
      if (!action) return

      if (action === 'create-room') this.createRoom()
      if (action === 'join-room') this.joinRoomFromInput()
      if (action === 'copy-link') this.copyRoomLink()
      if (action === 'reset') this.resetAndBroadcast()
    })

    root.addEventListener('submit', (ev) => {
      const form = ev.target as HTMLElement | null
      const action = form?.getAttribute('data-action')
      if (action !== 'send-chat') return
      ev.preventDefault()
      this.sendChat()
    })

    const nameInput = this.getField<HTMLInputElement>('playerName')
    nameInput.value = this.playerName
    nameInput.addEventListener('input', () => {
      this.playerName = (nameInput.value || 'Student').slice(0, 24)
      this.hello()
    })

    const roomInput = this.getField<HTMLInputElement>('roomId')
    roomInput.addEventListener('input', () => {
      this.roomId = roomInput.value.trim() || null
    })
  }

  private mountBoard(): void {
    const mount = this.getView('board')
    this.boardView = new BoardView(mount, {
      onSquareClick: (sq) => this.onSquareClick(sq),
    })
  }

  private onSquareClick(square: Square): void {
    if (this.myColor === 'spectator') {
      this.setNotice('Вы наблюдатель. Подключитесь к комнате, чтобы играть.')
      return
    }

    if (this.position.turn !== this.myColor) {
      this.setNotice('Сейчас не ваш ход.')
      return
    }

    const p = this.position.pieceAt(square)
    if (!this.selected) {
      if (!p || p.color !== this.myColor) return
      this.selectSquare(square)
      return
    }

    // Reselect own piece
    if (p && p.color === this.myColor) {
      this.selectSquare(square)
      return
    }

    // Attempt move
    if (this.legalTargets.some((t) => sameSquare(t, square))) {
      const move: Move = { from: this.selected, to: square }
      this.tryMove(move, true)
      return
    }

    // Clear selection if clicked elsewhere
    this.clearSelection()
  }

  private selectSquare(square: Square): void {
    this.selected = square
    this.legalTargets = this.rules.legalMovesFrom(this.position, square).map((m) => m.to)
    this.renderBoard()
  }

  private clearSelection(): void {
    this.selected = null
    this.legalTargets = []
    this.renderBoard()
  }

  private tryMove(move: Move, broadcast: boolean): void {
    try {
      const before = this.position
      const { position: after, meta } = this.rules.applyMove(before, move)

      // Clock update
      this.applyClockForMove(before.turn)

      this.position = after
      this.lastMove = { from: move.from, to: move.to }
      this.moveLog.push(meta.notation)
      this.clearSelection()
      this.renderAll()

      if (broadcast) this.broadcastMove(move)
      this.setNotice(meta.givesCheck ? 'Шах!' : '')
    } catch (e) {
      this.setNotice('Недопустимый ход.')
    }
  }

  private applyClockForMove(movedColor: Color): void {
    if (!this.clocks.turnStartAt) {
      this.clocks.turnStartAt = this.deps.now()
      return
    }

    const spent = Math.max(0, this.deps.now() - this.clocks.turnStartAt)
    if (movedColor === 'w') this.clocks.wMs = Math.max(0, this.clocks.wMs - spent)
    else this.clocks.bMs = Math.max(0, this.clocks.bMs - spent)

    this.clocks.turnStartAt = this.deps.now()
  }

  private resetGame(setTurnStart: boolean): void {
    this.position = Position.start()
    this.moveLog = []
    this.selected = null
    this.legalTargets = []
    this.lastMove = null
    this.clocks = { wMs: 5 * 60_000, bMs: 5 * 60_000, turnStartAt: setTurnStart ? this.deps.now() : 0 }
    this.setNotice('')
  }

  private resetAndBroadcast(): void {
    this.resetGame(true)
    this.renderAll()
    this.transport?.send({ type: 'reset', peerId: this.peerId, at: this.deps.now() })
    this.sendState()
  }

  private createRoom(): void {
    const id = this.deps.cryptoRandomId().slice(0, 8)
    const roomInput = this.getField<HTMLInputElement>('roomId')
    roomInput.value = id
    this.roomId = id
    this.connectToRoom(id)
  }

  private joinRoomFromInput(): void {
    const roomInput = this.getField<HTMLInputElement>('roomId')
    const id = roomInput.value.trim()
    if (!id) return
    this.roomId = id
    this.connectToRoom(id)
  }

  private connectToRoom(roomId: string): void {
    this.disconnect()

    this.transport = new BroadcastChannelTransport(roomId)
    this.unsubscribe = this.transport.onMessage((m) => this.onRoomMessage(m))
    this.peers.clear()
    this.roomId = roomId
    location.hash = `#room=${encodeURIComponent(roomId)}`

    this.hello()
    this.sendState()
    this.setNotice('Подключено к комнате. Откройте вторую вкладку и войдите в ту же комнату.')
    this.renderAll()
  }

  private disconnect(): void {
    this.unsubscribe?.()
    this.unsubscribe = null
    this.transport?.close()
    this.transport = null
    this.myColor = 'spectator'
    this.peers.clear()
  }

  private onRoomMessage(message: RoomMessage): void {
    if (message.peerId === this.peerId) return

    if (message.type === 'hello') {
      this.peers.set(message.peerId, { name: message.name, lastSeenAt: message.at })
      this.assignColors()
      this.renderStatus()
      return
    }

    if (message.type === 'goodbye') {
      this.peers.delete(message.peerId)
      this.assignColors()
      this.renderStatus()
      return
    }

    if (message.type === 'reset') {
      this.resetGame(true)
      this.renderAll()
      return
    }

    if (message.type === 'state') {
      // Accept state from the "white" peer to avoid conflicts.
      const whitePeer = this.getWhitePeerId()
      if (whitePeer && message.peerId !== whitePeer) return
      this.position = Position.fromFEN(message.fen)
      this.clocks = { ...message.clocks }
      this.clearSelection()
      this.renderAll()
      return
    }

    if (message.type === 'move') {
      const move: Move = {
        from: parseAlgebraic(message.move.from),
        to: parseAlgebraic(message.move.to),
        promotion: (message.move.promotion as any) || undefined,
      }
      this.tryMove(move, false)
      return
    }

    if (message.type === 'chat') {
      this.appendChat(message.name, message.text)
      return
    }
  }

  private assignColors(): void {
    const ids = [this.peerId, ...this.peers.keys()].sort()
    const myIndex = ids.indexOf(this.peerId)
    this.myColor = myIndex === 0 ? 'w' : myIndex === 1 ? 'b' : 'spectator'
  }

  private getWhitePeerId(): string | null {
    const ids = [this.peerId, ...this.peers.keys()].sort()
    return ids[0] ?? null
  }

  private hello(): void {
    this.transport?.send({ type: 'hello', peerId: this.peerId, name: this.playerName, at: this.deps.now() })
    this.assignColors()
    this.renderStatus()
  }

  private sendState(): void {
    if (!this.transport) return
    // Only white is authoritative for state snapshots.
    if (this.myColor !== 'w') return
    if (!this.clocks.turnStartAt) this.clocks.turnStartAt = this.deps.now()
    this.transport.send({
      type: 'state',
      peerId: this.peerId,
      at: this.deps.now(),
      fen: this.position.toFEN(),
      clocks: { ...this.clocks },
    })
  }

  private broadcastMove(move: Move): void {
    if (!this.transport) return
    this.transport.send({
      type: 'move',
      peerId: this.peerId,
      at: this.deps.now(),
      move: {
        from: algebraic(move.from),
        to: algebraic(move.to),
        promotion: move.promotion,
      },
    })
    this.sendState()
  }

  private sendChat(): void {
    const input = this.getField<HTMLInputElement>('chatText')
    const text = (input.value || '').trim()
    if (!text) return
    input.value = ''

    this.appendChat(this.playerName, text)
    this.transport?.send({ type: 'chat', peerId: this.peerId, name: this.playerName, at: this.deps.now(), text })
  }

  private appendChat(name: string, text: string): void {
    const list = this.getView('chatList')
    const item = document.createElement('div')
    item.className = 'chat__item'
    item.innerHTML = `<span class="chat__name"></span><span class="chat__text"></span>`
    item.querySelector('.chat__name')!.textContent = `${name}: `
    item.querySelector('.chat__text')!.textContent = text
    list.append(item)
    list.scrollTop = list.scrollHeight
  }

  private renderAll(): void {
    this.renderStatus()
    this.renderMoves()
    this.renderBoard()
    this.renderClocks()
  }

  private renderStatus(): void {
    this.setText('roomStatus', this.transport ? `подключено (${this.peers.size + 1} игрок/а)` : 'не подключено')
    this.setText('myColor', this.myColor === 'w' ? 'белые' : this.myColor === 'b' ? 'черные' : 'наблюдатель')
    this.setText('turn', this.position.turn === 'w' ? 'белые' : 'черные')
  }

  private renderMoves(): void {
    const list = this.getView('movesList')
    list.innerHTML = ''
    for (let i = 0; i < this.moveLog.length; i += 2) {
      const li = document.createElement('li')
      li.className = 'moves__row'
      const moveNo = Math.floor(i / 2) + 1
      const w = this.moveLog[i] ?? ''
      const b = this.moveLog[i + 1] ?? ''
      li.innerHTML = `
        <span class="moves__no">${moveNo}.</span>
        <span class="moves__move">${w}</span>
        <span class="moves__move moves__move--black">${b}</span>
      `
      list.append(li)
    }
  }

  private renderBoard(): void {
    this.boardView.render({
      position: this.position,
      selected: this.selected,
      legalTargets: this.legalTargets,
      lastMove: this.lastMove,
      perspective: this.myColor === 'b' ? 'b' : 'w',
    })
  }

  private renderClocks(): void {
    const snapshot = this.currentClocksSnapshot()
    this.setText('clockWhite', formatMs(snapshot.wMs))
    this.setText('clockBlack', formatMs(snapshot.bMs))
  }

  private currentClocksSnapshot(): { wMs: number; bMs: number } {
    if (!this.clocks.turnStartAt) return { wMs: this.clocks.wMs, bMs: this.clocks.bMs }
    const running = Math.max(0, this.deps.now() - this.clocks.turnStartAt)
    if (this.position.turn === 'w') return { wMs: Math.max(0, this.clocks.wMs - running), bMs: this.clocks.bMs }
    return { wMs: this.clocks.wMs, bMs: Math.max(0, this.clocks.bMs - running) }
  }

  private startTicker(): void {
    if (this.tickTimer) window.clearInterval(this.tickTimer)
    this.tickTimer = window.setInterval(() => {
      this.renderClocks()
      // keep presence fresh
      if (this.transport) this.hello()
    }, 1000)
  }

  private hydrateFromUrl(): void {
    const m = /room=([^&]+)/.exec(location.hash)
    if (!m) return
    const room = decodeURIComponent(m[1]!)
    const roomInput = this.getField<HTMLInputElement>('roomId')
    roomInput.value = room
    this.roomId = room
  }

  private copyRoomLink(): void {
    if (!this.roomId) {
      this.setNotice('Сначала создайте/войдите в комнату.')
      return
    }
    const url = new URL(location.href)
    url.hash = `#room=${encodeURIComponent(this.roomId)}`
    navigator.clipboard?.writeText(url.toString()).then(
      () => this.setNotice('Ссылка скопирована.'),
      () => this.setNotice('Не удалось скопировать ссылку.'),
    )
  }

  private setNotice(text: string): void {
    const el = this.getView('notice')
    el.textContent = text
  }

  private setText(view: string, text: string): void {
    this.getView(view).textContent = text
  }

  private getView(name: string): HTMLElement {
    const el = this.deps.root.querySelector<HTMLElement>(`[data-view="${name}"]`)
    if (!el) throw new Error(`Missing view: ${name}`)
    return el
  }

  private getField<T extends HTMLElement>(name: string): T {
    const el = this.deps.root.querySelector<T>(`[data-field="${name}"]`)
    if (!el) throw new Error(`Missing field: ${name}`)
    return el
  }
}

function formatMs(ms: number): string {
  const total = Math.ceil(ms / 1000)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

