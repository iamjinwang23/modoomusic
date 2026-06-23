// 현재 활성 팝업 공지 1건 — 우측 하단 카드 모달용 (공개, anon RLS=published)
//   popup_enabled + 게시 + (예약/팝업 기간) 게이팅. 없으면 { popup: null }.
import { NextResponse } from 'next/server'
import { createUserClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const supabase = await createUserClient()
    const nowIso = new Date().toISOString()
    const { data, error } = await supabase
      .from('announcements')
      .select('id, title, category, image_url')
      .eq('popup_enabled', true)
      .eq('status', 'published')
      .or(`publish_at.is.null,publish_at.lte.${nowIso}`)
      .or(`popup_starts_at.is.null,popup_starts_at.lte.${nowIso}`)
      .or(`popup_ends_at.is.null,popup_ends_at.gte.${nowIso}`)
      .limit(1)
      .maybeSingle()
    if (error || !data) return NextResponse.json({ popup: null })
    return NextResponse.json({
      popup: { id: data.id, title: data.title, category: data.category, imageUrl: data.image_url },
    })
  } catch {
    // 마이그레이션 전 배포 등 컬럼 부재 시에도 앱이 깨지지 않도록 null 폴백
    return NextResponse.json({ popup: null })
  }
}
