import { useEffect, useState } from 'react'
import { StyleProp, Text, TextStyle } from 'react-native'

// 웹 GeneratingPhrase 파리티 — AI가 열일하는 듯 5초마다 회전. 웹과 문구 동일하게 유지할 것.
export const GENERATING_PHRASES = [
  '영감 떠올리는 중…',
  '악상 다듬는 중…',
  '비트 찍는 중…',
  '가사 쓰는 중…',
  '코드 진행 짜는 중…',
  '보컬 입히는 중…',
  '멜로디 그리는 중…',
  '분위기 잡는 중…',
  '후렴구 매만지는 중…',
  '믹싱 작업 중…',
  '마스터링 막바지…',
  '음표 굽는 중…',
]

// startedAt(ISO) 주면 경과 초를 뒤에 붙임(웹과 동일).
export function GeneratingPhrase({ startedAt, intervalMs = 5000, style }: { startedAt?: string; intervalMs?: number; style?: StyleProp<TextStyle> }) {
  const [idx, setIdx] = useState(0)
  const [elapsed, setElapsed] = useState<number | null>(null)

  useEffect(() => {
    setIdx(Math.floor(Math.random() * GENERATING_PHRASES.length))
    const t = setInterval(() => setIdx((i) => (i + 1) % GENERATING_PHRASES.length), intervalMs)
    return () => clearInterval(t)
  }, [intervalMs])

  useEffect(() => {
    if (!startedAt) { setElapsed(null); return }
    const update = () => setElapsed(Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000))
    update()
    const t = setInterval(update, 1000)
    return () => clearInterval(t)
  }, [startedAt])

  const text = GENERATING_PHRASES[idx]
  return <Text style={style} numberOfLines={1}>{elapsed != null && elapsed >= 0 ? `${text} ${elapsed}초` : text}</Text>
}
