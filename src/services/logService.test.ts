import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '../data/db'
import { addLogEntry, listLog, listLogByType, updateLogEntry } from './logService'

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
})

describe('logService', () => {
  it('ajoute une entrée et renvoie son id', async () => {
    const id = await addLogEntry({ type: 'recolte', date: '2026-06-24', quantityKg: 2 })
    expect(typeof id).toBe('string')
    const all = await listLog()
    expect(all).toHaveLength(1)
    expect(all[0].quantityKg).toBe(2)
  })

  it('renseigne createdAt automatiquement si absent', async () => {
    const before = Date.now()
    await addLogEntry({ type: 'note', date: '2026-06-24', title: 'test' })
    const [entry] = await listLog()
    expect(entry.createdAt).toBeGreaterThanOrEqual(before)
  })

  it('liste le journal du plus récent au plus ancien', async () => {
    await addLogEntry({ type: 'note', date: '2026-06-01', title: 'vieux' })
    await addLogEntry({ type: 'note', date: '2026-06-24', title: 'recent' })
    const all = await listLog()
    expect(all[0].title).toBe('recent')
    expect(all[1].title).toBe('vieux')
  })

  it('filtre par type (vue dérivée)', async () => {
    await addLogEntry({ type: 'arrosage', date: '2026-06-24', volumeLiters: 30 })
    await addLogEntry({ type: 'recolte', date: '2026-06-24', quantityKg: 1 })
    await addLogEntry({ type: 'arrosage', date: '2026-06-23', volumeLiters: 20 })
    const arrosages = await listLogByType('arrosage')
    expect(arrosages).toHaveLength(2)
    expect(arrosages.every((e) => e.type === 'arrosage')).toBe(true)
  })

  it('met le statut à "valide" par défaut et conserve les champs variété/phrase', async () => {
    await addLogEntry({
      type: 'recolte',
      date: '2026-06-25',
      quantityKg: 2.4,
      varietyId: '1',
      sourcePhrase: 'Aujourd hui 2,4 kg de courgettes',
    })
    const [entry] = await listLog()
    expect(entry.status).toBe('valide')
    expect(entry.varietyId).toBe('1')
    expect(entry.sourcePhrase).toBe('Aujourd hui 2,4 kg de courgettes')
  })

  it('respecte un statut explicite', async () => {
    await addLogEntry({ type: 'note', date: '2026-06-25', status: 'brouillon' })
    const [entry] = await listLog()
    expect(entry.status).toBe('brouillon')
  })

  it('updateLogEntry met a jour la meme entree (pas de doublon), les autres restent intactes', async () => {
    const id = await addLogEntry({ type: 'arrosage', date: '2026-06-24', volumeLiters: 30 })
    await addLogEntry({ type: 'recolte', date: '2026-06-24', quantityKg: 2 })

    await updateLogEntry(id, { type: 'arrosage', date: '2026-06-25', volumeLiters: 45 })

    const all = await listLog()
    expect(all).toHaveLength(2)
    const edited = all.find((e) => e.id === id)!
    expect(edited.date).toBe('2026-06-25')
    expect(edited.volumeLiters).toBe(45)
    const other = all.find((e) => e.id !== id)!
    expect(other.quantityKg).toBe(2)
  })

  it('updateLogEntry preserve createdAt, weather et sourcePhrase non fournis', async () => {
    const id = await addLogEntry({
      type: 'observation',
      date: '2026-06-24',
      description: 'feuilles jaunes',
      sourcePhrase: 'Les tomates ont des feuilles jaunes',
    })
    const [before] = await listLog()
    await db.log.update(id, { weather: { capturedAt: 1, source: 'open-meteo', tempC: 30 } })

    await updateLogEntry(id, { type: 'observation', date: '2026-06-24', description: 'feuilles tachées' })

    const [after] = await listLog()
    expect(after.description).toBe('feuilles tachées')
    expect(after.createdAt).toBe(before.createdAt)
    expect(after.sourcePhrase).toBe('Les tomates ont des feuilles jaunes')
    expect(after.weather?.tempC).toBe(30)
  })
})
