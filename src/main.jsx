import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from '../supply-manager.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
)
