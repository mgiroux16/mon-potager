import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ImportButton } from './ImportButton'

vi.mock('../services/exportService', () => ({
  importAll: vi.fn(async () => ({ tablesImported: ['parcels', 'crops'], totalRecords: 5 })),
}))

import { importAll } from '../services/exportService'

beforeEach(() => {
  vi.clearAllMocks()
})

function jsonFile(): File {
  return new File(['{}'], 'export.json', { type: 'application/json' })
}

describe('ImportButton', () => {
  it('importe le fichier choisi et affiche le résumé', async () => {
    render(<ImportButton />)
    const user = userEvent.setup()

    await user.upload(screen.getByLabelText('Choisir un fichier à importer'), jsonFile())
    await user.click(screen.getByRole('button', { name: 'Importer' }))

    await waitFor(() => expect(importAll).toHaveBeenCalled())
    expect(await screen.findByText('2 tables, 5 enregistrements importés.')).toBeInTheDocument()
  })

  it("affiche une erreur si le fichier n'est pas un JSON valide", async () => {
    vi.mocked(importAll).mockRejectedValueOnce(new Error('JSON invalide'))
    render(<ImportButton />)
    const user = userEvent.setup()

    await user.upload(screen.getByLabelText('Choisir un fichier à importer'), jsonFile())
    await user.click(screen.getByRole('button', { name: 'Importer' }))

    expect(await screen.findByText('Fichier invalide, import annulé.')).toBeInTheDocument()
  })
})
