// 일회성 마이그레이션 — Supabase Storage 기존 파일들의 Cache-Control 헤더를
// 1년 immutable로 일괄 갱신. Cached Egress 절감 목적.
//
// 실행: node --env-file=.env.local scripts/migrate-cache-control.mjs
//
// 안전성:
// - download → update 왕복 (Supabase는 메타만 갱신하는 API 없음)
// - upsert: true 로 파일 자체는 동일 콘텐츠 재업로드
// - 파일 콘텐츠는 그대로, 헤더만 바뀜
// - 진행 중 끊겨도 다시 실행하면 됨 (idempotent)

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error('NEXT_PUBLIC_SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY 가 없습니다.')
  console.error('실행: node --env-file=.env.local scripts/migrate-cache-control.mjs')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const CACHE = '31536000, immutable'

/**
 * 버킷을 재귀 walk 해서 모든 파일 경로 반환.
 * Supabase list()는 페이지당 max 100~1000, 폴더는 id=null로 표기됨.
 */
async function listAllFiles(bucket, prefix = '') {
  const all = []
  let offset = 0
  const limit = 1000
  while (true) {
    const { data, error } = await supabase.storage.from(bucket).list(prefix, { limit, offset })
    if (error) {
      console.error(`list ${bucket}/${prefix} 실패:`, error.message)
      break
    }
    if (!data || data.length === 0) break

    for (const item of data) {
      if (item.id === null) {
        // 폴더 → 재귀
        const subPrefix = prefix ? `${prefix}/${item.name}` : item.name
        const subFiles = await listAllFiles(bucket, subPrefix)
        all.push(...subFiles)
      } else {
        all.push(prefix ? `${prefix}/${item.name}` : item.name)
      }
    }
    if (data.length < limit) break
    offset += limit
  }
  return all
}

function detectContentType(path, blobType) {
  if (blobType && blobType !== 'application/octet-stream') return blobType
  if (path.endsWith('.mp3')) return 'audio/mpeg'
  if (path.endsWith('.webp')) return 'image/webp'
  if (path.endsWith('.jpg') || path.endsWith('.jpeg')) return 'image/jpeg'
  if (path.endsWith('.png')) return 'image/png'
  return 'application/octet-stream'
}

async function bumpCacheControl(bucket) {
  console.log(`\n=== ${bucket} ===`)
  const t0 = Date.now()
  const paths = await listAllFiles(bucket)
  console.log(`  파일 ${paths.length}개 발견`)
  if (paths.length === 0) return { ok: 0, fail: 0 }

  let ok = 0
  let fail = 0
  for (let i = 0; i < paths.length; i++) {
    const path = paths[i]
    try {
      const { data: blob, error: dlErr } = await supabase.storage.from(bucket).download(path)
      if (dlErr || !blob) {
        fail++
        console.error(`  ✗ ${path}: download ${dlErr?.message ?? 'no blob'}`)
        continue
      }
      const contentType = detectContentType(path, blob.type)
      const { error: upErr } = await supabase.storage.from(bucket).update(path, blob, {
        cacheControl: CACHE,
        upsert: true,
        contentType,
      })
      if (upErr) {
        fail++
        console.error(`  ✗ ${path}: update ${upErr.message}`)
        continue
      }
      ok++
      if (ok % 10 === 0 || ok === paths.length) {
        const pct = ((i + 1) / paths.length * 100).toFixed(0)
        console.log(`  ... ${ok}/${paths.length} (${pct}%)`)
      }
    } catch (e) {
      fail++
      console.error(`  ✗ ${path}:`, e?.message ?? e)
    }
  }
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1)
  console.log(`  완료: 성공 ${ok}, 실패 ${fail}, 소요 ${elapsed}s`)
  return { ok, fail }
}

async function main() {
  console.log('Supabase Storage Cache-Control 마이그레이션 시작')
  console.log(`프로젝트: ${SUPABASE_URL}`)
  console.log(`Cache-Control: ${CACHE}`)

  const buckets = ['songs-audio', 'songs-covers', 'profile-images']
  let totalOk = 0
  let totalFail = 0
  for (const b of buckets) {
    const { ok, fail } = await bumpCacheControl(b)
    totalOk += ok
    totalFail += fail
  }
  console.log(`\n=== 전체 완료 ===`)
  console.log(`성공: ${totalOk}, 실패: ${totalFail}`)
  if (totalFail > 0) process.exit(1)
}

await main()
