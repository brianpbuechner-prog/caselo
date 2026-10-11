import { infiniteCampus } from './infinite-campus/fields'
import type { SisCatalog } from './types'

// Supported SIS platforms. Add a new catalog here to support another SIS.
export const CATALOGS: SisCatalog[] = [infiniteCampus]

export const DEFAULT_CATALOG = infiniteCampus

export function getCatalog(id: string): SisCatalog {
  return CATALOGS.find((c) => c.id === id) ?? DEFAULT_CATALOG
}
