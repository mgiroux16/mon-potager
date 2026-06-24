import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { db } from '../data/db'
import { listLog } from '../services/logService'
import { QuickAddPage } from './QuickAddPage'

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
})

describe('QuickAddPage', () => {
  it('ajoute un arrosage via la tuile dédiée', async () => {
    await db.parcels.add({ name: 'Planche test' })
    render(
      <MemoryRouter>
        <QuickAddPage />
      </MemoryRouter>,
    )
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: 'Arrosage' }))

    const option = await screen.findByRole('option', { name: 'Planche test' })
    await user.selectOptions(screen.getByLabelText('Parcelle'), option)
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
})
