import { describe, it, expect } from 'vitest'
import { isPointInPolygon } from './geometry'

describe('isPointInPolygon', () => {
  const square = [
    { x: 0.2, y: 0.2 },
    { x: 0.8, y: 0.2 },
    { x: 0.8, y: 0.8 },
    { x: 0.2, y: 0.8 },
  ]

  it('detecte un point a l interieur', () => {
    expect(isPointInPolygon({ x: 0.5, y: 0.5 }, square)).toBe(true)
  })

  it('detecte un point a l exterieur', () => {
    expect(isPointInPolygon({ x: 0.1, y: 0.1 }, square)).toBe(false)
  })

  it('detecte un point a l exterieur sur un polygone non rectangulaire', () => {
    const triangle = [
      { x: 0.1, y: 0.9 },
      { x: 0.9, y: 0.9 },
      { x: 0.5, y: 0.1 },
    ]
    expect(isPointInPolygon({ x: 0.5, y: 0.8 }, triangle)).toBe(true)
    expect(isPointInPolygon({ x: 0.1, y: 0.1 }, triangle)).toBe(false)
  })

  it('renvoie false pour un polygone avec moins de 3 points', () => {
    expect(isPointInPolygon({ x: 0.5, y: 0.5 }, [{ x: 0, y: 0 }, { x: 1, y: 1 }])).toBe(false)
  })
})
