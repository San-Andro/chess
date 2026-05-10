import type { Piece } from '../piece'
import { piece } from '../piece'
import type { Move, MoveMeta } from '../move'
import { Position } from '../position'
import type { CastlingRights } from '../position'
import type { Color, PieceType, Square } from '../types'
import { algebraic, opposite, sameSquare, sq } from '../types'

type GeneratedMove = Move & { isEnPassant?: boolean; isCastle?: 'K' | 'Q' }

export class StandardRules {
  legalMovesFrom(position: Position, from: Square): Move[] {
    const p = position.pieceAt(from)
    if (!p) return []
    if (p.color !== position.turn) return []

    const pseudo = this.pseudoMovesFrom(position, from, p)
    return pseudo
      .map((m) => ({ from: m.from, to: m.to, promotion: m.promotion }))
      .filter((m) => this.isLegal(position, m))
  }

  isLegal(position: Position, move: Move): boolean {
    const next = this.applyMove(position, move).position
    return !this.isInCheck(next, opposite(next.turn))
  }

  isInCheck(position: Position, color: Color): boolean {
    const king = position.findKing(color)
    const enemy = opposite(color)
    return this.isSquareAttacked(position, king, enemy)
  }

  applyMove(position: Position, move: Move): { position: Position; meta: MoveMeta } {
    const p = position.pieceAt(move.from)
    if (!p) throw new Error('No piece on from')
    if (p.color !== position.turn) throw new Error('Not your turn')

    const generated = this.pseudoMovesFrom(position, move.from, p).find((m) => this.sameMove(m, move))
    if (!generated) throw new Error('Illegal move (pseudo)')

    const { nextPosition, isCapture, isEnPassant, isCastle } = this.applyPseudo(position, p, generated)

    const givesCheck = this.isInCheck(nextPosition, nextPosition.turn)
    const notation = this.notationFor(p, generated, { isCapture, isEnPassant, isCastle, givesCheck })

    return {
      position: nextPosition,
      meta: {
        isCapture,
        isEnPassant,
        isCastle: Boolean(isCastle),
        givesCheck,
        notation,
      },
    }
  }

  private applyPseudo(
    position: Position,
    p: Piece,
    move: GeneratedMove,
  ): { nextPosition: Position; isCapture: boolean; isEnPassant: boolean; isCastle: boolean } {
    let next = position

    const targetPiece = position.pieceAt(move.to)
    let isCapture = Boolean(targetPiece)
    let isEnPassant = Boolean(move.isEnPassant)
    const isCastle = Boolean(move.isCastle)

    // Reset en passant unless we set it again.
    next = next.withEnPassant(null)

    // Halfmove clock (simple version)
    const resetHalfmove = p.type === 'p' || isCapture || isEnPassant
    const halfmoveClock = resetHalfmove ? 0 : position.halfmoveClock + 1

    // Move piece off from
    next = next.withPiece(move.from, null)

    // En-passant capture removes pawn behind the target square.
    if (move.isEnPassant) {
      const dir = p.color === 'w' ? -1 : 1
      const captured = sq(move.to.file, move.to.rank + dir)
      next = next.withPiece(captured, null)
      isCapture = true
    }

    // Castling moves rook as well.
    if (move.isCastle) {
      const rank = p.color === 'w' ? 0 : 7
      if (move.isCastle === 'K') {
        // King: e -> g, rook: h -> f
        next = next.withPiece(sq(7, rank), null)
        next = next.withPiece(sq(5, rank), piece(p.color, 'r'))
      } else {
        // King: e -> c, rook: a -> d
        next = next.withPiece(sq(0, rank), null)
        next = next.withPiece(sq(3, rank), piece(p.color, 'r'))
      }
    }

    // Promotion (default to queen if missing)
    let placed = p
    if (p.type === 'p' && (move.to.rank === 7 || move.to.rank === 0)) {
      placed = piece(p.color, move.promotion ?? 'q')
    }
    next = next.withPiece(move.to, placed)

    // Update castling rights
    const castling = this.updatedCastling(position, p, move, isCapture || isEnPassant)
    next = next.withCastling(castling)

    // Set en-passant square after double pawn push.
    if (p.type === 'p' && Math.abs(move.to.rank - move.from.rank) === 2) {
      const midRank = (move.to.rank + move.from.rank) / 2
      next = next.withEnPassant(sq(move.from.file, midRank))
    }

    // Turn advance and clocks
    const nextFullmove = position.turn === 'b' ? position.fullmoveNumber + 1 : position.fullmoveNumber
    next = next.withClocks(halfmoveClock, nextFullmove).advanceTurn()

    return { nextPosition: next, isCapture, isEnPassant, isCastle }
  }

  private updatedCastling(position: Position, p: Piece, move: GeneratedMove, didCapture: boolean): CastlingRights {
    const rights = position.castling
    const next: CastlingRights = { ...rights }

    const from = move.from
    const to = move.to

    // King move loses both rights
    if (p.type === 'k') {
      if (p.color === 'w') {
        next.wK = false
        next.wQ = false
      } else {
        next.bK = false
        next.bQ = false
      }
    }

    // Rook move loses corresponding right
    if (p.type === 'r') {
      if (p.color === 'w' && from.rank === 0) {
        if (from.file === 0) next.wQ = false
        if (from.file === 7) next.wK = false
      }
      if (p.color === 'b' && from.rank === 7) {
        if (from.file === 0) next.bQ = false
        if (from.file === 7) next.bK = false
      }
    }

    // Capturing opponent rook on its home square also removes rights
    if (didCapture) {
      if (to.rank === 0 && to.file === 0) next.wQ = false
      if (to.rank === 0 && to.file === 7) next.wK = false
      if (to.rank === 7 && to.file === 0) next.bQ = false
      if (to.rank === 7 && to.file === 7) next.bK = false
    }

    return next
  }

  private pseudoMovesFrom(position: Position, from: Square, p: Piece): GeneratedMove[] {
    const out: GeneratedMove[] = []
    const dir = p.color === 'w' ? 1 : -1

    const push = (to: Square, extra?: Partial<GeneratedMove>) => out.push({ from, to, ...extra })
    const inBounds = (file: number, rank: number) => file >= 0 && file < 8 && rank >= 0 && rank < 8
    const at = (file: number, rank: number) => position.pieceAt(sq(file, rank))
    const empty = (file: number, rank: number) => !at(file, rank)
    const enemyAt = (file: number, rank: number) => {
      const t = at(file, rank)
      return t && t.color !== p.color
    }

    const slide = (df: number, dr: number) => {
      let f = from.file + df
      let r = from.rank + dr
      while (inBounds(f, r)) {
        const t = at(f, r)
        if (!t) {
          push(sq(f, r))
        } else {
          if (t.color !== p.color) push(sq(f, r))
          break
        }
        f += df
        r += dr
      }
    }

    switch (p.type) {
      case 'p': {
        // Forward moves
        const oneRank = from.rank + dir
        if (inBounds(from.file, oneRank) && empty(from.file, oneRank)) {
          push(sq(from.file, oneRank), this.pawnPromo(oneRank))
          // Double move
          const startRank = p.color === 'w' ? 1 : 6
          const twoRank = from.rank + dir * 2
          if (from.rank === startRank && inBounds(from.file, twoRank) && empty(from.file, twoRank)) {
            push(sq(from.file, twoRank))
          }
        }
        // Captures
        for (const df of [-1, 1]) {
          const f = from.file + df
          const r = from.rank + dir
          if (!inBounds(f, r)) continue
          if (enemyAt(f, r)) push(sq(f, r), this.pawnPromo(r))
        }
        // En passant
        const ep = position.enPassant
        if (ep) {
          const canTake =
            ep.rank === from.rank + dir &&
            Math.abs(ep.file - from.file) === 1
          if (canTake) push(ep, { isEnPassant: true })
        }
        break
      }
      case 'n': {
        const jumps = [
          [1, 2],
          [2, 1],
          [-1, 2],
          [-2, 1],
          [1, -2],
          [2, -1],
          [-1, -2],
          [-2, -1],
        ]
        for (const [df, dr] of jumps) {
          const f = from.file + df
          const r = from.rank + dr
          if (!inBounds(f, r)) continue
          const t = at(f, r)
          if (!t || t.color !== p.color) push(sq(f, r))
        }
        break
      }
      case 'b':
        slide(1, 1)
        slide(1, -1)
        slide(-1, 1)
        slide(-1, -1)
        break
      case 'r':
        slide(1, 0)
        slide(-1, 0)
        slide(0, 1)
        slide(0, -1)
        break
      case 'q':
        slide(1, 0)
        slide(-1, 0)
        slide(0, 1)
        slide(0, -1)
        slide(1, 1)
        slide(1, -1)
        slide(-1, 1)
        slide(-1, -1)
        break
      case 'k': {
        for (const df of [-1, 0, 1]) {
          for (const dr of [-1, 0, 1]) {
            if (df === 0 && dr === 0) continue
            const f = from.file + df
            const r = from.rank + dr
            if (!inBounds(f, r)) continue
            const t = at(f, r)
            if (!t || t.color !== p.color) push(sq(f, r))
          }
        }

        // Castling (pseudo; legality includes check constraints below)
        const rank = p.color === 'w' ? 0 : 7
        if (from.file === 4 && from.rank === rank) {
          const rights = position.castling
          const enemy = opposite(p.color)

          // King-side
          const kingSideAllowed = p.color === 'w' ? rights.wK : rights.bK
          if (
            kingSideAllowed &&
            empty(5, rank) &&
            empty(6, rank) &&
            !this.isSquareAttacked(position, sq(4, rank), enemy) &&
            !this.isSquareAttacked(position, sq(5, rank), enemy) &&
            !this.isSquareAttacked(position, sq(6, rank), enemy)
          ) {
            push(sq(6, rank), { isCastle: 'K' })
          }

          // Queen-side
          const queenSideAllowed = p.color === 'w' ? rights.wQ : rights.bQ
          if (
            queenSideAllowed &&
            empty(3, rank) &&
            empty(2, rank) &&
            empty(1, rank) &&
            !this.isSquareAttacked(position, sq(4, rank), enemy) &&
            !this.isSquareAttacked(position, sq(3, rank), enemy) &&
            !this.isSquareAttacked(position, sq(2, rank), enemy)
          ) {
            push(sq(2, rank), { isCastle: 'Q' })
          }
        }

        break
      }
      default:
        break
    }

    return out
  }

  private pawnPromo(rank: number): Partial<GeneratedMove> {
    if (rank === 7 || rank === 0) return { promotion: 'q' }
    return {}
  }

  private isSquareAttacked(position: Position, square: Square, by: Color): boolean {
    const pieces = position.allPieces().filter((x) => x.piece.color === by)
    for (const { square: from, piece: p } of pieces) {
      if (p.type === 'k') {
        for (const df of [-1, 0, 1]) {
          for (const dr of [-1, 0, 1]) {
            if (df === 0 && dr === 0) continue
            const f = from.file + df
            const r = from.rank + dr
            if (f === square.file && r === square.rank) return true
          }
        }
        continue
      }

      if (p.type === 'p') {
        const dir = p.color === 'w' ? 1 : -1
        const targets = [
          { file: from.file - 1, rank: from.rank + dir },
          { file: from.file + 1, rank: from.rank + dir },
        ]
        if (targets.some((t) => t.file === square.file && t.rank === square.rank)) return true
        continue
      }

      // Other pieces: reuse pseudo move gen and see if they can land on the square.
      const pseudo = this.pseudoMovesFrom(position.withTurn(by), from, p)
      if (pseudo.some((m) => sameSquare(m.to, square))) return true
    }
    return false
  }

  private notationFor(
    p: Piece,
    move: GeneratedMove,
    info: { isCapture: boolean; isEnPassant: boolean; isCastle: boolean; givesCheck: boolean },
  ): string {
    if (move.isCastle === 'K') return `O-O${info.givesCheck ? '+' : ''}`
    if (move.isCastle === 'Q') return `O-O-O${info.givesCheck ? '+' : ''}`

    const to = algebraic(move.to)
    const capture = info.isCapture ? 'x' : ''

    if (p.type === 'p') {
      const fromFile = 'abcdefgh'[move.from.file]
      const pawnPart = info.isCapture ? `${fromFile}${capture}${to}` : to
      const promo = move.promotion ? `=${move.promotion.toUpperCase()}` : ''
      const ep = info.isEnPassant ? ' e.p.' : ''
      return `${pawnPart}${promo}${info.givesCheck ? '+' : ''}${ep}`
    }

    const letterMap: Record<Exclude<PieceType, 'p'>, string> = {
      k: 'K',
      q: 'Q',
      r: 'R',
      b: 'B',
      n: 'N',
    }

    const pieceLetter = letterMap[p.type as Exclude<PieceType, 'p'>]
    return `${pieceLetter}${capture}${to}${info.givesCheck ? '+' : ''}`
  }

  private sameMove(a: GeneratedMove, b: Move): boolean {
    return sameSquare(a.from, b.from) && sameSquare(a.to, b.to) && (a.promotion ?? undefined) === (b.promotion ?? undefined)
  }
}

