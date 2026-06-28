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
})
