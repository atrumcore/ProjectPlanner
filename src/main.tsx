import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ThemeProvider } from './theme/ThemeContext.tsx'
import { getActiveThemeName } from './theme/colors.ts'
import { migrateLegacyStorageKeys } from './utils/legacyStorage.ts'
import { initAuth } from './auth/useAuthStore.ts'

// Carry any pre-rename `dha-*` storage across before anything reads it.
migrateLegacyStorageKeys()

// Set the theme attribute synchronously before first paint to avoid a flash.
document.documentElement.setAttribute('data-theme', getActiveThemeName())

// Settle auth before the first render: an Entra redirect response arrives in
// the URL hash and must be consumed before anything paints or navigates.
// Resolves immediately when sign-in isn't configured, so the signed-out app
// boots exactly as it always has.
await initAuth()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </StrictMode>,
)
