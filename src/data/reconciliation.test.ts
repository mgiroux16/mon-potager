import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({
  localRows: new Map<string, Record<string, unknown>[]>(),
  serverRows: new Map<string, Record<string, unknown>[]>(),
  pushRecordsCalls: [] as { uid: string; table: string; items: unknown[] }[],
}))

vi.mock('./db', () => ({
  db: {
    table: (name: string) => ({
      toArray: async () => h.localRows.get(name) ?? [],
    }),
  },
}))

vi.mock('./syncHooks', () => ({
  withMaintenanceMode: async <T>(fn: () => Promise<T>) => fn(),
}))

vi.mock('./firestoreClient', () => ({
  fetchAllRecords: async (_uid: string, table: string) => h.serverRows.get(table) ?? [],
  pushRecords: async (
    uid: string,
    table: string,
    items: { id: string; data: Record<string, unknown> }[],
  ) => {
    h.pushRecordsCalls.push({ uid, table, items })
    // Simule l'ecriture reelle : les lignes poussees deviennent visibles au prochain
    // fetchAllRecords, comme sur un vrai Firestore.
    const existing = h.serverRows.get(table) ?? []
    const byId = new Map(existing.map((r) => [r.id as string, r]))
    for (const { id, data } of items) byId.set(id, data)
    h.serverRows.set(table, [...byId.values()])
  },
}))

import { buildReconciliationReport, pushMissingRecords, reconcileTable, reconcileAll, SYNCED_TABLES } from './reconciliation'

beforeEach(() => {
  h.localRows.clear()
  h.serverRows.clear()
  h.pushRecordsCalls.length = 0
})

describe('buildReconciliationReport', () => {
  it('compare les ensembles d\'ID local/serveur, pas seulement les comptes', async () => {
    h.localRows.set('log', [
      { id: 'a', type: 'note' },
      { id: 'b', type: 'note' },
      { id: 'c', type: 'note', deletedAt: 123 },
    ])
    h.serverRows.set('log', [
      { id: 'a', type: 'note' },
      { id: 'z', type: 'note' },
    ])

    const report = await buildReconciliationReport('alice', 'log')

    expect(report.localActive).toBe(2)
    expect(report.localTombstoned).toBe(1)
    expect(report.serverTotal).toBe(2)
    expect(report.serverActive).toBe(2)
    expect(report.serverTombstoned).toBe(0)
    // 'b' et 'c' sont locaux et absents du serveur, meme si les comptes (3 vs 2)
    // ne le montrent pas directement.
    expect(report.localOnlyIds.sort()).toEqual(['b', 'c'])
    expect(report.serverOnlyIds).toEqual(['z'])
    expect(report.pushedIds).toEqual([])
  })

  it('ne signale aucun ecart quand les ensembles sont identiques', async () => {
    h.localRows.set('log', [{ id: 'a' }])
    h.serverRows.set('log', [{ id: 'a' }])

    const report = await buildReconciliationReport('alice', 'log')

    expect(report.localOnlyIds).toEqual([])
    expect(report.serverOnlyIds).toEqual([])
  })
})

describe('pushMissingRecords', () => {
  it('pousse uniquement les lignes locales absentes du serveur, telles quelles', async () => {
    h.localRows.set('log', [
      { id: 'a', type: 'note' },
      { id: 'b', type: 'note', deletedAt: 999 },
    ])

    const pushed = await pushMissingRecords('alice', 'log', ['b'])

    expect(pushed).toEqual(['b'])
    expect(h.pushRecordsCalls).toHaveLength(1)
    expect(h.pushRecordsCalls[0]).toEqual({
      uid: 'alice',
      table: 'log',
      items: [{ id: 'b', data: { id: 'b', type: 'note', deletedAt: 999 } }],
    })
  })

  it('ne recree pas un tombstone : le champ deletedAt est preserve dans le push', async () => {
    h.localRows.set('log', [{ id: 'b', deletedAt: 42 }])

    await pushMissingRecords('alice', 'log', ['b'])

    const pushedItem = h.pushRecordsCalls[0].items[0] as { data: Record<string, unknown> }
    expect(pushedItem.data.deletedAt).toBe(42)
  })

  it("n'appelle pas pushRecords si la liste d'ID est vide", async () => {
    const pushed = await pushMissingRecords('alice', 'log', [])
    expect(pushed).toEqual([])
    expect(h.pushRecordsCalls).toHaveLength(0)
  })
})

describe('reconcileTable', () => {
  it('pousse les orphelins locaux puis renvoie un rapport final sans ecart', async () => {
    h.localRows.set('log', [{ id: 'a' }, { id: 'b' }])
    h.serverRows.set('log', [{ id: 'a' }])

    const report = await reconcileTable('alice', 'log')

    expect(h.pushRecordsCalls).toHaveLength(1)
    expect(report.pushedIds).toEqual(['b'])
    // Rapport final : recalcule apres push, donc plus d'ecart local-only.
    expect(report.localOnlyIds).toEqual([])
  })

  it("ne pousse rien et ne refait pas de lecture serveur si rien n'est en ecart", async () => {
    h.localRows.set('log', [{ id: 'a' }])
    h.serverRows.set('log', [{ id: 'a' }])

    const report = await reconcileTable('alice', 'log')

    expect(h.pushRecordsCalls).toHaveLength(0)
    expect(report.pushedIds).toEqual([])
    expect(report.localOnlyIds).toEqual([])
  })
})

describe('reconcileAll', () => {
  it('parcourt toutes les tables synchronisees', async () => {
    for (const table of SYNCED_TABLES) {
      h.localRows.set(table, [{ id: `${table}-1` }])
      h.serverRows.set(table, [{ id: `${table}-1` }])
    }

    const reports = await reconcileAll('alice')

    expect(reports.map((r) => r.table)).toEqual(SYNCED_TABLES)
    expect(SYNCED_TABLES).not.toContain('auditLog')
  })
})
