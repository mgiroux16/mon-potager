// Contour fixe du terrain de Mathieu : triangle (pointe sud) + rectangle nord (acces/maison).
// Coordonnees relatives 0-1, sur une grille carree (viewBox "0 0 1 1").
// Pas a l'echelle reelle : sert de repere visuel pour positionner les zones de parcelles,
// pas a un calcul de surface (la surface reelle se saisit a la main sur chaque parcelle).
import type { PolygonPoint } from '../services/geometry'

export const TERRAIN_OUTLINE: PolygonPoint[] = [
  { x: 0.35, y: 0 }, // rectangle nord, haut-gauche
  { x: 0.65, y: 0 }, // rectangle nord, haut-droit
  { x: 0.65, y: 0.18 }, // rectangle nord, bas-droit
  { x: 0.95, y: 0.18 }, // triangle, cote est (large)
  { x: 0.5, y: 1 }, // pointe sud
  { x: 0.05, y: 0.18 }, // triangle, cote ouest (large)
  { x: 0.35, y: 0.18 }, // rectangle nord, bas-gauche
]
