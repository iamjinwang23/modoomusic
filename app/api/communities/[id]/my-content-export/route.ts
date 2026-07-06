// GET /api/communities/[id]/my-content-export — 본인 글을 읽기용 텍스트(.txt)로 내보내기(멤버 가드). §13.3
import { NextRequest, NextResponse } from 'next/server'
import { createUserClient } from '@/lib/supabase/server'
import { getCommunity } from '@/services/community.service'
import { exportMemberContent, type MemberExport } from '@/services/community-post.service'

// 한국 시간대(KST) 기준 사람이 읽는 날짜
function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  })
}
function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' })
}

function renderText(data: MemberExport): string {
  const DIV = '─'.repeat(30)
  const lines: string[] = [
    `[${data.community.name}] 내 글 백업`,
    `내보낸 날짜: ${fmtDate(data.exportedAt)}`,
    `총 ${data.posts.length}개`,
    '',
  ]
  if (data.posts.length === 0) {
    lines.push('작성한 글이 없어요.')
  }
  for (const p of data.posts) {
    lines.push(DIV)
    lines.push(fmtDateTime(p.createdAt))
    if (p.content) lines.push(p.content)
    if (p.songTitle) lines.push(`🎵 첨부곡: ${p.songTitle}${p.songUrl ? ` (${p.songUrl})` : ''}`)
    if (p.images.length > 0) lines.push(`🖼 이미지: ${p.images.join(', ')}`)
    if (p.linkUrl) lines.push(`🔗 링크: ${p.linkUrl}`)
    lines.push('')
  }
  return lines.join('\n')
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const userClient = await createUserClient()
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const community = await getCommunity(id, user.id)
  if (!community) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  if (!community.isMember && !community.isManager) return NextResponse.json({ error: 'not_member' }, { status: 403 })

  const data = await exportMemberContent(user.id, id)
  if (!data) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  // BOM(﻿) 선두 — 구형 편집기에서도 한글 UTF-8 인식. 한글 파일명은 filename* 로.
  const body = '﻿' + renderText(data)
  const utf8Name = encodeURIComponent(`${data.community.name}-내글.txt`)
  return new NextResponse(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Content-Disposition': `attachment; filename="my-posts.txt"; filename*=UTF-8''${utf8Name}`,
    },
  })
}
