// Roles decide which result tabs appear and in what order. Only the
// counselor role exists for now. To add a role, add an entry here and,
// if needed, a new tab component in components/results.

export type TabId = 'students' | 'caseload'

export interface Role {
  id: string
  label: string
  tabs: TabId[]
}

export const ROLES: Role[] = [
  {
    id: 'counselor',
    label: 'Counselor',
    tabs: ['students', 'caseload'],
  },
]

export function getRole(id: string | undefined): Role {
  return ROLES.find((r) => r.id === id) ?? ROLES[0]
}
