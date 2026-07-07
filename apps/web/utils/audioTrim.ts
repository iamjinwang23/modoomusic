// 오디오 파일을 Web Audio API로 디코딩 + 트림 + WAV 인코딩.
// MiniMax cover reference audio가 시작/끝 메타 미지원 → 클라이언트가 직접 잘라야 함.
// 외부 라이브러리 X, 표준 WAV 헤더만 작성.

export interface DecodedAudio {
  buffer: AudioBuffer
  durationSec: number
}

// File → AudioBuffer (decode)
export async function decodeAudioFile(file: File): Promise<DecodedAudio> {
  const arrayBuf = await file.arrayBuffer()
  // 일부 환경에서 OfflineAudioContext 없으면 AudioContext 사용
  const Ctx = (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)
  const ctx = new Ctx()
  const buffer = await ctx.decodeAudioData(arrayBuf)
  await ctx.close().catch(() => {})
  return { buffer, durationSec: buffer.duration }
}

// AudioBuffer를 [startSec, endSec] 구간으로 자른 새 buffer 반환
export function trimBuffer(buffer: AudioBuffer, startSec: number, endSec: number): AudioBuffer {
  const sampleRate = buffer.sampleRate
  const startFrame = Math.max(0, Math.floor(startSec * sampleRate))
  const endFrame = Math.min(buffer.length, Math.ceil(endSec * sampleRate))
  const length = Math.max(1, endFrame - startFrame)
  const Ctx = (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)
  const offlineCtx = new Ctx({ sampleRate })  // 임시 context (buffer 생성용)
  const trimmed = offlineCtx.createBuffer(buffer.numberOfChannels, length, sampleRate)
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const src = buffer.getChannelData(ch)
    const dst = trimmed.getChannelData(ch)
    dst.set(src.subarray(startFrame, endFrame))
  }
  offlineCtx.close?.().catch(() => {})
  return trimmed
}

// AudioBuffer → WAV (PCM 16-bit) Blob
export function bufferToWav(buffer: AudioBuffer): Blob {
  const numCh = buffer.numberOfChannels
  const sampleRate = buffer.sampleRate
  const numFrames = buffer.length
  const bytesPerSample = 2  // PCM 16-bit
  const dataSize = numFrames * numCh * bytesPerSample
  const totalSize = 44 + dataSize  // WAV header 44바이트

  const ab = new ArrayBuffer(totalSize)
  const view = new DataView(ab)
  let offset = 0

  function writeStr(s: string) { for (let i = 0; i < s.length; i++) view.setUint8(offset++, s.charCodeAt(i)) }
  function writeU32(v: number) { view.setUint32(offset, v, true); offset += 4 }
  function writeU16(v: number) { view.setUint16(offset, v, true); offset += 2 }

  // RIFF header
  writeStr('RIFF')
  writeU32(36 + dataSize)
  writeStr('WAVE')
  // fmt chunk
  writeStr('fmt ')
  writeU32(16)  // PCM 헤더 길이
  writeU16(1)   // PCM = 1
  writeU16(numCh)
  writeU32(sampleRate)
  writeU32(sampleRate * numCh * bytesPerSample)  // byte rate
  writeU16(numCh * bytesPerSample)  // block align
  writeU16(16)  // bits per sample
  // data chunk
  writeStr('data')
  writeU32(dataSize)

  // PCM 16-bit interleaved
  const channels: Float32Array[] = []
  for (let ch = 0; ch < numCh; ch++) channels.push(buffer.getChannelData(ch))
  for (let i = 0; i < numFrames; i++) {
    for (let ch = 0; ch < numCh; ch++) {
      const s = Math.max(-1, Math.min(1, channels[ch][i]))
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true)
      offset += 2
    }
  }

  return new Blob([ab], { type: 'audio/wav' })
}

// 파형 시각화용 peak 데이터 (numBars 개 평균 amplitude)
export function computeWaveformPeaks(buffer: AudioBuffer, numBars: number): number[] {
  const ch0 = buffer.getChannelData(0)
  const blockSize = Math.floor(ch0.length / numBars)
  const peaks: number[] = []
  for (let i = 0; i < numBars; i++) {
    let sum = 0
    const start = i * blockSize
    const end = Math.min(start + blockSize, ch0.length)
    for (let j = start; j < end; j++) sum += Math.abs(ch0[j])
    peaks.push(end > start ? sum / (end - start) : 0)
  }
  // 0~1 정규화
  const max = Math.max(...peaks, 0.001)
  return peaks.map((p) => p / max)
}

// Blob → base64 (data: 접두사 제외 순수 base64)
export async function blobToBase64(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer()
  const bytes = new Uint8Array(buf)
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
}
