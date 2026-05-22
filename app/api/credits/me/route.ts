import { NextResponse } from 'next/server'
import { createUserClient } from '@/lib/supabase/server'
import { getCreditState } from '@/services/credit.service'

export async function GET() {
  const userClient = await createUserClient()
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  }
  const state = await getCreditState(user.id)
  return NextResponse.json(state)
}
