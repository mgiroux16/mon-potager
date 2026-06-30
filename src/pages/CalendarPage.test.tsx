import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { db, newId } from '../data/db'
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

  it('affiche les legumes du catalogue dans la section semis (non filtree sur le jardin)', async () => {
    // Test deterministe : on seme au mois courant, donc visible des le montage,
    // sans dependre de la date. La section "a semer" n'est pas filtree sur le jardin
    // (contrairement a "a recolter" depuis la refonte calendrier).
    const currentMonth = new Date().getMonth() + 1
    await db.catalog.add({
      id: newId(), vegetable: 'Tomate',
      family: 'solanacees',
      sowingMonths: [currentMonth],
    })

    render(<CalendarPage />)

    await waitFor(() => {
      expect(screen.getByText('Tomate')).toBeInTheDocument()
    })
  })

  it('ne montre une recolte que si la culture est au jardin', async () => {
    const currentMonth = new Date().getMonth() + 1
    // Item catalogue recoltable ce mois-ci mais AUCUNE culture plantee -> section vide.
    await db.catalog.add({
      id: newId(), vegetable: 'Courgette',
      family: 'cucurbitacees',
      harvestMonths: [currentMonth],
    })

    render(<CalendarPage />)

    // On attend que le mois courant soit rendu, puis on vérifie l'absence.
    await waitFor(() => {
      expect(screen.getByText(MOIS_FR[currentMonth - 1])).toBeInTheDocument()
    })
    expect(screen.queryByText('Courgette')).toBeNull()
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
