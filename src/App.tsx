import { t as tr } from './features/i18n/locale'
import { useLocale } from './features/i18n/locale'
import { useAccount, startAccount } from './features/account/store'
import { LocalImportNotice } from './features/account/LocalImportNotice'
import { useVisualPreferences } from './features/factionVisuals/preferences'
import { lazy, Suspense, useEffect } from 'react'
import { Link, NavLink, Route, Routes, useLocation } from 'react-router-dom'
import { AppIcon } from './components/AppIcon'
import { AppBackground } from './components/AppBackground'

const Friends = lazy(() => import('./pages/Friends'))
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
  const locale = useLocale(state => state.locale)
  useEffect(() => { document.documentElement.lang = locale }, [locale])
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
          <Link className="brand" to="/" aria-label={tr("TabletopHelper home")}><span className="brand-mark"><AppIcon name="mark" /></span><span>Tabletop<strong>Helper</strong></span></Link>
          <nav aria-label={tr("Main navigation")}>
            <NavLink to="/" end><AppIcon name="home" /><span>{tr("Home")}</span></NavLink>
            <NavLink to="/shared"><AppIcon name="shared" /><span>{tr("Shared")}</span></NavLink>
            <NavLink to="/armies"><AppIcon name="army" /><span>{tr("Armies")}</span></NavLink>
            <NavLink to="/friends"><AppIcon name="shared" /><span>{tr("Friends")}</span></NavLink>
            <NavLink to="/account" title={account?.email ?? tr('Optional account')}><AppIcon name="account" /><span>{account ? tr('Account') : tr('Sign in')}</span></NavLink>
          </nav>
        </header>
      )}
      {!inBattle && <LocalImportNotice />}
      <Suspense fallback={<div className="page-shell"><div className="loading-state" role="status">Loading tabletop…</div></div>}>
        <Routes>
          <Route path="/friends" element={<Friends key={account?.id ?? 'guest'} />} />
          <Route path="/friends/:friendId" element={<Friends key={account?.id ?? 'guest'} />} />
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
