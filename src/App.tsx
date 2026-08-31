import { Link, NavLink, Route, Routes, useLocation } from 'react-router-dom'
import ArmyImport from './pages/ArmyImport'
import BattleDashboard from './pages/BattleDashboard'
import BattleSetup from './pages/BattleSetup'
import Home from './pages/Home'

export default function App() {
  const location = useLocation()
  const inBattle = location.pathname.startsWith('/battle/') && !location.pathname.startsWith('/battle/setup')
  return (
    <div className="app-root">
      {!inBattle && (
        <header className="app-header">
          <Link className="brand" to="/"><span className="brand-mark">TC</span><span>Tabletop <strong>Companion</strong></span></Link>
          <nav>
            <NavLink to="/" end>Command</NavLink>
            <NavLink to="/army-import">Import</NavLink>
          </nav>
        </header>
      )}
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/army-import" element={<ArmyImport />} />
        <Route path="/battle/setup" element={<BattleSetup />} />
        <Route path="/battle/:battleId" element={<BattleDashboard />} />
        <Route path="*" element={<div className="page-shell"><div className="empty-state"><h1>Signal lost</h1><Link className="button" to="/">Return to command</Link></div></div>} />
      </Routes>
    </div>
  )
}
