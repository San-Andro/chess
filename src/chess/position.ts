import type { Piece } from './piece'
import { charToPiece, pieceToChar } from './piece'
import type { Color, Square } from './types'
import { algebraic, opposite, parseAlgebraic, sq } from './types'

export type CastlingRights = {
  wK: boolean
  wQ: boolean
  bK: boolean
  bQ: boolean
}

export type PositionState = {
  board: (Piece | null)[][]
  turn: Color
  castling: CastlingRights
  enPassant: Square | null
  halfmoveClock: number
  fullmoveNumber: number
}

export class Position {
  private readonly state: PositionState

  private constructor(state: PositionState) {
    this.state = state
  }

  static start(): Position {
    // FEN-like start position for simplicity
    return Position.fromFEN('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1')
  }

  static fromFEN(fen: string): Position {
    const [placement, turn, castling, ep, halfmove, fullmove] = fen.trim().split(/\s+/)
    if (!placement || !turn || !castling || !ep) throw new Error('Bad FEN')

    const rows = placement.split('/')
    if (rows.length !== 8) throw new Error('Bad FEN rows')

    const board: (Piece | null)[][] = Array.from({ length: 8 }, () => Array.from({ length: 8 }, () => null))

    rows.forEach((row, fenRank) => {
      let file = 0
      for (const ch of row) {
        if (/\d/.test(ch)) {
          file += Number(ch)
          continue
        }
        const p = charToPiece(ch)
        if (!p) throw new Error('Bad piece char')
        board[7 - fenRank][file] = p
        file += 1
      }
      if (file !== 8) throw new Error('Bad row width')
    })

    const rights: CastlingRights = {
      wK: castling.includes('K'),
      wQ: castling.includes('Q'),
      bK: castling.includes('k'),
      bQ: castling.includes('q'),
    }

    const enPassant = ep === '-' ? null : parseAlgebraic(ep)

    return new Position({
      board,
      turn: turn === 'w' ? 'w' : 'b',
      castling: rights,
      enPassant,
      halfmoveClock: Number(halfmove ?? 0) || 0,
      fullmoveNumber: Number(fullmove ?? 1) || 1,
    })
  }

  toFEN(): string {
    const rows: string[] = []
    for (let rank = 7; rank >= 0; rank--) {
      let row = ''
      let empties = 0
      for (let file = 0; file < 8; file++) {
        const p = this.state.board[rank][file]
        if (!p) {
          empties++
          continue
        }
        if (empties) {
          row += String(empties)
          empties = 0
        }
        row += pieceToChar(p)
      }
      if (empties) row += String(empties)
      rows.push(row)
    }

    const castling =
      (this.state.castling.wK ? 'K' : '') +
      (this.state.castling.wQ ? 'Q' : '') +
      (this.state.castling.bK ? 'k' : '') +
      (this.state.castling.bQ ? 'q' : '') ||
      '-'

    const ep = this.state.enPassant ? algebraic(this.state.enPassant) : '-'
    return `${rows.join('/')} ${this.state.turn} ${castling} ${ep} ${this.state.halfmoveClock} ${this.state.fullmoveNumber}`
  }

  get turn(): Color {
    return this.state.turn
  }

  get castling(): CastlingRights {
    return { ...this.state.castling }
  }

  get enPassant(): Square | null {
    return this.state.enPassant ? { ...this.state.enPassant } : null
  }

  get halfmoveClock(): number {
    return this.state.halfmoveClock
  }

  get fullmoveNumber(): number {
    return this.state.fullmoveNumber
  }

  pieceAt(square: Square): Piece | null {
    return this.state.board[square.rank][square.file]
  }

  withPiece(square: Square, p: Piece | null): Position {
    const next = this.cloneState()
    next.board[square.rank][square.file] = p
    return new Position(next)
  }

  withTurn(turn: Color): Position {
    const next = this.cloneState()
    next.turn = turn
    return new Position(next)
  }

  withCastling(castling: CastlingRights): Position {
    const next = this.cloneState()
    next.castling = { ...castling }
    return new Position(next)
  }

  withEnPassant(square: Square | null): Position {
    const next = this.cloneState()
    next.enPassant = square ? { ...square } : null
    return new Position(next)
  }

  withClocks(halfmoveClock: number, fullmoveNumber: number): Position {
    const next = this.cloneState()
    next.halfmoveClock = halfmoveClock
    next.fullmoveNumber = fullmoveNumber
    return new Position(next)
  }

  findKing(color: Color): Square {
    for (let rank = 0; rank < 8; rank++) {
      for (let file = 0; file < 8; file++) {
        const p = this.state.board[rank][file]
        if (p && p.color === color && p.type === 'k') return sq(file, rank)
      }
    }
    throw new Error('King not found')
  }

  allPieces(): Array<{ square: Square; piece: Piece }> {
    const out: Array<{ square: Square; piece: Piece }> = []
    for (let rank = 0; rank < 8; rank++) {
      for (let file = 0; file < 8; file++) {
        const p = this.state.board[rank][file]
        if (p) out.push({ square: sq(file, rank), piece: p })
      }
    }
    return out
  }

  advanceTurn(): Position {
    const nextTurn = opposite(this.state.turn)
    const nextFullmove = this.state.turn === 'b' ? this.state.fullmoveNumber + 1 : this.state.fullmoveNumber
    return this.withTurn(nextTurn).withClocks(this.state.halfmoveClock, nextFullmove)
  }

  private cloneState(): PositionState {
    return {
      board: this.state.board.map((r) => r.slice()),
      turn: this.state.turn,
      castling: { ...this.state.castling },
      enPassant: this.state.enPassant ? { ...this.state.enPassant } : null,
      halfmoveClock: this.state.halfmoveClock,
      fullmoveNumber: this.state.fullmoveNumber,
    }
  }
}

