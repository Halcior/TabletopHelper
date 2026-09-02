import { lazy, Suspense } from 'react'
import { Link, NavLink, Route, Routes, useLocation } from 'react-router-dom'

const ArmyImport = lazy(() => import('./pages/ArmyImport'))
const BattleDashboard = lazy(() => import('./pages/BattleDashboard'))
const BattleSetup = lazy(() => import('./pages/BattleSetup'))
const Home = lazy(() => import('./pages/Home'))
const SharedSessions = lazy(() => import('./pages/SharedSessions'))

export default function App() {
  const location = useLocation()
  const inBattle = location.pathname.startsWith('/battle/') && !location.pathname.startsWith('/battle/setup')
  return (
    <div className="app-root">
      {!inBattle && (
        <header className="app-header">
          <Link className="brand" to="/"><span className="brand-mark">TC</span><span>Tabletop <strong>Companion</strong></span></Link>
          <nav>
            <NavLink to="/" end>Home</NavLink>
            <NavLink to="/shared">Shared</NavLink>
            <NavLink to="/army-import">Import</NavLink>
          </nav>
        </header>
      )}
      <Suspense fallback={<div className="page-shell"><div className="loading-state">Loading tabletop…</div></div>}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/shared" element={<SharedSessions />} />
          <Route path="/army-import" element={<ArmyImport />} />
          <Route path="/battle/setup" element={<BattleSetup />} />
          <Route path="/battle/:battleId" element={<BattleDashboard />} />
          <Route path="*" element={<div className="page-shell"><div className="empty-state"><h1>Signal lost</h1><Link className="button" to="/">Return home</Link></div></div>} />
        </Routes>
      </Suspense>
    </div>
  )
}
