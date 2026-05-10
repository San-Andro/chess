import type { Position } from '../../chess/position'
import type { Color, Square } from '../../chess/types'
import { sameSquare, sq } from '../../chess/types'
import type { Piece } from '../../chess/piece'

type Props = {
  position: Position
  selected: Square | null
  legalTargets: Square[]
  lastMove: { from: Square; to: Square } | null
  perspective: Color
}

type Deps = {
  onSquareClick: (square: Square) => void
}

export class BoardView {
  private readonly root: HTMLElement
  private readonly deps: Deps
  private squares: HTMLButtonElement[] = []

  constructor(root: HTMLElement, deps: Deps) {
    this.root = root
    this.deps = deps
    this.root.classList.add('board')
    this.build()
  }

  render(props: Props): void {
    const order = this.squareOrder(props.perspective)
    for (let i = 0; i < order.length; i++) {
      const square = order[i]!
      const btn = this.squares[i]!
      const p = props.position.pieceAt(square)

      btn.classList.toggle('board__square--selected', !!props.selected && sameSquare(props.selected, square))
      btn.classList.toggle('board__square--legal', props.legalTargets.some((t) => sameSquare(t, square)))

      const isLast =
        props.lastMove &&
        (sameSquare(props.lastMove.from, square) || sameSquare(props.lastMove.to, square))
      btn.classList.toggle('board__square--last', Boolean(isLast))

      btn.querySelector<HTMLElement>('[data-piece]')!.textContent = p ? pieceGlyph(p) : ''
    }
  }

  private build(): void {
    this.root.innerHTML = ''
    this.root.setAttribute('role', 'grid')
    this.squares = []

    // Create fixed 64 nodes and only update classes/text (fast + simple).
    for (let i = 0; i < 64; i++) {
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = 'board__square'
      btn.innerHTML = `<span class="board__piece" data-piece></span>`
      btn.addEventListener('click', () => {
        const file = Number(btn.dataset.file)
        const rank = Number(btn.dataset.rank)
        this.deps.onSquareClick(sq(file, rank))
      })
      this.squares.push(btn)
      this.root.append(btn)
    }
  }

  private squareOrder(perspective: Color): Square[] {
    const squares: Square[] = []
    const ranks = perspective === 'w' ? [7, 6, 5, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, 5, 6, 7]
    const files = perspective === 'w' ? [0, 1, 2, 3, 4, 5, 6, 7] : [7, 6, 5, 4, 3, 2, 1, 0]

    for (const r of ranks) {
      for (const f of files) {
        squares.push(sq(f, r))
      }
    }

    for (let i = 0; i < 64; i++) {
      const s = squares[i]!
      const btn = this.squares[i]!
      btn.dataset.file = String(s.file)
      btn.dataset.rank = String(s.rank)
      const dark = (s.file + s.rank) % 2 === 1
      btn.classList.toggle('board__square--dark', dark)
      btn.classList.toggle('board__square--light', !dark)
      btn.setAttribute('aria-label', `Клетка ${'abcdefgh'[s.file]}${s.rank + 1}`)
    }

    return squares
  }
}

function pieceGlyph(p: Piece): string {
  // Unicode chess glyphs: white/black pieces
  const map: Record<string, string> = {
    wk: '♔',
    wq: '♕',
    wr: '♖',
    wb: '♗',
    wn: '♘',
    wp: '♙',
    bk: '♚',
    bq: '♛',
    br: '♜',
    bb: '♝',
    bn: '♞',
    bp: '♟',
  }
  return map[`${p.color}${p.type}`] ?? '?'
}

