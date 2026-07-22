/* eslint-disable @typescript-eslint/no-explicit-any */
import React from 'react'
import { StyleSheet, Text } from 'react-native'

// 앱 전역 폰트 = Pretendard(웹 파리티). RN은 CSS 폰트 캐스케이드가 없어 단일 폰트만 가능 →
// 한글·라틴 모두 Pretendard로 통일(웹의 한글과 동일, 라틴은 Pretendard 라틴).
// fontWeight를 정적 웨이트 패밀리로 매핑(앱이 쓰는 400·500·600·700·800). expo-font로 로드.
export const PRETENDARD_FONTS = {
  'Pretendard-Regular': require('../../assets/fonts/Pretendard-Regular.ttf'),
  'Pretendard-Medium': require('../../assets/fonts/Pretendard-Medium.ttf'),
  'Pretendard-SemiBold': require('../../assets/fonts/Pretendard-SemiBold.ttf'),
  'Pretendard-Bold': require('../../assets/fonts/Pretendard-Bold.ttf'),
  'Pretendard-ExtraBold': require('../../assets/fonts/Pretendard-ExtraBold.ttf'),
}

const FAMILY_BY_WEIGHT: Record<string, string> = {
  '100': 'Pretendard-Regular', '200': 'Pretendard-Regular', '300': 'Pretendard-Regular',
  '400': 'Pretendard-Regular', normal: 'Pretendard-Regular',
  '500': 'Pretendard-Medium',
  '600': 'Pretendard-SemiBold',
  '700': 'Pretendard-Bold', bold: 'Pretendard-Bold',
  '800': 'Pretendard-ExtraBold',
  '900': 'Pretendard-ExtraBold',
}

// Text 전역 override — fontWeight를 Pretendard 정적 패밀리로 치환(모듈 로드 시 1회, 모든 Text 렌더 이전).
// 이미 fontFamily가 지정된 Text는 그대로 존중. 패밀리가 웨이트를 내포하므로 fontWeight는 normal로 중화(이중 볼드 방지).
let patched = false
export function applyPretendardToText(): void {
  if (patched) return
  patched = true
  const T = Text as any
  const orig = T.render
  if (typeof orig !== 'function') return
  T.render = function (...args: any[]) {
    const el = orig.apply(this, args)
    const flat = (StyleSheet.flatten(el?.props?.style) || {}) as { fontWeight?: string | number; fontFamily?: string }
    const w = flat.fontWeight != null ? String(flat.fontWeight) : '400'
    const family = flat.fontFamily || FAMILY_BY_WEIGHT[w] || 'Pretendard-Regular'
    return React.cloneElement(el, { style: [el.props.style, { fontFamily: family, fontWeight: 'normal' }] })
  }
}
