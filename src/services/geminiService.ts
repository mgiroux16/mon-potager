// Modèle gratuit utilisé pour les appels Gemini. Changer ici suffit à basculer.
// gemini-2.0-flash a été arrêté par Google le 2026-06-01 (quota gratuit tombé à 0,
// d'où des 429 "limit: 0") ; 2.5-flash est le modèle gratuit courant, multimodal (audio).
export const GEMINI_MODEL = 'gemini-2.5-flash'

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models'

interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string }[] } }[]
  error?: { message?: string }
}

// Un morceau de contenu envoyé à Gemini : du texte ou de l'audio encodé en base64.
type GeminiPart = { text: string } | { inlineData: { data: string; mimeType: string } }

type GeminiContent = { role: 'user' | 'model'; parts: GeminiPart[] }

export type GeminiChatTurn = { role: 'user' | 'model'; text: string }

/**
 * Cœur d'appel partagé : poste des `contents` (un ou plusieurs tours) et renvoie le texte
 * de la réponse. La clé n'est jamais journalisée ; lève une erreur lisible en cas d'échec.
 */
async function postGemini(contents: GeminiContent[], apiKey: string): Promise<string> {
  const url = `${ENDPOINT}/${GEMINI_MODEL}:generateContent?key=${apiKey}`
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents }),
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

/**
 * Appelle l'API Gemini avec un prompt texte et renvoie le texte de la réponse.
 */
export async function callGemini(prompt: string, apiKey: string): Promise<string> {
  return postGemini([{ role: 'user', parts: [{ text: prompt }] }], apiKey)
}

/**
 * Appelle Gemini avec l'historique complet de la conversation (tours user/model)
 * pour que le modèle garde le fil d'un échange à l'autre.
 */
export async function callGeminiChat(history: GeminiChatTurn[], apiKey: string): Promise<string> {
  return postGemini(
    history.map((t) => ({ role: t.role, parts: [{ text: t.text }] })),
    apiKey,
  )
}

/**
 * Appelle Gemini avec un prompt texte ET un audio (base64 inline) : le modèle
 * transcrit puis range en une seule passe. Sert la dictée sur les navigateurs
 * qui ne supportent pas la reconnaissance vocale native (Brave, Firefox).
 */
export async function callGeminiAudio(
  prompt: string,
  audio: { data: string; mimeType: string },
  apiKey: string,
): Promise<string> {
  return postGemini([{ role: 'user', parts: [{ text: prompt }, { inlineData: audio }] }], apiKey)
}

/**
 * Appelle Gemini avec un prompt texte ET une image (base64 inline) : sert le diagnostic
 * IA quand une photo a été attachée au problème (analyse visuelle multimodale).
 */
export async function callGeminiVision(
  prompt: string,
  image: { data: string; mimeType: string },
  apiKey: string,
): Promise<string> {
  return postGemini([{ role: 'user', parts: [{ text: prompt }, { inlineData: image }] }], apiKey)
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
