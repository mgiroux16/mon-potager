import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { db } from '../data/db'
import { CalendarPage } from './CalendarPage'

const MOIS_FR = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
]

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
})

describe('CalendarPage', () => {
  it('affiche le mois courant au montage', async () => {
    render(<CalendarPage />)
    const moisCourant = MOIS_FR[new Date().getMonth()]
    await waitFor(() => {
      expect(screen.getByText(moisCourant)).toBeInTheDocument()
    })
  })

  it('affiche un message quand une section est vide', async () => {
    render(<CalendarPage />)
    await waitFor(() => {
      expect(screen.getAllByText(/Rien à .* ce mois-ci/).length).toBeGreaterThan(0)
    })
  })

  it('affiche les legumes du catalogue dans la bonne section', async () => {
    await db.catalog.add({
      vegetable: 'Tomate',
      family: 'solanacees',
      sowingMonths: [3, 4],
      plantingMonths: [5],
      harvestMonths: [7, 8, 9, 10],
    })

    render(<CalendarPage />)
    fireEvent.click(screen.getByLabelText('Mois suivant'))
    fireEvent.click(screen.getByLabelText('Mois suivant'))

    await waitFor(() => {
      expect(screen.getByText('Tomate')).toBeInTheDocument()
    })
  })

  it('navigue au mois precedent et suivant, avec un cycle sur l annee', async () => {
    render(<CalendarPage />)
    const moisCourantIndex = new Date().getMonth()

    fireEvent.click(screen.getByLabelText('Mois suivant'))
    await waitFor(() => {
      const moisSuivant = MOIS_FR[(moisCourantIndex + 1) % 12]
      expect(screen.getByText(moisSuivant)).toBeInTheDocument()
    })

    fireEvent.click(screen.getByLabelText('Mois precedent'))
    fireEvent.click(screen.getByLabelText('Mois precedent'))
    await waitFor(() => {
      const moisPrecedent = MOIS_FR[(moisCourantIndex - 1 + 12) % 12]
      expect(screen.getByText(moisPrecedent)).toBeInTheDocument()
    })
  })
})
