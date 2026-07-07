import { useEffect, useRef, useState } from 'react'

const AUTOSAVE_DELAY_MS = 1000
const SAVED_FLASH_MS = 1500

export function AutoSaveNoteField({
  label,
  ariaLabel,
  value,
  onSave,
  rows = 2,
}: {
  label: string
  ariaLabel: string
  value: string
  onSave: (text: string) => void
  rows?: number
}) {
  const [text, setText] = useState(value)
  const [saved, setSaved] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const savedFlashRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => () => {
    clearTimeout(timerRef.current)
    clearTimeout(savedFlashRef.current)
  }, [])

  function flushSave(next: string) {
    clearTimeout(timerRef.current)
    onSave(next)
    setSaved(true)
    clearTimeout(savedFlashRef.current)
    savedFlashRef.current = setTimeout(() => setSaved(false), SAVED_FLASH_MS)
  }

  function handleChange(next: string) {
    setText(next)
    setSaved(false)
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => flushSave(next), AUTOSAVE_DELAY_MS)
  }

  return (
    <div className="mt-1 flex flex-col gap-1 text-xs text-gray-600">
      <label className="flex flex-col gap-1">
        {label}
        <textarea
          aria-label={ariaLabel}
          value={text}
          onChange={(e) => handleChange(e.target.value)}
          onBlur={() => flushSave(text)}
          rows={rows}
          className="w-full rounded border border-green-200 px-2 py-1 text-sm"
        />
      </label>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => flushSave(text)}
          className="rounded border border-green-300 px-2 py-0.5 text-xs font-medium text-green-700"
        >
          Enregistrer
        </button>
        {saved && <span className="text-green-600">Enregistré ✓</span>}
      </div>
    </div>
  )
}
