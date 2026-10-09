import { Outlet } from 'react-router-dom'
import Sidebar from '@shared/components/Sidebar'
import { TopBar } from '@shared/components/TopBar'

/**
 * DSA OS — App Shell Layout
 *
 * The persistent outer layout: sidebar + main content area.
 * Child routes render inside <Outlet />.
 */
function AppShell() {
  return (
    <div className="app-shell">
      <Sidebar />
      <main className="app-main">
        <TopBar />
        <div className="app-content">
          <Outlet />
        </div>
      </main>
    </div>
  )
}

export default AppShell
