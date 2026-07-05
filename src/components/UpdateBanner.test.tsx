import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { UpdateBanner } from './UpdateBanner'
import { fetchPublishedVersion } from '../services/versionService'

vi.mock('../services/versionService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/versionService')>()
  return { ...actual, fetchPublishedVersion: vi.fn() }
})

const fetchVersionMock = vi.mocked(fetchPublishedVersion)

beforeEach(() => {
  fetchVersionMock.mockReset()
})

describe('UpdateBanner', () => {
  it('affiche la pastille quand une version plus recente est publiée', async () => {
    fetchVersionMock.mockResolvedValue({ hash: 'zzz9999', builtAt: '2026-07-05T20:00:00Z' })
    render(<UpdateBanner />)
    expect(
      await screen.findByRole('button', { name: /Nouvelle version · Mettre à jour/ }),
    ).toBeInTheDocument()
  })

  it("n'affiche rien quand l'app est à jour", async () => {
    fetchVersionMock.mockResolvedValue({ hash: __APP_BUILD_HASH__, builtAt: '' })
    render(<UpdateBanner />)
    await waitFor(() => expect(fetchVersionMock).toHaveBeenCalled())
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it("n'affiche rien hors-ligne (pas d'info de version)", async () => {
    fetchVersionMock.mockResolvedValue(null)
    render(<UpdateBanner />)
    await waitFor(() => expect(fetchVersionMock).toHaveBeenCalled())
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('recharge la page au clic', async () => {
    fetchVersionMock.mockResolvedValue({ hash: 'zzz9999', builtAt: '' })
    const reloadMock = vi.fn()
    const originalLocation = window.location
    Object.defineProperty(window, 'location', {
      value: { ...originalLocation, reload: reloadMock },
      writable: true,
      configurable: true,
    })

    render(<UpdateBanner />)
    fireEvent.click(await screen.findByRole('button', { name: /Mettre à jour/ }))
    await waitFor(() => expect(reloadMock).toHaveBeenCalled())

    Object.defineProperty(window, 'location', {
      value: originalLocation,
      writable: true,
      configurable: true,
    })
  })
})
