// Design Ref: §4.2 — GET /api/admin/users/search?q=
// username 또는 email ILIKE 검색, 상위 20건.

import { NextRequest, NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/admin/guard'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(req: NextRequest) {
  const auth = await requireAdminApi('users')
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const q = (req.nextUrl.searchParams.get('q') ?? '').trim()
  if (q.length < 2) return NextResponse.json({ data: [] })

  const supabase = createAdminClient()

  // auth.users에 email이 있어서 admin client로 직접 조인할 수 없음. 두 단계로:
  // 1) profiles에서 username ILIKE 검색
  // 2) 이메일로도 가능하도록 auth.users를 직접 조회
  const [byUsername, byEmail] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, username, display_name, bonus_credits, suspended_at, created_at, is_admin')
      .ilike('username', `%${q}%`)
      .limit(20),
    // auth.users는 admin API로 조회
    supabase.auth.admin.listUsers({ page: 1, perPage: 50 }).then((res) => {
      if (res.error || !res.data?.users) return { data: [] as { id: string; email?: string }[] }
      const lower = q.toLowerCase()
      const matched = res.data.users
        .filter((u) => (u.email ?? '').toLowerCase().includes(lower))
        .map((u) => ({ id: u.id, email: u.email }))
      return { data: matched }
    }),
  ])

  if (byUsername.error) {
    console.error('[admin.search] username:', byUsername.error.message)
    return NextResponse.json({ error: 'search_failed' }, { status: 500 })
  }

  // Merge: byUsername의 id 우선, byEmail의 id 추가 (중복 제외)
  const ids = new Set(byUsername.data.map((r) => r.id))
  const extraIds = byEmail.data.filter((u) => !ids.has(u.id)).map((u) => u.id)

  let extraProfiles: typeof byUsername.data = []
  if (extraIds.length > 0) {
    const { data } = await supabase
      .from('profiles')
      .select('id, username, display_name, bonus_credits, suspended_at, created_at, is_admin')
      .in('id', extraIds)
    extraProfiles = data ?? []
  }

  const all = [...byUsername.data, ...extraProfiles].slice(0, 20)

  // email 부착
  const emailMap = new Map(byEmail.data.map((u) => [u.id, u.email]))

  // username만 검색된 경우엔 별도 email 조회 (간단히 listUsers 결과에서 매칭)
  // (정확한 이메일이 필요하면 admin.getUserById를 호출하지만 비용 절감)
  const data = all.map((p) => ({
    id: p.id,
    username: p.username,
    displayName: p.display_name,
    email: emailMap.get(p.id) ?? null,
    bonusCredits: p.bonus_credits ?? 0,
    suspendedAt: p.suspended_at,
    isAdmin: p.is_admin ?? false,
    createdAt: p.created_at,
  }))

  return NextResponse.json({ data })
}
