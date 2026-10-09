import { BrowserRouter } from 'react-router-dom'
import AppRoutes from './app/routes'
import './app/app.css'

/**
 * DSA OS Application Root
 *
 * Provides routing context. Auth and tenant providers will be added in PH-01.
 */
function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  )
}

export default App
