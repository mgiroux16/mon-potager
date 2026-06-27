import { Sprout } from 'lucide-react'
import { signInWithGoogle } from '../services/authService'

export function LoginPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 bg-green-50 px-6 text-center">
      <div className="flex flex-col items-center gap-2">
        <Sprout className="size-12 text-green-700" />
        <h1 className="text-2xl font-bold text-green-900">Mon Potager</h1>
        <p className="text-sm text-green-700/70">
          Connecte-toi pour retrouver ton jardin sur tous tes appareils.
        </p>
      </div>

      <button
        type="button"
        onClick={() => signInWithGoogle()}
        className="flex items-center gap-3 rounded-full border border-green-200 bg-white px-6 py-3 text-sm font-semibold text-green-900 shadow-sm transition-colors hover:bg-green-50"
      >
        <svg className="size-5" viewBox="0 0 24 24" aria-hidden="true">
          <path
            fill="#4285F4"
            d="M23.49 12.27c0-.79-.07-1.54-.2-2.27H12v4.51h6.47c-.28 1.48-1.13 2.73-2.4 3.58v2.97h3.86c2.26-2.09 3.56-5.17 3.56-8.79z"
          />
          <path
            fill="#34A853"
            d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-2.97c-1.07.72-2.45 1.15-4.07 1.15-3.13 0-5.78-2.11-6.73-4.96H1.27v3.07C3.26 21.3 7.31 24 12 24z"
          />
          <path
            fill="#FBBC05"
            d="M5.27 14.31a7.2 7.2 0 0 1 0-4.62V6.62H1.27a11.97 11.97 0 0 0 0 10.76l4-3.07z"
          />
          <path
            fill="#EA4335"
            d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.27 6.62l4 3.07C6.22 6.86 8.87 4.75 12 4.75z"
          />
        </svg>
        Se connecter avec Google
      </button>
    </div>
  )
}
