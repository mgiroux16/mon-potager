import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ZoneShapeEditor } from './ZoneShapeEditor'

describe('ZoneShapeEditor', () => {
  it('valider est desactive sans points', () => {
    render(<ZoneShapeEditor onValidate={vi.fn()} onCancel={vi.fn()} />)
    expect(screen.getByText('Valider la forme')).toBeDisabled()
  })

  it('un clic sur Rectangle pose 4 points et active Valider', () => {
    render(<ZoneShapeEditor onValidate={vi.fn()} onCancel={vi.fn()} />)
    fireEvent.click(screen.getByText('Rectangle'))
    expect(screen.getAllByTestId(/zone-point-/)).toHaveLength(4)
    expect(screen.getByText('Valider la forme')).not.toBeDisabled()
  })

  it('un clic sur Triangle pose 3 points', () => {
    render(<ZoneShapeEditor onValidate={vi.fn()} onCancel={vi.fn()} />)
    fireEvent.click(screen.getByText('Triangle'))
    expect(screen.getAllByTestId(/zone-point-/)).toHaveLength(3)
  })

  it('Valider la forme appelle onValidate avec les points du gabarit', () => {
    const onValidate = vi.fn()
    render(<ZoneShapeEditor onValidate={onValidate} onCancel={vi.fn()} />)
    fireEvent.click(screen.getByText('Carré'))
    fireEvent.click(screen.getByText('Valider la forme'))
    expect(onValidate).toHaveBeenCalledTimes(1)
    expect(onValidate.mock.calls[0][0]).toHaveLength(4)
  })

  it('Forme libre permet de tracer point par point au clic sur le fond', () => {
    const onValidate = vi.fn()
    render(<ZoneShapeEditor onValidate={onValidate} onCancel={vi.fn()} />)
    fireEvent.click(screen.getByText('Forme libre'))
    const surface = screen.getByTestId('zone-shape-surface')
    surface.getBoundingClientRect = () => ({ left: 0, top: 0, width: 100, height: 100 }) as DOMRect
    fireEvent.click(surface, { clientX: 10, clientY: 10 })
    fireEvent.click(surface, { clientX: 90, clientY: 10 })
    fireEvent.click(surface, { clientX: 50, clientY: 90 })
    expect(screen.getAllByTestId(/zone-point-/)).toHaveLength(3)
    fireEvent.click(screen.getByText('Valider la forme'))
    expect(onValidate).toHaveBeenCalledTimes(1)
  })

  it('Recommencer vide les points', () => {
    render(<ZoneShapeEditor onValidate={vi.fn()} onCancel={vi.fn()} />)
    fireEvent.click(screen.getByText('Rectangle'))
    fireEvent.click(screen.getByText('Recommencer'))
    expect(screen.queryAllByTestId(/zone-point-/)).toHaveLength(0)
  })

  it('Annuler appelle onCancel', () => {
    const onCancel = vi.fn()
    render(<ZoneShapeEditor onValidate={vi.fn()} onCancel={onCancel} />)
    fireEvent.click(screen.getByText('Annuler'))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })
})
