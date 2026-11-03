import { database } from '../../persistence/storage'
import { legacyOwner } from '../battleLegacy/repository'
import { accountRequest } from '../social/api'
import { createPortableUuid } from '../../multiplayer/uuid'
import type { Campaign } from './model'

export const assertCampaignOwner = (campaign: Campaign) => { if (campaign.ownerId !== legacyOwner()) throw new Error('Only the campaign host can edit this campaign.') }
export async function saveCampaign(campaign: Campaign, expectedMutationId?: string) {
 assertCampaignOwner(campaign)
 await database.transaction('rw', database.campaigns, async () => {
  const previous = await database.campaigns.get([campaign.ownerId, campaign.id])
  if (previous && expectedMutationId !== undefined && previous.mutationId !== expectedMutationId) throw new Error('Campaign changed. Reload before editing.')
  await database.campaigns.put(campaign)
 })
}
export type CloudCampaign = { campaign: Campaign; revision: number }
export async function cloudCampaigns(owner: string): Promise<Campaign[]> {
 if (owner === 'guest') return []
 const rows = await accountRequest<CloudCampaign[]>(owner, (client, token) => client.from('narrative_campaigns').select('campaign,revision').order('updated_at', { ascending: false }).setHeader('Authorization', `Bearer ${token}`))
 return rows.map(row => {
  if (row.campaign.schemaVersion !== 1 || !Number.isSafeInteger(row.revision)) throw new Error('Unsupported campaign data.')
  return { ...row.campaign, revision: row.revision, syncedMutationId: row.campaign.mutationId }
 })
}
export async function syncCampaign(campaign: Campaign): Promise<{ conflict?: Campaign }> {
 assertCampaignOwner(campaign)
 if (campaign.ownerId === 'guest') throw new Error('Sign in to share a private campaign with linked accounts.')
 const remote = (await cloudCampaigns(campaign.ownerId)).find(row => row.id === campaign.id)
 if (remote?.mutationId === campaign.mutationId) {
  await database.transaction('rw', database.campaigns, async () => {
   const current = await database.campaigns.get([campaign.ownerId,campaign.id])
   if (current) await database.campaigns.put({ ...current,revision:remote.revision,syncedMutationId:campaign.mutationId })
  })
  return {}
 }
 if (remote && remote.revision !== campaign.revision) {
  if (campaign.syncedMutationId === campaign.mutationId) { await saveCampaign(remote, campaign.mutationId); return {} }
  return { conflict: remote }
 }
 const { syncedMutationId: _synced, ...payload } = campaign
 const saved = await accountRequest<Campaign>(campaign.ownerId, (client, token) => client.rpc('save_narrative_campaign', { p_id: campaign.id, p_expected_revision: campaign.revision, p_mutation_id: campaign.mutationId, p_campaign: payload }).setHeader('Authorization', `Bearer ${token}`))
 assertCampaignOwner(campaign)
 await database.transaction('rw', database.campaigns, async () => {
  const current = await database.campaigns.get([campaign.ownerId, campaign.id])
  if (current) await database.campaigns.put({ ...current, revision: saved.revision, syncedMutationId: campaign.mutationId })
 })
 return {}
}
export async function resolveCampaignConflict(local: Campaign, remote: Campaign, choice: 'cloud' | 'local') {
 assertCampaignOwner(local)
 await saveCampaign(choice === 'cloud' ? remote : { ...local, revision: remote.revision, syncedMutationId: remote.mutationId, mutationId: createPortableUuid() }, local.mutationId)
}
