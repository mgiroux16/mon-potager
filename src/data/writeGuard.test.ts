import { beforeEach, describe, expect, it } from 'vitest'
import {
  registerWrites,
  canWrite,
  isTripped,
  resetWriteGuard,
  WRITE_GUARD_LIMIT,
} from './writeGuard'

describe('writeGuard', () => {
  beforeEach(() => {
    localStorage.clear()
    resetWriteGuard()
  })

  it('autorise les ecritures sous le seuil', () => {
    registerWrites(10)
    expect(canWrite()).toBe(true)
    expect(isTripped()).toBe(false)
  })

  it('coupe au-dela du seuil et persiste le drapeau', () => {
    registerWrites(WRITE_GUARD_LIMIT + 1)
    expect(canWrite()).toBe(false)
    expect(isTripped()).toBe(true)
    expect(localStorage.getItem('writeGuard:trippedOn')).not.toBeNull()
  })

  it('reste coupe apres rechargement le meme jour (drapeau relu depuis localStorage)', () => {
    localStorage.setItem('writeGuard:trippedOn', new Date().toISOString().slice(0, 10))
    expect(canWrite()).toBe(false)
  })

  it('se rearme automatiquement le jour suivant', () => {
    localStorage.setItem('writeGuard:trippedOn', '2020-01-01')
    expect(canWrite()).toBe(true)
    expect(localStorage.getItem('writeGuard:trippedOn')).toBeNull()
  })

  it('resetWriteGuard rearme manuellement', () => {
    registerWrites(WRITE_GUARD_LIMIT + 1)
    resetWriteGuard()
    expect(canWrite()).toBe(true)
  })
})
