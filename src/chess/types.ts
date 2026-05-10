export type Color = 'w' | 'b'
export type PieceType = 'k' | 'q' | 'r' | 'b' | 'n' | 'p'

export type File = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7
export type Rank = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7

export type Square = { file: File; rank: Rank }

export function sq(file: number, rank: number): Square {
  if (file < 0 || file > 7 || rank < 0 || rank > 7) throw new Error('Square out of bounds')
  return { file: file as File, rank: rank as Rank }
}

export function sameSquare(a: Square, b: Square): boolean {
  return a.file === b.file && a.rank === b.rank
}

export function algebraic(square: Square): string {
  const files = 'abcdefgh'
  return `${files[square.file]}${square.rank + 1}`
}

export function parseAlgebraic(coord: string): Square {
  const files = 'abcdefgh'
  const file = files.indexOf(coord[0] ?? '')
  const rank = Number(coord[1]) - 1
  return sq(file, rank)
}

export function opposite(color: Color): Color {
  return color === 'w' ? 'b' : 'w'
}

