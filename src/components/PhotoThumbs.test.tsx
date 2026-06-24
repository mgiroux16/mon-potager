import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PhotoThumbs } from './PhotoThumbs'

describe('PhotoThumbs', () => {
  it('ne rend rien sans photo', () => {
    const { container } = render(<PhotoThumbs urls={[]} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('affiche une vignette par photo', () => {
    render(<PhotoThumbs urls={['data:image/jpeg;base64,A', 'data:image/jpeg;base64,B']} />)
    expect(screen.getAllByRole('img')).toHaveLength(2)
  })

  it('agrandit au clic puis ferme', async () => {
    render(<PhotoThumbs urls={['data:image/jpeg;base64,A']} />)
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: 'Agrandir la photo 1' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    await user.click(screen.getByRole('dialog'))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
