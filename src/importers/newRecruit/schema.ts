import { z } from 'zod'

export type NewRecruitCost = {
  name?: string
  typeId?: string
  value?: number
}

export type NewRecruitCharacteristic = {
  name?: string
  value?: string | number
  $text?: string | number
}

export type NewRecruitProfile = {
  id?: string
  name?: string | number
  typeName?: string
  characteristics?: NewRecruitCharacteristic[]
}

export type NewRecruitAssociation = {
  type?: string
  name?: string
  to?: string
  from?: string
}

export type NewRecruitCategory = {
  id?: string
  name?: string
  primary?: boolean
}

export type NewRecruitSelection = {
  id?: string
  name?: string | number
  type?: string
  typeName?: string
  costs?: NewRecruitCost[]
  profiles?: NewRecruitProfile[]
  selections?: NewRecruitSelection[]
  associations?: NewRecruitAssociation[]
  categories?: NewRecruitCategory[]
  number?: number
}

export type NewRecruitForce = {
  id?: string
  name?: string
  catalogueName?: string
  selections?: NewRecruitSelection[]
}

export type NewRecruitRoster = {
  id?: string
  name?: string | number
  costs?: NewRecruitCost[]
  forces?: NewRecruitForce[]
}

const CostSchema: z.ZodType<NewRecruitCost> = z.object({
  name: z.string().optional(),
  typeId: z.string().optional(),
  value: z.number().finite().optional(),
}).passthrough()

const CharacteristicSchema: z.ZodType<NewRecruitCharacteristic> = z.object({
  name: z.string().optional(),
  value: z.union([z.string(), z.number()]).optional(),
  $text: z.union([z.string(), z.number()]).optional(),
}).passthrough()

const ProfileSchema: z.ZodType<NewRecruitProfile> = z.object({
  id: z.string().optional(),
  name: z.union([z.string(), z.number()]).optional(),
  typeName: z.string().optional(),
  characteristics: z.array(CharacteristicSchema).optional(),
}).passthrough()

const AssociationSchema: z.ZodType<NewRecruitAssociation> = z.object({
  type: z.string().optional(),
  name: z.string().optional(),
  to: z.string().optional(),
  from: z.string().optional(),
}).passthrough()

const CategorySchema: z.ZodType<NewRecruitCategory> = z.object({
  id: z.string().optional(),
  name: z.string().optional(),
  primary: z.boolean().optional(),
}).passthrough()

const SelectionSchema: z.ZodType<NewRecruitSelection> = z.lazy(() => z.object({
  id: z.string().optional(),
  name: z.union([z.string(), z.number()]).optional(),
  type: z.string().optional(),
  typeName: z.string().optional(),
  costs: z.array(CostSchema).optional(),
  profiles: z.array(ProfileSchema).optional(),
  selections: z.array(SelectionSchema).optional(),
  associations: z.array(AssociationSchema).optional(),
  categories: z.array(CategorySchema).optional(),
  number: z.number().finite().optional(),
}).passthrough())

const ForceSchema: z.ZodType<NewRecruitForce> = z.object({
  id: z.string().optional(),
  name: z.string().optional(),
  catalogueName: z.string().optional(),
  selections: z.array(SelectionSchema).optional(),
}).passthrough()

const RosterSchema: z.ZodType<NewRecruitRoster> = z.object({
  id: z.string().optional(),
  name: z.union([z.string(), z.number()]).optional(),
  costs: z.array(CostSchema).optional(),
  forces: z.array(ForceSchema).optional(),
}).passthrough()

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function parseNewRecruitRoster(raw: unknown): NewRecruitRoster {
  if (raw === null || raw === undefined) {
    throw new Error('No New Recruit JSON was provided.')
  }

  const candidate = isRecord(raw) && raw.roster !== undefined ? raw.roster : raw
  const result = RosterSchema.safeParse(candidate)
  if (!result.success) {
    const issue = result.error.issues[0]
    const path = issue?.path.length ? ` at ${issue.path.join('.')}` : ''
    throw new Error(`Invalid New Recruit roster${path}: ${issue?.message ?? 'unknown schema error'}`)
  }

  if (!result.data.forces?.length) {
    throw new Error('Invalid New Recruit roster: no forces were found.')
  }

  return result.data
}
