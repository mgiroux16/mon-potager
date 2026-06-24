import { describe, it, expect } from 'vitest'

describe('outillage de test', () => {
  it('exécute un test trivial', () => {
    expect(1 + 1).toBe(2)
  })

  it('expose indexedDB (fake-indexeddb)', () => {
    expect(typeof indexedDB).not.toBe('undefined')
  })
})
