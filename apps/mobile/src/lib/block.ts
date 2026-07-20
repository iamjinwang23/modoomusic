import { api } from './api'

export interface BlockedUser {
  id: string
  username: string | null
  display_name: string | null
  avatar_url: string | null
  avatar_hue: number | null
}

export const blockUser = (userId: string) => api.post(`/api/users/${userId}/block`)
export const unblockUser = (userId: string) => api.del(`/api/users/${userId}/block`)

export const listBlocked = async (): Promise<BlockedUser[]> => {
  const r = (await api.get('/api/users/blocked')) as { blocked: BlockedUser[] }
  return r.blocked ?? []
}
