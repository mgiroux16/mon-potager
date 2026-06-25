// Modèle gratuit utilisé pour les appels Gemini. Changer ici suffit à basculer.
export const GEMINI_MODEL = 'gemini-2.0-flash'

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models'

interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string }[] } }[]
  error?: { message?: string }
}

/**
 * Appelle l'API Gemini avec un prompt texte et renvoie le texte de la réponse.
 * La clé n'est jamais journalisée. Lève une erreur lisible si la réponse est en erreur.
 */
export async function callGemini(prompt: string, apiKey: string): Promise<string> {
  const url = `${ENDPOINT}/${GEMINI_MODEL}:generateContent?key=${apiKey}`
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
  })

  const data = (await response.json().catch(() => ({}))) as GeminiResponse

  if (!response.ok) {
    const detail = data.error?.message ?? response.statusText
    throw new Error(`Gemini ${response.status} : ${detail}`)
  }

  const text = data.candidates?.[0]?.content?.parts?.[0]?.text
  if (text == null) {
    throw new Error('Réponse Gemini vide ou inattendue')
  }
  return text
}

export type ConnectionResult = { ok: true } | { ok: false; error: string }

/**
 * Vérifie qu'une clé Gemini fonctionne en envoyant un mini-prompt.
 * Ne lève jamais : capte toute erreur (clé invalide, réseau, quota) et la renvoie.
 */
export async function testGeminiConnection(apiKey: string): Promise<ConnectionResult> {
  try {
    await callGemini('Réponds OK', apiKey)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}
