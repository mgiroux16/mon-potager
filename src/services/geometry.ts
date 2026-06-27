export interface PolygonPoint {
  x: number
  y: number
}

// Algorithme du ray casting : compte les croisements d'une demi-droite horizontale
// partant du point avec chaque segment du polygone. Coordonnees attendues en 0-1
// (relatives a l'image), mais fonctionne avec n'importe quelle unite coherente.
export function isPointInPolygon(point: PolygonPoint, polygon: PolygonPoint[]): boolean {
  if (polygon.length < 3) return false

  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]
    const b = polygon[j]
    const crosses =
      a.y > point.y !== b.y > point.y &&
      point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x
    if (crosses) inside = !inside
  }
  return inside
}
