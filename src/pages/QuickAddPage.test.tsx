import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { db, newId } from '../data/db'
import { listLog } from '../services/logService'
import { findOrCreateVariety } from '../services/varietyService'
import { QuickAddPage } from './QuickAddPage'

vi.mock('../services/imageService', () => ({
  compressImage: vi.fn(async () => 'data:image/jpeg;base64,COMPRESSED'),
}))

vi.mock('../services/weatherService', () => ({
  fetchTodaySnapshot: vi.fn(async () => ({ capturedAt: 1_700_000_000_000, source: 'open-meteo', tempC: 36.3, tempMaxC: 40.6, tempMinC: 26.4, rainMm: 0 })),
  fetchDailyHistory: vi.fn(async () => null),
  __clearWeatherCache: vi.fn(),
}))

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
})

describe('QuickAddPage', () => {
  it('ajoute un arrosage via la tuile dédiée', async () => {
    await db.parcels.add({ id: newId(), name: 'Planche test' })
    render(
      <MemoryRouter>
        <QuickAddPage />
      </MemoryRouter>,
    )
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: 'Arrosage' }))

    await user.click(await screen.findByLabelText('Planche test'))
    await user.type(screen.getByLabelText('Volume (litres)'), '30')
    await user.click(screen.getByRole('button', { name: 'Valider' }))

    await waitFor(async () => {
      const all = await listLog()
      expect(all).toHaveLength(1)
    })
    const [entry] = await listLog()
    expect(entry.type).toBe('arrosage')
    expect(entry.volumeLiters).toBe(30)
    expect(entry.parcelId).toBeDefined()
  })

  it('permet de tracer un arrosage sur plusieurs parcelles (goutte-à-goutte commun), sans volume', async () => {
    await db.parcels.add({ id: newId(), name: 'Planche A' })
    await db.parcels.add({ id: newId(), name: 'Planche B' })
    render(
      <MemoryRouter>
        <QuickAddPage />
      </MemoryRouter>,
    )
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: 'Arrosage' }))

    await user.click(await screen.findByLabelText('Planche A'))
    await user.click(screen.getByLabelText('Planche B'))
    await user.click(screen.getByRole('button', { name: 'Valider' }))

    await waitFor(async () => {
      const all = await listLog()
      expect(all).toHaveLength(1)
    })
    const [entry] = await listLog()
    expect(entry.type).toBe('arrosage')
    expect(entry.volumeLiters).toBeUndefined()
    expect(entry.parcelId).toBeUndefined()
    expect(entry.parcelIds).toHaveLength(2)
  })

  it('enregistre durationMinutes independamment du volume sur une entree arrosage', async () => {
    await db.parcels.add({ id: newId(), name: 'Planche test' })
    render(
      <MemoryRouter>
        <QuickAddPage />
      </MemoryRouter>,
    )
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: 'Arrosage' }))

    await user.click(await screen.findByLabelText('Planche test'))
    await user.type(screen.getByLabelText('Volume (litres)'), '10')
    await user.type(screen.getByLabelText('Durée (minutes)'), '15')
    await user.click(screen.getByRole('button', { name: 'Valider' }))

    await waitFor(async () => {
      const all = await listLog()
      expect(all).toHaveLength(1)
    })
    const [entry] = await listLog()
    expect(entry.volumeLiters).toBe(10)
    expect(entry.durationMinutes).toBe(15)
  })

  it('permet de saisir la duree seule, sans volume', async () => {
    await db.parcels.add({ id: newId(), name: 'Planche test' })
    render(
      <MemoryRouter>
        <QuickAddPage />
      </MemoryRouter>,
    )
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: 'Arrosage' }))

    await user.click(await screen.findByLabelText('Planche test'))
    await user.type(screen.getByLabelText('Durée (minutes)'), '20')
    await user.click(screen.getByRole('button', { name: 'Valider' }))

    await waitFor(async () => {
      const all = await listLog()
      expect(all).toHaveLength(1)
    })
    const [entry] = await listLog()
    expect(entry.durationMinutes).toBe(20)
    expect(entry.volumeLiters).toBeUndefined()
  })

  it('attache une photo compressée à l\'entrée enregistrée', async () => {
    render(
      <MemoryRouter>
        <QuickAddPage />
      </MemoryRouter>,
    )
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: 'Observation' }))
    await user.upload(
      screen.getByLabelText('Ajouter une photo'),
      new File(['x'], 'photo.jpg', { type: 'image/jpeg' }),
    )
    await screen.findByRole('img')
    await user.click(screen.getByRole('button', { name: 'Valider' }))

    await waitFor(async () => {
      const all = await listLog()
      expect(all).toHaveLength(1)
    })
    const [entry] = await listLog()
    expect(entry.photoUrls).toEqual(['data:image/jpeg;base64,COMPRESSED'])
  })

  it('fige le snapshot météo du jour sur une entrée datée aujourd hui', async () => {
    render(
      <MemoryRouter>
        <QuickAddPage />
      </MemoryRouter>,
    )
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: 'Observation' }))
    await user.type(screen.getByLabelText('Description'), 'feuilles flétries')
    await user.click(screen.getByRole('button', { name: 'Valider' }))

    await waitFor(async () => {
      const all = await db.log.toArray()
      const saved = all.find((e) => e.description === 'feuilles flétries')
      expect(saved?.weather?.tempC).toBe(36.3)
      expect(saved?.weather?.source).toBe('open-meteo')
    })
  })
})

describe('QuickAddPage avec brouillon vocal', () => {
  async function seedVoice() {
    await db.parcels.add({ id: '1', name: 'Parcelle A' })
    await db.crops.add({ id: '10', name: 'Tomates', status: 'en_place' })
  }

  it('ouvre EntryForm prerempli (type + volume) depuis le router state', async () => {
    await seedVoice()
    render(
      <MemoryRouter
        initialEntries={[
          {
            pathname: '/ajouter',
            state: { voiceDraft: { type: 'arrosage', volumeLiters: 10, parcelId: '1', cropId: '10' } },
          },
        ]}
      >
        <QuickAddPage />
      </MemoryRouter>,
    )

    expect(await screen.findByRole('heading', { name: 'Arrosage' })).toBeInTheDocument()
    expect(screen.getByLabelText('Volume (litres)')).toHaveValue(10)
    expect(screen.getByLabelText('Parcelle A')).toBeChecked()
    expect(screen.getByLabelText('Culture')).toBeInTheDocument()
  })

  it('valide une entree avec parcelId ET cropId', async () => {
    await seedVoice()
    const user = userEvent.setup()
    render(
      <MemoryRouter
        initialEntries={[
          {
            pathname: '/ajouter',
            state: { voiceDraft: { type: 'arrosage', volumeLiters: 10, parcelId: '1', cropId: '10' } },
          },
        ]}
      >
        <QuickAddPage />
      </MemoryRouter>,
    )

    await user.click(await screen.findByRole('button', { name: 'Valider' }))

    await waitFor(async () => {
      const entries = await listLog()
      expect(entries).toHaveLength(1)
      expect(entries[0].parcelId).toBe('1')
      expect(entries[0].cropId).toBe('10')
      expect(entries[0].volumeLiters).toBe(10)
    })
  })

  it('affiche la phrase dictee quand le brouillon en porte une', async () => {
    await seedVoice()
    render(
      <MemoryRouter
        initialEntries={[
          {
            pathname: '/ajouter',
            state: {
              voiceDraft: {
                type: 'arrosage',
                volumeLiters: 10,
                sourcePhrase: 'arrose dix litres les tomates',
              },
            },
          },
        ]}
      >
        <QuickAddPage />
      </MemoryRouter>,
    )

    expect(
      await screen.findByText('arrose dix litres les tomates', { exact: false }),
    ).toBeInTheDocument()
  })

  it('sans brouillon, affiche la grille de saisie rapide (non-regression)', () => {
    render(
      <MemoryRouter initialEntries={['/ajouter']}>
        <QuickAddPage />
      </MemoryRouter>,
    )
    expect(screen.getByRole('heading', { name: 'Saisie rapide' })).toBeInTheDocument()
  })
})

describe('QuickAddPage avec selecteur de variete', () => {
  it('enregistre la varietyId choisie sur une récolte', async () => {
    await db.catalog.add({ id: '3', vegetable: 'Courgette', family: 'cucurbitacees' })
    await db.crops.add({ id: '1', name: 'Courgettes', catalogId: '3', status: 'en_place' })
    await db.parcels.add({ id: '1', name: 'Buttes' })
    await findOrCreateVariety('Ronde de Nice', 'Courgette')

    render(
      <MemoryRouter>
        <QuickAddPage />
      </MemoryRouter>,
    )
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: 'Récolte' }))

    const cropOption = await screen.findByRole('option', { name: 'Courgettes' })
    await user.selectOptions(screen.getByLabelText('Culture'), cropOption)

    const varietyOption = await screen.findByRole('option', { name: 'Ronde de Nice' })
    await user.selectOptions(screen.getByLabelText('Variété'), varietyOption)

    await user.type(screen.getByLabelText('Quantité (kg)'), '1.5')
    await user.click(screen.getByRole('button', { name: 'Valider' }))

    await waitFor(async () => {
      const all = await db.log.toArray()
      expect(all).toHaveLength(1)
    })
    const [entry] = await db.log.toArray()
    expect(entry.varietyId).toBeDefined()
    expect(entry.quantityKg).toBe(1.5)
  })
})
