import { describe, it, expect } from 'vitest'
import { resolveMerge } from './syncMerge'

describe('resolveMerge (dernier ecrit gagne)', () => {
  it('garde la version locale si elle est plus recente', () => {
    const local = { id: 'a', name: 'local', updatedAt: 200 }
    const remote = { id: 'a', name: 'remote', updatedAt: 100 }
    expect(resolveMerge(local, remote)).toBe(local)
  })

  it('garde la version distante si elle est plus recente', () => {
    const local = { id: 'a', name: 'local', updatedAt: 100 }
    const remote = { id: 'a', name: 'remote', updatedAt: 200 }
    expect(resolveMerge(local, remote)).toBe(remote)
  })

  it("en cas d'egalite de timestamp, garde la version locale (no-op)", () => {
    const local = { id: 'a', name: 'local', updatedAt: 100 }
    const remote = { id: 'a', name: 'remote', updatedAt: 100 }
    expect(resolveMerge(local, remote)).toBe(local)
  })

  it('si local absent, le distant gagne', () => {
    const remote = { id: 'a', name: 'remote', updatedAt: 100 }
    expect(resolveMerge(undefined, remote)).toBe(remote)
  })

  it('si distant absent, le local gagne', () => {
    const local = { id: 'a', name: 'local', updatedAt: 100 }
    expect(resolveMerge(local, undefined)).toBe(local)
  })
})
