// Design Ref: §4 — GET /api/admin/users/[id] 사용자 상세

import { NextRequest, NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/admin/guard'
import { createAdminClient } from '@/lib/supabase/admin'

interface RouteParams { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: RouteParams) {
  const auth = await requireAdminApi()
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { id } = await params
  const supabase = createAdminClient()

  const [profileRes, userRes, songsCountRes] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, username, display_name, bio, avatar_url, bonus_credits, daily_credits_used, is_admin, admin_permissions, suspended_at, suspended_reason, suspended_by, deleted_at, created_at, song_count, follower_count, following_count')
      .eq('id', id)
      .maybeSingle(),
    supabase.auth.admin.getUserById(id),
    supabase.from('songs').select('id', { count: 'exact', head: true }).eq('user_id', id),
  ])

  if (profileRes.error) {
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }
  if (!profileRes.data) {
    return NextResponse.json({ error: 'user_not_found' }, { status: 404 })
  }

  const p = profileRes.data
  return NextResponse.json({
    data: {
      id: p.id,
      username: p.username,
      displayName: p.display_name,
      bio: p.bio,
      avatarUrl: p.avatar_url,
      email: userRes.data?.user?.email ?? null,
      provider: userRes.data?.user?.app_metadata?.provider ?? null,
      bonusCredits: p.bonus_credits ?? 0,
      dailyCreditsUsed: p.daily_credits_used ?? 0,
      isAdmin: p.is_admin ?? false,
      adminPermissions: (p.admin_permissions as string[] | null) ?? null,
      suspendedAt: p.suspended_at,
      suspendedReason: p.suspended_reason,
      suspendedBy: p.suspended_by,
      deletedAt: p.deleted_at ?? null,
      songCount: songsCountRes.count ?? 0,
      followerCount: p.follower_count ?? 0,
      followingCount: p.following_count ?? 0,
      createdAt: p.created_at,
    },
  })
}
