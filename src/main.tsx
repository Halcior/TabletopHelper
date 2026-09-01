import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './styles.css'
import './lifecycle.css'
import './contextPolish.css'
import './sharedSessions.css'
import './uiSimplify.css'
import './uiFocus.css'
import './mobileBattle.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>
)
