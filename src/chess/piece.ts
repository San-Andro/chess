import type { Color, PieceType } from './types'

export type Piece = {
  readonly color: Color
  readonly type: PieceType
}

export function piece(color: Color, type: PieceType): Piece {
  return { color, type }
}

export function pieceToChar(p: Piece): string {
  const base = p.type
  return p.color === 'w' ? base.toUpperCase() : base
}

export function charToPiece(ch: string): Piece | null {
  if (!ch || ch === '.') return null
  const isUpper = ch === ch.toUpperCase()
  const type = ch.toLowerCase() as PieceType
  const color: Color = isUpper ? 'w' : 'b'
  if (!'kqrbnp'.includes(type)) return null
  return piece(color, type)
}

