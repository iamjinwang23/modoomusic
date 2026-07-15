import * as FileSystem from 'expo-file-system/legacy'

// v2.6 스타일 참조 음원 — 파일 선택 + 검증 + base64. MiniMax cover 참조는 6초~6분 정책이라
// 6분 초과는 거부하고 짧은 클립 업로드를 유도(앱은 트림 미제공, 서버가 그대로 MiniMax에 전달).
// ⚠️ expo-document-picker는 네이티브 모듈 — 미포함 빌드에서 import만 해도 크래시 → 지연 require로 가드.
const MAX_BYTES = 12 * 1024 * 1024  // 대략 6분 mp3(~192kbps) 안전 상한. 길이 직접측정 대신 크기로 근사.

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
  // 크기로 길이 근사 검증 — 초과 시 짧은 클립 유도
  if (typeof a.size === 'number' && a.size > MAX_BYTES) {
    return { ok: false, error: '음원이 너무 길어요. 6분 이하의 짧은 클립을 올려주세요' }
  }
  try {
    const base64 = await FileSystem.readAsStringAsync(a.uri, { encoding: FileSystem.EncodingType.Base64 })
    return { ok: true, name: a.name, base64 }
  } catch {
    return { ok: false, error: '음원을 읽지 못했어요. 다른 파일을 시도해 주세요' }
  }
}
