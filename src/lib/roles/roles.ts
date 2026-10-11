// Roles decide which result views appear and in what order. Only the
// counselor role exists for now. To add a role, add an entry here and,
// if needed, a new view component in components/results.

export type ViewId = 'missing' | 'summary' | 'change' | 'byGrade' | 'students'

export interface Role {
  id: string
  label: string
  views: ViewId[]
}

export const ROLES: Role[] = [
  {
    id: 'counselor',
    label: 'Counselor',
    views: ['missing', 'summary', 'change', 'byGrade', 'students'],
  },
]

export function getRole(id: string | undefined): Role {
  return ROLES.find((r) => r.id === id) ?? ROLES[0]
}
