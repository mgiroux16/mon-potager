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
})
