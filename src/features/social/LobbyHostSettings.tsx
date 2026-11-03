import { t as tr } from '../i18n/locale'
import { useEffect, useMemo, useState } from 'react'
import { sharedSessionTransport } from '../../multiplayer/supabaseRestTransport'
import { useSharedSessionStore } from '../../multiplayer/sharedSessionStore'
import type { HostLobbySettings } from '../../multiplayer/types'

/** Room ownership—not a guest seat—grants authority to assign teams and turns. */
export function LobbyHostSettings() {
  const { membership, inspection, participants } = useSharedSessionStore()
  const room = inspection?.room
  const original = inspection?.hostSettings
  const [order, setOrder] = useState<string[]>([])
  const [partner, setPartner] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const seats = room?.sessionSnapshot.setup.players ?? []
  const doubles = room?.sessionSnapshot.setup.doubles
  const captains = doubles?.forces.map(force => force.captainPlayerId) ?? []
  const nonCaptains = seats.map(s=>s.id).filter(id=>!captains.includes(id))
  const officialOrder = useMemo(() => original?.turnOrder ?? room?.sessionSnapshot.setup.turnOrder ?? [], [original, room])
  const memberA = original?.teamAlpha ?? doubles?.forces[0]?.memberPlayerIds ?? []
  const settingId = membership ? `${membership.roomId}:${membership.clientId}` : ''

  useEffect(() => {
    setOrder([...officialOrder])
    setPartner(memberA.find(id=>!captains.includes(id)) ?? '')
    setSaved(false)
  }, [settingId,officialOrder.join('|'),memberA.join('|')])

  if (!membership?.isHost || !room?.bringYourArmy || room.startedAt) return null

  const activeOrder = order.length ? order : officialOrder
  const label = (id: string) => participants.find(p=>p.playerId===id)?.displayName
    ?? seats.find(p=>p.id===id)?.name ?? id

  function move(id: string, offset: number) {
    setSaved(false)
    setOrder(current => {
      const currentOrder = current.length ? [...current] : [...officialOrder]
      const idx=currentOrder.indexOf(id)
      const target=idx+offset
      if(idx<0||target<0||target>=currentOrder.length)return currentOrder
      ;[currentOrder[idx],currentOrder[target]]=[currentOrder[target],currentOrder[idx]]
      return currentOrder
    })
  }

  async function save() {
    const activeMembership=membership
    if(busy || !activeMembership) return
    setBusy(true);setError('');setSaved(false)
    try {
      const settings:HostLobbySettings = {
        turnOrder:activeOrder,
        teamAlpha:doubles ? [captains[0],partner] : [],
      }
      await sharedSessionTransport.setHostLobbySettings(activeMembership.roomId,activeMembership.clientId,settings)
      const latest=await sharedSessionTransport.inspectRoom(activeMembership.roomCode)
      if(latest && useSharedSessionStore.getState().membership?.roomId===activeMembership.roomId) {
        useSharedSessionStore.setState({inspection:latest,participants:latest.participants})
      }
      setSaved(true)
    } catch(err) {
      setError(err instanceof Error?err.message:String(err))
    } finally {setBusy(false)}
  }

  return <section className="panel lobby-host-settings" aria-label={tr("Host lobby settings")}>
    <h2>{tr("Host · turn order and teams")}</h2>
    <p className="context-note">{tr("Only the room host can change these settings. Save before everyone marks Ready; changing settings clears all Ready confirmations.")}</p>
    <div className="shared-host-turn-order">
      <h3>{tr("Turn order")}</h3>
      {activeOrder.map((id,index)=><div key={id} className="row">
        <strong>{index+1}. {doubles ? (captains[0]===id ? doubles.forces[0].name : doubles.forces[1].name) : label(id)}</strong>
        <button type="button" disabled={busy||index===0} onClick={()=>move(id,-1)} aria-label={tr(`Move ${label(id)} earlier`, "Move {0} earlier")}>↑</button>
        <button type="button" disabled={busy||index===activeOrder.length-1} onClick={()=>move(id,1)} aria-label={tr(`Move ${label(id)} later`, "Move {0} later")}>↓</button>
      </div>)}
    </div>
    {doubles && <label>{tr("Team Alpha · choose partner for ")}{label(captains[0])}
      <select value={partner} onChange={e=>{setPartner(e.target.value);setSaved(false)}} disabled={busy}>
        {nonCaptains.map(id=><option key={id} value={id}>{label(id)}</option>)}
      </select>
      <small>{tr("Team Bravo: ")}{label(captains[1])} + {label(nonCaptains.find(id=>id!==partner)??'')}</small>
    </label>}
    <button type="button" className="button button--gold" disabled={busy || (doubles&&!partner)} onClick={()=>void save()}>{busy?tr('Saving…'):tr('Save host settings')}</button>
    {saved && <p role="status">{tr("Room turn order and teams saved.")}</p>}
    {error && <p className="alert alert--danger" role="alert">{tr(error)}</p>}
  </section>
}
