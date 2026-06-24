import { describe, it, expect } from 'vitest'
import type { LogEntryType } from '../data/model'
import { LOG_TYPE_ICONS } from './logTypeIcons'

const ALL_TYPES: LogEntryType[] = [
  'arrosage', 'remplissage_oya', 'releve_pluie', 'recolte', 'semis',
  'plantation', 'paillage', 'traitement', 'observation', 'probleme',
  'compost', 'taille', 'depense', 'diagnostic', 'note',
]

describe('LOG_TYPE_ICONS', () => {
  it('définit une icône pour chacun des 15 types', () => {
    for (const type of ALL_TYPES) {
      expect(LOG_TYPE_ICONS[type]).toBeDefined()
    }
  })
})
