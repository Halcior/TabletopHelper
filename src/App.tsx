import { useVisualPreferences } from './features/factionVisuals/preferences'
import { lazy, Suspense } from 'react'
import { Link, NavLink, Route, Routes, useLocation } from 'react-router-dom'
import { AppIcon } from './components/AppIcon'
import { AppBackground } from './components/AppBackground'

const TerrainGallery = lazy(() => import('./pages/TerrainGallery'))
const ArmyAppearance = lazy(() => import('./features/factionVisuals/ArmyAppearance'))
const FactionEmblemGallery = lazy(() => import('./features/factionVisuals/FactionEmblemGallery'))
const ArmyImport = lazy(() => import('./pages/ArmyImport'))
const BattleDashboard = lazy(() => import('./pages/BattleDashboard'))
const BattleSetup = lazy(() => import('./pages/BattleSetup'))
const Home = lazy(() => import('./pages/Home'))
const SharedSessions = lazy(() => import('./pages/SharedSessions'))

export default function App() {
  const appearance = useVisualPreferences(s => s.preferences.appearance)
  const location = useLocation()
  const inBattle = location.pathname.startsWith('/battle/') && !location.pathname.startsWith('/battle/setup')
  return (
    <div className="app-root" data-appearance={appearance}>
      <AppBackground />
      {!inBattle && (
        <header className="app-header">
          <Link className="brand" to="/" aria-label="TabletopHelper home"><span className="brand-mark"><AppIcon name="mark" /></span><span>Tabletop<strong>Helper</strong></span></Link>
          <nav>
            <NavLink to="/" end><AppIcon name="home" /><span>Home</span></NavLink>
            <NavLink to="/shared"><AppIcon name="shared" /><span>Shared</span></NavLink>
            <NavLink to="/army-import"><AppIcon name="import" /><span>Import</span></NavLink>
          </nav>
        </header>
      )}
      <Suspense fallback={<div className="page-shell"><div className="loading-state" role="status">Loading tabletop…</div></div>}>
        <Routes>
          <Route path="/army/:armyId/appearance" element={<ArmyAppearance />} />
          <Route path="/terrain-layouts" element={<TerrainGallery />} />
          <Route path="/faction-icons" element={<FactionEmblemGallery />} />
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
