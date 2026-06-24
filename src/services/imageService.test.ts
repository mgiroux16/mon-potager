import { describe, it, expect } from 'vitest'
import { computeTargetDimensions } from './imageService'

describe('computeTargetDimensions', () => {
  it('ne change rien si déjà sous la borne', () => {
    expect(computeTargetDimensions(800, 600, 1280)).toEqual({ width: 800, height: 600 })
  })

  it('réduit en préservant le ratio quand la largeur dépasse', () => {
    expect(computeTargetDimensions(2560, 1440, 1280)).toEqual({ width: 1280, height: 720 })
  })

  it('réduit en préservant le ratio quand la hauteur dépasse', () => {
    expect(computeTargetDimensions(1000, 4000, 1280)).toEqual({ width: 320, height: 1280 })
  })

  it('le plus grand côté ne dépasse jamais la borne', () => {
    const out = computeTargetDimensions(3000, 2000, 1280)
    expect(Math.max(out.width, out.height)).toBe(1280)
  })
})
