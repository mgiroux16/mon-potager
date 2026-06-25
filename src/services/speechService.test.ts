import { afterEach, describe, expect, it } from 'vitest'
import { isSpeechSupported } from './speechService'

describe('isSpeechSupported', () => {
  afterEach(() => {
    delete (window as unknown as Record<string, unknown>).SpeechRecognition
    delete (window as unknown as Record<string, unknown>).webkitSpeechRecognition
  })

  it('renvoie faux quand aucune API de reconnaissance n est presente', () => {
    expect(isSpeechSupported()).toBe(false)
  })

  it('renvoie vrai avec SpeechRecognition standard', () => {
    ;(window as unknown as Record<string, unknown>).SpeechRecognition = class {}
    expect(isSpeechSupported()).toBe(true)
  })

  it('renvoie vrai avec le prefixe webkit', () => {
    ;(window as unknown as Record<string, unknown>).webkitSpeechRecognition = class {}
    expect(isSpeechSupported()).toBe(true)
  })
})
