import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { db } from '../data/db'
import { TreeCard } from './TreeCard'
import type { FruitTree } from '../data/model'

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
})

describe('TreeCard', () => {
  it('affiche et sauvegarde une note de qualite de recolte par annee', async () => {
    const tree: FruitTree = { id: 'tree1', name: 'Pommier' }
    await db.trees.add(tree)
    render(<TreeCard tree={tree} />)

    await userEvent.click(screen.getByLabelText("Afficher l'historique"))
    const textarea = await screen.findByLabelText('Qualité de récolte')
    await userEvent.type(textarea, 'fruits sucres cette annee')
    await userEvent.tab()

    const notes = await db.seasonNotes.toArray()
    expect(notes).toHaveLength(1)
    expect(notes[0]).toMatchObject({ treeId: 'tree1', text: 'fruits sucres cette annee' })
  })

  it('affiche la galerie photo de l arbre triee par date decroissante', async () => {
    const tree: FruitTree = { id: 'tree1', name: 'Poirier' }
    await db.trees.add(tree)
    await db.log.add({
      id: 'e1', type: 'observation', date: '2026-05-01', treeId: 'tree1',
      photoUrls: ['data:image/jpeg;base64,AAA'], createdAt: 1,
    })
    await db.log.add({
      id: 'e2', type: 'floraison', date: '2026-06-10', treeId: 'tree1',
      photoUrls: ['data:image/jpeg;base64,BBB'], createdAt: 2,
    })
    await db.log.add({
      id: 'e3', type: 'observation', date: '2026-04-01', treeId: 'tree1', createdAt: 3,
    })

    render(<TreeCard tree={tree} />)
    await userEvent.click(screen.getByLabelText("Afficher l'historique"))

    const images = await screen.findAllByRole('img', { name: /Photo du/ })
    expect(images).toHaveLength(2)
    expect(images[0]).toHaveAttribute('src', 'data:image/jpeg;base64,BBB')
    expect(images[1]).toHaveAttribute('src', 'data:image/jpeg;base64,AAA')
    expect(screen.getByText('2026-06-10')).toBeInTheDocument()
  })
})
