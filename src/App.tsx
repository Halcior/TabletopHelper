import { useAccount, startAccount } from './features/account/store'
import { LocalImportNotice } from './features/account/LocalImportNotice'
import { useVisualPreferences } from './features/factionVisuals/preferences'
import { lazy, Suspense, useEffect } from 'react'
import { Link, NavLink, Route, Routes, useLocation } from 'react-router-dom'
import { AppIcon } from './components/AppIcon'
import { AppBackground } from './components/AppBackground'

const Account = lazy(() => import('./pages/Account'))
const ArmyLibrary = lazy(() => import('./pages/ArmyLibrary'))
const ArmyEditor = lazy(() => import('./pages/ArmyEditor'))
const TerrainGallery = lazy(() => import('./pages/TerrainGallery'))
const ArmyAppearance = lazy(() => import('./features/factionVisuals/ArmyAppearance'))
const FactionEmblemGallery = lazy(() => import('./features/factionVisuals/FactionEmblemGallery'))
const ArmyImport = lazy(() => import('./pages/ArmyImport'))
const BattleDashboard = lazy(() => import('./pages/BattleDashboard'))
const BattleSetup = lazy(() => import('./pages/BattleSetup'))
const Home = lazy(() => import('./pages/Home'))
const SharedSessions = lazy(() => import('./pages/SharedSessions'))

export default function App() {
  useEffect(startAccount, [])
  const account = useAccount(s => s.user)
  const appearance = useVisualPreferences(s => s.preferences.appearance)
  const location = useLocation()
  const inBattle = location.pathname.startsWith('/battle/') && !location.pathname.startsWith('/battle/setup')
  return (
    <div className="app-root" data-appearance={appearance}>
      <AppBackground />
      {!inBattle && (
        <header className="app-header">
          <Link className="brand" to="/" aria-label="TabletopHelper home"><span className="brand-mark"><AppIcon name="mark" /></span><span>Tabletop<strong>Helper</strong></span></Link>
          <nav aria-label="Main navigation">
            <NavLink to="/" end><AppIcon name="home" /><span>Home</span></NavLink>
            <NavLink to="/shared"><AppIcon name="shared" /><span>Shared</span></NavLink>
            <NavLink to="/armies"><AppIcon name="army" /><span>Armies</span></NavLink>
            <NavLink to="/account" title={account?.email ?? 'Optional account'}><AppIcon name="account" /><span>{account ? 'Account' : 'Sign in'}</span></NavLink>
          </nav>
        </header>
      )}
      {!inBattle && <LocalImportNotice />}
      <Suspense fallback={<div className="page-shell"><div className="loading-state" role="status">Loading tabletop…</div></div>}>
        <Routes>
          <Route path="/account" element={<Account key={account?.id ?? 'guest'} />} />
          <Route path="/armies" element={<ArmyLibrary />} />
          <Route path="/army/:armyId" element={<ArmyEditor />} />
          <Route path="/army/:armyId/edit" element={<ArmyEditor />} />
          <Route path="/army/:armyId/appearance" element={<ArmyAppearance key={account?.id ?? 'guest'} />} />
          <Route path="/terrain-layouts" element={<TerrainGallery />} />
          <Route path="/faction-icons" element={<FactionEmblemGallery />} />
          <Route path="/" element={<Home />} />
          <Route path="/shared" element={<SharedSessions />} />
          <Route path="/army-import" element={<ArmyImport key={account?.id ?? 'guest'} />} />
          <Route path="/battle/setup" element={<BattleSetup />} />
          <Route path="/battle/:battleId" element={<BattleDashboard />} />
          <Route path="*" element={<div className="page-shell"><div className="empty-state"><h1>Signal lost</h1><Link className="button" to="/">Return home</Link></div></div>} />
        </Routes>
      </Suspense>
    </div>
  )
}
