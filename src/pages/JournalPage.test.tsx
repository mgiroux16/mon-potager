import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { db } from '../data/db'
import { addLogEntry } from '../services/logService'
import { JournalPage } from './JournalPage'

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
})

function renderJournal() {
  return render(
    <MemoryRouter>
      <JournalPage />
    </MemoryRouter>,
  )
}

describe('JournalPage', () => {
  it('affiche les entrées du journal', async () => {
    await addLogEntry({ type: 'arrosage', date: '2026-06-24', volumeLiters: 30 })
    await addLogEntry({ type: 'recolte', date: '2026-06-24', quantityKg: 2 })
    renderJournal()
    await waitFor(() => {
      expect(screen.getByText('30 L')).toBeInTheDocument()
      expect(screen.getByText('2 kg')).toBeInTheDocument()
    })
  })

  it('un filtre de type masque les entrées des autres types', async () => {
    await addLogEntry({ type: 'arrosage', date: '2026-06-24', volumeLiters: 30 })
    await addLogEntry({ type: 'recolte', date: '2026-06-24', quantityKg: 2 })
    renderJournal()
    await waitFor(() => expect(screen.getByText('30 L')).toBeInTheDocument())

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Récolte' }))

    expect(screen.queryByText('30 L')).not.toBeInTheDocument()
    expect(screen.getByText('2 kg')).toBeInTheDocument()
  })

  it('la recherche restreint la liste affichée', async () => {
    await addLogEntry({ type: 'observation', date: '2026-06-24', description: 'feuilles jaunes' })
    await addLogEntry({ type: 'recolte', date: '2026-06-24', quantityKg: 2 })
    renderJournal()
    await waitFor(() => expect(screen.getByText('feuilles jaunes')).toBeInTheDocument())

    const user = userEvent.setup()
    await user.type(screen.getByPlaceholderText('Rechercher'), 'jaunes')

    expect(screen.getByText('feuilles jaunes')).toBeInTheDocument()
    expect(screen.queryByText('2 kg')).not.toBeInTheDocument()
  })

  it('la recherche est insensible aux accents via le libellé de type', async () => {
    await addLogEntry({ type: 'observation', date: '2026-06-24', description: 'feuilles jaunes' })
    await addLogEntry({ type: 'recolte', date: '2026-06-24', quantityKg: 2 })
    renderJournal()
    await waitFor(() => expect(screen.getByText('2 kg')).toBeInTheDocument())

    const user = userEvent.setup()
    await user.type(screen.getByPlaceholderText('Rechercher'), 'recolte')

    expect(screen.getByText('2 kg')).toBeInTheDocument()
    expect(screen.queryByText('feuilles jaunes')).not.toBeInTheDocument()
  })

  it('affiche les vignettes des photos d\'une entrée', async () => {
    await addLogEntry({
      type: 'observation',
      date: '2026-06-24',
      description: 'feuilles jaunes',
      photoUrls: ['data:image/jpeg;base64,A'],
    })
    renderJournal()
    await waitFor(() => expect(screen.getByText('feuilles jaunes')).toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Agrandir la photo 1' })).toBeInTheDocument()
  })
})
