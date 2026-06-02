import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ThemeProvider } from './theme/ThemeContext.tsx'
import { getActiveThemeName } from './theme/colors.ts'

// Set the theme attribute synchronously before first paint to avoid a flash.
document.documentElement.setAttribute('data-theme', getActiveThemeName())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </StrictMode>,
)
