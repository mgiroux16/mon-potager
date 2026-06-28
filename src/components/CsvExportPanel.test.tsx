import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CsvExportPanel } from './CsvExportPanel'

vi.mock('../services/exportService', () => ({
  exportParcelsCsv: vi.fn(async () => 'id;name\np1;Test'),
  exportCropsCsv: vi.fn(async () => 'id;name\nc1;Tomate'),
  exportLogCsv: vi.fn(async () => 'id;type\nl1;arrosage'),
  exportHarvestsCsv: vi.fn(async () => 'id;date\nl1;2025-06-01'),
}))

import { exportCropsCsv, exportParcelsCsv } from '../services/exportService'

beforeEach(() => {
  vi.clearAllMocks()
  URL.createObjectURL = vi.fn(() => 'blob:fake')
  URL.revokeObjectURL = vi.fn()
})

describe('CsvExportPanel', () => {
  it('exporte les parcelles par défaut', async () => {
    render(<CsvExportPanel />)
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Télécharger CSV' }))
    expect(exportParcelsCsv).toHaveBeenCalled()
  })

  it('affiche le filtre saison pour les cultures et le transmet', async () => {
    render(<CsvExportPanel />)
    const user = userEvent.setup()
    await user.selectOptions(screen.getByLabelText("Type d'export"), 'cultures')
    await user.type(screen.getByLabelText('Saison (année)'), '2025')
    await user.click(screen.getByRole('button', { name: 'Télécharger CSV' }))
    expect(exportCropsCsv).toHaveBeenCalledWith(2025)
  })
})
