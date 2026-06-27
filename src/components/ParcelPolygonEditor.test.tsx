import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ParcelPolygonEditor } from './ParcelPolygonEditor'

function clickAt(svg: Element, x: number, y: number) {
  fireEvent.click(svg, { clientX: x, clientY: y })
}

describe('ParcelPolygonEditor', () => {
  it('le bouton Valider est desactive avec moins de 3 points', () => {
    render(<ParcelPolygonEditor photoUrl="data:image/jpeg;base64,X" onValidate={vi.fn()} onCancel={vi.fn()} />)
    const svg = screen.getByTestId('polygon-surface')
    svg.getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 100 }) as DOMRect
    clickAt(svg, 10, 10)
    clickAt(svg, 50, 10)
    expect(screen.getByRole('button', { name: 'Valider la forme' })).toBeDisabled()
  })

  it('valide la forme avec 3 points et convertit en coordonnees relatives', () => {
    const onValidate = vi.fn()
    render(<ParcelPolygonEditor photoUrl="data:image/jpeg;base64,X" onValidate={onValidate} onCancel={vi.fn()} />)
    const svg = screen.getByTestId('polygon-surface')
    svg.getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 100 }) as DOMRect
    clickAt(svg, 20, 10)
    clickAt(svg, 100, 10)
    clickAt(svg, 60, 80)
    fireEvent.click(screen.getByRole('button', { name: 'Valider la forme' }))
    expect(onValidate).toHaveBeenCalledWith([
      { x: 0.1, y: 0.1 },
      { x: 0.5, y: 0.1 },
      { x: 0.3, y: 0.8 },
    ])
  })

  it('Recommencer vide les points et redesactive Valider', () => {
    render(<ParcelPolygonEditor photoUrl="data:image/jpeg;base64,X" onValidate={vi.fn()} onCancel={vi.fn()} />)
    const svg = screen.getByTestId('polygon-surface')
    svg.getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 100 }) as DOMRect
    clickAt(svg, 20, 10)
    clickAt(svg, 100, 10)
    clickAt(svg, 60, 80)
    fireEvent.click(screen.getByRole('button', { name: 'Recommencer' }))
    expect(screen.getByRole('button', { name: 'Valider la forme' })).toBeDisabled()
  })

  it('Annuler appelle onCancel', () => {
    const onCancel = vi.fn()
    render(<ParcelPolygonEditor photoUrl="data:image/jpeg;base64,X" onValidate={vi.fn()} onCancel={onCancel} />)
    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }))
    expect(onCancel).toHaveBeenCalled()
  })
})
