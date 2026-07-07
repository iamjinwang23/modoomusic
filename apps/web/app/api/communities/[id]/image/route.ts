// POST /api/communities/[id]/image — 커버/대표 이미지 업로드(매니저만). multipart: type=cover|avatar, file
import { NextRequest, NextResponse } from 'next/server'
import { createUserClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { uploadImageBuffer } from '@/services/storage.service'
import { updateCommunity } from '@/services/community.service'

const MAX_BYTES = 8 * 1024 * 1024  // 8MB

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const userClient = await createUserClient()
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  // 매니저 가드
  const admin = createAdminClient()
  const { data: c } = await admin.from('communities').select('manager_id').eq('id', id).maybeSingle()
  if (!c) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  if (c.manager_id !== user.id) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  let form: FormData
  try { form = await req.formData() } catch { return NextResponse.json({ error: 'invalid_input' }, { status: 400 }) }
  const type = form.get('type')
  const file = form.get('file')
  const focus = form.get('focus')
  if (type !== 'cover' && type !== 'avatar') return NextResponse.json({ error: 'invalid_type' }, { status: 400 })
  if (!(file instanceof File)) return NextResponse.json({ error: 'no_file' }, { status: 400 })
  if (file.size > MAX_BYTES) return NextResponse.json({ error: 'too_large' }, { status: 400 })
  if (!file.type.startsWith('image/')) return NextResponse.json({ error: 'not_image' }, { status: 400 })

  const buffer = Buffer.from(await file.arrayBuffer())
  const rand = Math.random().toString(36).slice(2, 10)
  const maxPx = type === 'cover' ? 1600 : 512
  const path = `${id}/${type}-${rand}.webp`
  const url = await uploadImageBuffer(buffer, 'community-images', path, maxPx)
  if (!url) return NextResponse.json({ error: 'upload_failed' }, { status: 500 })

  const patch = type === 'cover'
    ? { coverImage: url, coverFocus: typeof focus === 'string' && focus ? focus : '50% 50%' }
    : { avatarImage: url }
  const result = await updateCommunity(user.id, id, patch)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 500 })
  return NextResponse.json({ url, community: result.community })
}
