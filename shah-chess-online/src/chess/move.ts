import type { PieceType, Square } from './types'

export type Move = {
  from: Square
  to: Square
  promotion?: Exclude<PieceType, 'p' | 'k'>
}

export type MoveMeta = {
  isCapture: boolean
  isEnPassant: boolean
  isCastle: boolean
  givesCheck: boolean
  notation: string
}

