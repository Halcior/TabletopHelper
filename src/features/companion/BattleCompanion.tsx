import { useState } from 'react'
import type { BattleSession } from '../../domain/battle/types'
import { CommandDialog } from '../../components/ui/CommandDialog'
import { t } from '../i18n/locale'
import Companion from './Companion'

export default function BattleCompanion({ session, viewerId, shared, onClose }: {
  session: BattleSession; viewerId: string | null; shared: boolean; onClose: () => void
}) {
  const [playerId, setPlayerId] = useState(viewerId ?? session.state.activePlayerId)
  const player = session.state.players[playerId]
  const army = player?.armyId ? session.setup.armies[player.armyId] : undefined
  return <CommandDialog label="Battle Companion" onClose={onClose}><div className="companion-dialog">
    <div className="companion-dialog-heading"><label>{t('Player')} <select aria-label={t('Companion player')} value={playerId} onChange={e => setPlayerId(e.target.value)}>{session.setup.players.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label><button onClick={onClose}>{t('Back to battle')}</button></div>
    {army ? <Companion key={`${playerId}:${session.setup.gameId}`} army={army} session={session} playerId={playerId} shared={shared} canSelect={!shared || viewerId === playerId} /> : <p>{t('No army assigned to this player.')}</p>}
  </div></CommandDialog>
}
