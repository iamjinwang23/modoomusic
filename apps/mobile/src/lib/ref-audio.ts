import * as FileSystem from 'expo-file-system/legacy'

// v2.6 스타일 참조 음원 — 파일 선택 + 검증 + base64. MiniMax cover 참조는 6초~6분 정책이나,
// base64를 JSON 바디로 POST /api/generate에 실어 보내므로 ⚠️Vercel serverless 요청 바디 한도(4.5MB)에 걸림.
// base64는 원본보다 ~33% 커지므로 원본 3MB(=base64 ~4MB)로 상한을 잡아 바디 한도 내로 유지(앱은 트림 미제공).
// ⚠️ expo-document-picker는 네이티브 모듈 — 미포함 빌드에서 import만 해도 크래시 → 지연 require로 가드.
const MAX_BYTES = 3 * 1024 * 1024  // 원본 3MB — 대략 30초~1분 클립. base64 후 ~4MB로 Vercel 4.5MB 한도 내.

export interface RefAudioResult {
  ok: boolean
  name?: string
  base64?: string
  error?: string
}

// 네이티브 모듈 존재 여부(재빌드 전엔 false) — require는 되지만 네이티브 미포함 시 함수가 undefined
export function refAudioAvailable(): boolean {
  try { return typeof require('expo-document-picker')?.getDocumentAsync === 'function' } catch { return false }
}

export async function pickRefAudio(): Promise<RefAudioResult> {
  let DocumentPicker: typeof import('expo-document-picker')
  try { DocumentPicker = require('expo-document-picker') } catch {
    return { ok: false, error: '이 기능은 다음 앱 업데이트에서 사용할 수 있어요' }
  }
  // 네이티브 미포함 빌드(현재 dev client 등) — 함수가 없으면 안전하게 안내만
  if (typeof DocumentPicker?.getDocumentAsync !== 'function') {
    return { ok: false, error: '이 기능은 다음 앱 업데이트에서 사용할 수 있어요' }
  }
  const res = await DocumentPicker.getDocumentAsync({
    type: 'audio/*',
    copyToCacheDirectory: true,
    multiple: false,
  })
  if (res.canceled || !res.assets?.length) return { ok: false }
  const a = res.assets[0]
  // 크기로 검증 — 초과 시 짧은 클립 유도(요청 바디 한도 때문)
  if (typeof a.size === 'number' && a.size > MAX_BYTES) {
    return { ok: false, error: '음원이 너무 커요. 30초~1분 정도의 짧은 클립을 올려주세요' }
  }
  try {
    const base64 = await FileSystem.readAsStringAsync(a.uri, { encoding: FileSystem.EncodingType.Base64 })
    return { ok: true, name: a.name, base64 }
  } catch {
    return { ok: false, error: '음원을 읽지 못했어요. 다른 파일을 시도해 주세요' }
  }
}
