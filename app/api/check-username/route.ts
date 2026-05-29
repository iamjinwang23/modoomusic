import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const USERNAME_RE = /^[a-z0-9._]{4,30}$/

export async function GET(req: NextRequest) {
  const username = req.nextUrl.searchParams.get('username')?.toLowerCase()

  if (!username) return NextResponse.json({ available: false, reason: 'empty' })
  if (!USERNAME_RE.test(username)) return NextResponse.json({ available: false, reason: 'invalid' })
  if (/\.\./.test(username) || username.startsWith('.') || username.endsWith('.'))
    return NextResponse.json({ available: false, reason: 'invalid' })

  const supabase = await createClient()
  const { data } = await supabase
    .from('profiles')
    .select('username')
    .eq('username', username)
    .maybeSingle()

  return NextResponse.json({ available: !data })
}
