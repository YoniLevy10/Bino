import { z } from 'zod'

export const metaExternalIdSchema = z.string().min(1)

export type MetaObjectKind = 'campaign' | 'adset' | 'ad' | 'creative' | 'adaccount' | 'page' | 'pixel'
