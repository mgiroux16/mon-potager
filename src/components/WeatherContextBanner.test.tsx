import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { WeatherContextBanner } from './WeatherContextBanner'

describe('WeatherContextBanner', () => {
  it('affiche le texte de contexte fourni', () => {
    render(<WeatherContextBanner text="Noté après 8 jours de forte chaleur, peu de pluie." />)
    expect(screen.getByText(/8 jours de forte chaleur/)).toBeInTheDocument()
  })
  it('ne rend rien si le texte est null', () => {
    const { container } = render(<WeatherContextBanner text={null} />)
    expect(container).toBeEmptyDOMElement()
  })
})
