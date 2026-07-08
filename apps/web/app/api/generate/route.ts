import { NextRequest, NextResponse, after } from 'next/server'
import { generateSong, generateCoverImage, MOCK_MODE, MODELS, creditsForModel, type MusicModelId } from '@/services/minimax.service'
import { uploadFromUrl } from '@/services/storage.service'
import { createUserClient } from '@/lib/supabase/server'
import { requireActiveUser } from '@/lib/auth/active-user'
import { createAdminClient } from '@/lib/supabase/admin'
import { tryConsumeCredits, refundCredits } from '@/services/credit.service'
import { generateLyrics } from '@/services/lyrics.service'
import { inferTags } from '@/utils/extractTags'
import { sendPushToUser } from '@/services/push.service'

// 이미지 생성 프롬프트 우선순위: 가사 → 제목 → 스타일
// 의미 없는 단순 반복(ㅋㅋ, 1111 등)은 다음 후보로 fallback.
function pickImagePrompt({ customLyrics, title, prompt }: { customLyrics?: string; title?: string; prompt: string }): string {
  const cleanLyrics = (typeof customLyrics === 'string' ? customLyrics : '').replace(/\[.*?\]/g, '').trim()
  if (isMeaningful(cleanLyrics, 12)) return cleanLyrics.slice(0, 300)
  const t = (typeof title === 'string' ? title : '').trim()
  if (isMeaningful(t, 2)) return t
  return prompt.trim()
}

function isMeaningful(s: string, minLen: number): boolean {
  if (s.length < minLen) return false
  const noWhitespace = s.replace(/\s+/g, '')
  if (noWhitespace.length === 0) return false
  const uniqueChars = new Set(noWhitespace.split('')).size
  return uniqueChars >= 3
}

export async function POST(req: NextRequest) {
  const { prompt, genre, mood, title, customLyrics, instrumental, model, audioBase64, autoLyrics } = await req.json()

  if (!prompt?.trim()) {
    return NextResponse.json({ error: '스타일을 입력해주세요' }, { status: 400 })
  }

  const trimmedLyrics = typeof customLyrics === 'string' ? customLyrics.trim() : ''
  if (!instrumental && trimmedLyrics.length > 0 && trimmedLyrics.length < 10) {
    return NextResponse.json(
      { error: '가사가 너무 짧아요. 최소 10자 이상 입력하거나 비워두면 인스트루멘탈로 만들어져요' },
      { status: 400 },
    )
  }

  // ── 1) 인증 + 정지·탈퇴 차단
  // Design Ref: admin Module 4 — 정지 사용자가 곡 생성 못 하도록 서버 가드.
  const activeAuth = await requireActiveUser()
  if (!activeAuth.ok) {
    if (activeAuth.error === 'account_suspended') {
      return NextResponse.json(
        { error: '계정이 정지되어 곡을 만들 수 없어요', code: 'ACCOUNT_SUSPENDED', reason: activeAuth.reason },
        { status: 403 },
      )
    }
    if (activeAuth.error === 'account_deleted') {
      return NextResponse.json({ error: '탈퇴 처리된 계정이에요', code: 'ACCOUNT_DELETED' }, { status: 410 })
    }
    return NextResponse.json({ error: '로그인이 필요해요' }, { status: 401 })
  }
  const userClient = await createUserClient()
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: '로그인이 필요해요' }, { status: 401 })
  }

  // ── 2) 모델 체크
  const modelDef = MODELS.find((m) => m.id === model)
  if (!modelDef) {
    return NextResponse.json({ error: '알 수 없는 모델이에요' }, { status: 400 })
  }
  if (modelDef.locked) {
    return NextResponse.json({ error: '이 모델은 곧 출시될 Plus 플랜에서 이용할 수 있어요', code: 'MODEL_LOCKED' }, { status: 403 })
  }

  // ── 3) 크레딧 선차감
  const cost = creditsForModel(model as MusicModelId)
  const consume = await tryConsumeCredits(user.id, cost)
  if (!consume.ok) {
    const isExhausted = consume.state.remaining === 0
    const message = isExhausted
      ? '오늘의 크레딧을 모두 사용했어요. 내일 자정에 리셋돼요'
      : `크레딧이 부족해요. 남은 ${consume.state.remaining}크레딧 (필요 ${cost}크레딧)`
    return NextResponse.json(
      { error: message, code: 'DAILY_LIMIT', credits: consume.state },
      { status: 429 },
    )
  }

  // ── 4) songs INSERT (status=generating). 백그라운드 실패해도 row가 남아 cleanup cron이 처리
  const admin = createAdminClient()
  const songId = crypto.randomUUID()
  const inferred = (!genre || !mood)
    ? inferTags({ prompt, title, lyrics: null, customLyrics })
    : { genre: null, mood: null }
  // autoLyrics(심플 보컬)는 INSERT 시점엔 가사가 비어 있어도 이후 자동 생성되므로 instrumental 아님
  const isInstrumental = !!instrumental || (!autoLyrics && trimmedLyrics.length === 0)
  const coverHue = Math.floor(Math.random() * 360)
  const nowIso = new Date().toISOString()

  const insertRow = {
    id: songId,
    user_id: user.id,
    title: typeof title === 'string' && title.trim() ? title.trim() : null,
    prompt: prompt.trim(),
    genre: genre || inferred.genre,
    mood: mood || inferred.mood,
    custom_lyrics: customLyrics || null,
    lyrics: null as string | null,
    instrumental: isInstrumental,
    audio_url: null as string | null,
    duration: null as number | null,
    liked: false,
    cover_image: null as string | null,
    cover_hue: coverHue,
    is_new: true,
    is_public: false,
    status: 'generating' as const,
    model: model as string,  // 생성 모델 기록 (배지 노출용, mig 029)
    created_at: nowIso,
  }

  const { data: inserted, error: insertErr } = await admin
    .from('songs')
    .insert(insertRow)
    .select('*')
    .single()

  if (insertErr || !inserted) {
    console.error('[generate] songs INSERT 실패:', insertErr?.message)
    await refundCredits(user.id, cost, consume.consumed)
    return NextResponse.json({ error: '곡 row 생성 실패' }, { status: 500 })
  }

  // ── 5) 백그라운드: MiniMax + Storage + UPDATE → status=done. 실패 시 status=failed + 환불
  after(async () => {
    try {
      // 심플 모드 자동작사: 설명(prompt)으로 가사·스타일·제목 생성 후 음악 생성에 반영
      // (레이트리밋 미적용 — 크레딧이 게이트). 인스트루멘탈은 작사 생략.
      let genPrompt = prompt.trim()
      let genLyrics: string | undefined = customLyrics
      let autoTitle: string | null = null
      let autoStyleTags: string | null = null
      if (autoLyrics && !instrumental) {
        const lyr = await generateLyrics(genPrompt)
        genLyrics = lyr.lyrics
        genPrompt = [lyr.styleTags, prompt.trim()].filter(Boolean).join('. ')
        autoTitle = lyr.songTitle || null
        autoStyleTags = lyr.styleTags || null
      } else if (!inserted.title && genLyrics && genLyrics.trim().length >= 10) {
        // 고급 모드 자동 제목: title 비어있고 가사 있으면 lyrics_generation 재호출해 song_title만 채택
        // (반환된 lyrics·style_tags는 무시 — 사용자 입력 가사 유지)
        try {
          const titleGen = await generateLyrics(genLyrics)
          if (titleGen.songTitle) autoTitle = titleGen.songTitle
        } catch (e) {
          // 자동 제목 실패는 무시 (음악 생성 흐름 계속)
          console.warn('[generate] auto-title from lyrics failed:', e)
        }
      }

      const imagePromptInput = pickImagePrompt({ customLyrics: genLyrics, title, prompt })
      const [songResult, coverUrl] = await Promise.all([
        generateSong({ prompt: genPrompt, genre, mood, customLyrics: genLyrics, instrumental, model, audioBase64 }),
        generateCoverImage([genre, mood, imagePromptInput].filter(Boolean).join(', ')),
      ])

      let finalAudioUrl: string | null = songResult.audioUrl
      let finalCoverUrl: string | null = coverUrl
      if (!MOCK_MODE) {
        const storageId = crypto.randomUUID()
        const [permAudio, permCover] = await Promise.all([
          uploadFromUrl(songResult.audioUrl, 'songs-audio', `${storageId}.mp3`),
          coverUrl ? uploadFromUrl(coverUrl, 'songs-covers', `${storageId}.webp`, { toWebp: { maxPx: 800, quality: 85 } }) : Promise.resolve(null),
        ])
        if (permAudio) finalAudioUrl = permAudio
        if (permCover) finalCoverUrl = permCover
      }

      const updatePatch: Record<string, unknown> = {
        audio_url: finalAudioUrl,
        cover_image: finalCoverUrl,
        // 우리가 보낸 가사(커스텀/AI) 우선 — MiniMax는 모델·모드에 따라 lyrics를 응답에 안 돌려줘서
        // songResult.lyrics만 쓰면 일부 곡 가사가 null로 저장돼 상세에서 안 보임.
        lyrics: genLyrics?.trim() || songResult.lyrics?.trim() || null,
        status: 'done',
      }
      // 자동 제목: 클라가 제목을 비워 보냈을 때만 song_title로 채움 (사용자 제목 미덮어쓰기)
      if (autoTitle && !inserted.title) updatePatch.title = autoTitle
      // 심플 모드 스타일: 설명 원문 대신 AI 추출 style_tags를 곡 스타일(prompt)로 저장
      if (autoStyleTags) updatePatch.prompt = autoStyleTags

      const { error: updErr } = await admin
        .from('songs')
        .update(updatePatch)
        .eq('id', songId)
      if (updErr) {
        console.error('[generate bg] UPDATE 실패:', updErr.message)
        return
      }

      // song_complete 알림 + 웹 푸시(앱 닫혀 있어도 — 생성 중 이탈 잦음)
      const { error: notifErr } = await admin
        .from('notifications')
        .insert({ user_id: user.id, type: 'song_complete', song_id: songId })
      if (notifErr) console.error('[generate bg] notif INSERT 실패:', notifErr.message)
      const doneTitle = (typeof updatePatch.title === 'string' ? updatePatch.title : inserted.title) || '새 곡'
      await sendPushToUser(user.id, { title: '곡이 완성됐어요', body: doneTitle, url: '/library', tag: `song-${songId}`, data: { route: '/(tabs)' } }, 'song_complete')
    } catch (e) {
      console.error('[generate bg] 실패:', e instanceof Error ? e.message : e)
      await admin.from('songs').update({ status: 'failed' }).eq('id', songId)
      await refundCredits(user.id, cost, consume.consumed)
    }
  })

  // ── 6) 즉시 응답: 클라이언트는 이 song을 캐시에 추가해 "생성 중" row로 표시
  return NextResponse.json({
    song: {
      id: inserted.id,
      createdAt: inserted.created_at,
      title: inserted.title,
      prompt: inserted.prompt,
      genre: inserted.genre,
      mood: inserted.mood,
      customLyrics: inserted.custom_lyrics,
      lyrics: inserted.lyrics,
      instrumental: inserted.instrumental,
      audioUrl: inserted.audio_url ?? '',
      duration: inserted.duration,
      liked: false,
      coverImage: undefined,
      coverHue: inserted.cover_hue ?? coverHue,
      isNew: true,
      published: false,
      playCount: 0,
      likeCount: 0,
      status: inserted.status ?? 'generating',
    },
    credits: consume.state,
  })
}
