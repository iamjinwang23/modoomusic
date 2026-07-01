// POST /api/communities/[id]/post-images — 글 첨부 이미지 업로드(멤버). multipart 'files'(최대 10). webp 변환.
import { NextRequest, NextResponse } from 'next/server'
import { createUserClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { uploadImageBuffer } from '@/services/storage.service'

const MAX_FILES = 10
const MAX_BYTES = 8 * 1024 * 1024

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const userClient = await createUserClient()
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  // 멤버 또는 매니저 가드
  const admin = createAdminClient()
  const { data: mem } = await admin.from('community_members').select('user_id').eq('community_id', id).eq('user_id', user.id).maybeSingle()
  if (!mem) {
    const { data: c } = await admin.from('communities').select('manager_id').eq('id', id).maybeSingle()
    if (!c) return NextResponse.json({ error: 'not_found' }, { status: 404 })
    if (c.manager_id !== user.id) return NextResponse.json({ error: 'not_member' }, { status: 403 })
  }

  let form: FormData
  try { form = await req.formData() } catch { return NextResponse.json({ error: 'invalid_input' }, { status: 400 }) }
  const files = form.getAll('files').filter((f): f is File => f instanceof File).slice(0, MAX_FILES)
  if (files.length === 0) return NextResponse.json({ error: 'no_file' }, { status: 400 })

  const urls: string[] = []
  for (const file of files) {
    if (file.size > MAX_BYTES || !file.type.startsWith('image/')) continue
    const buffer = Buffer.from(await file.arrayBuffer())
    const rand = Math.random().toString(36).slice(2, 10)
    const url = await uploadImageBuffer(buffer, 'community-images', `posts/${id}/${rand}.webp`, 1600)
    if (url) urls.push(url)
  }
  if (urls.length === 0) return NextResponse.json({ error: 'upload_failed' }, { status: 500 })
  return NextResponse.json({ urls })
}
