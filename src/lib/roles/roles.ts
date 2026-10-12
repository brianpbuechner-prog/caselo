// Roles decide what the short "start here" section at the top of the
// results shows. The rest of the page is the same for every role. The
// chosen role is remembered in this browser; it contains no student data.
//
// To add a role, add an entry here. If it needs a new kind of brief, add
// it to components/results/Brief.tsx.

export type BriefKind = 'students' | 'groups'

export interface Role {
  id: string
  label: string
  /** students: a short list of individual students. groups: grades and areas, no names. */
  brief: BriefKind
}

export const ROLES: Role[] = [
  { id: 'counselor', label: 'Counselor', brief: 'students' },
  { id: 'administrator', label: 'Administrator', brief: 'groups' },
]

export function getRole(id: string | undefined): Role {
  return ROLES.find((r) => r.id === id) ?? ROLES[0]
}
