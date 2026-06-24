import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PhotoInput } from './PhotoInput'

vi.mock('../services/imageService', () => ({
  compressImage: vi.fn(async () => 'data:image/jpeg;base64,COMPRESSED'),
}))

beforeEach(() => {
  vi.clearAllMocks()
})

function file(name = 'photo.jpg'): File {
  return new File(['x'], name, { type: 'image/jpeg' })
}

describe('PhotoInput', () => {
  it('ajoute une photo compressée et notifie via onChange', async () => {
    const onChange = vi.fn()
    render(<PhotoInput photos={[]} onChange={onChange} />)
    const user = userEvent.setup()

    await user.upload(screen.getByLabelText('Ajouter une photo'), file())

    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith(['data:image/jpeg;base64,COMPRESSED']),
    )
  })

  it('affiche une vignette par photo existante', () => {
    render(<PhotoInput photos={['data:image/jpeg;base64,A']} onChange={vi.fn()} />)
    expect(screen.getByRole('img')).toHaveAttribute('src', 'data:image/jpeg;base64,A')
  })

  it('supprime une photo via son bouton', async () => {
    const onChange = vi.fn()
    render(<PhotoInput photos={['data:image/jpeg;base64,A']} onChange={onChange} />)
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: 'Supprimer la photo 1' }))

    expect(onChange).toHaveBeenCalledWith([])
  })

  it('masque le bouton d\'ajout au-delà du maximum', () => {
    render(
      <PhotoInput
        photos={['data:image/jpeg;base64,A', 'data:image/jpeg;base64,B', 'data:image/jpeg;base64,C']}
        onChange={vi.fn()}
        max={3}
      />,
    )
    expect(screen.queryByLabelText('Ajouter une photo')).not.toBeInTheDocument()
  })
})
