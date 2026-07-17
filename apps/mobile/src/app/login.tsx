import { useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import Animated, { interpolate, runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Svg, { Defs, Path, RadialGradient, Rect, Stop } from 'react-native-svg'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { router } from 'expo-router'
import * as WebBrowser from 'expo-web-browser'
import { signInWithApple, signInWithNaver, signInWithProvider, type SocialProvider } from '@/lib/social-auth'
import { useSession } from '@/lib/use-session'
import Logo from '@/assets/logo.svg'
import { mono } from '@/theme/mono'

type Provider = SocialProvider | 'naver'
const WEB_BASE = process.env.EXPO_PUBLIC_API_BASE_URL ?? 'https://www.modoonorae.com'
const LAST_LOGIN_KEY = 'mono:lastLogin'

// 로그인 — transparentModal 라우트. 하단에서 올라오는 액션시트(플레이어 등 다른 모달 위로도 스택).
export default function LoginModal() {
  const insets = useSafeAreaInsets()
  const { height } = useWindowDimensions()
  const { session } = useSession()
  const [loading, setLoading] = useState<null | Provider>(null)
  const [error, setError] = useState<string | null>(null)
  const [lastLogin, setLastLogin] = useState<string | null>(null)

  const anim = useSharedValue(0)
  useEffect(() => { anim.value = withTiming(1, { duration: 260 }) }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { AsyncStorage.getItem(LAST_LOGIN_KEY).then(setLastLogin).catch(() => {}) }, [])
  // 로그인 성공(세션 생김) → 자동으로 닫기
  useEffect(() => { if (session) router.back() }, [session])

  const close = () => {
    anim.value = withTiming(0, { duration: 180 }, (f) => { if (f) runOnJS(router.back)() })
  }

  async function social(provider: Provider) {
    setLoading(provider); setError(null)
    AsyncStorage.setItem(LAST_LOGIN_KEY, provider).catch(() => {})
    const { error } =
      provider === 'naver' ? await signInWithNaver()
      : provider === 'apple' ? await signInWithApple()
      : await signInWithProvider(provider)
    setLoading(null)
    if (error && error !== 'cancelled') {
      // 사람이 읽을 문장으로 감싸되 원인은 남긴다 — 코드만 덩그러니 노출하지 않기 위해.
      console.warn(`[login] ${provider} 실패:`, error)
      setError(`로그인에 실패했어요. 잠시 후 다시 시도해 주세요.\n(${error})`)
    }
    // 성공 시 위 useEffect(session)가 router.back()으로 닫음
  }

  const openLegal = (path: string) => WebBrowser.openBrowserAsync(`${WEB_BASE}${path}`).catch(() => {})

  const dimStyle = useAnimatedStyle(() => ({ opacity: anim.value }))
  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: interpolate(anim.value, [0, 1], [height, 0]) }] }))

  return (
    <View style={styles.root}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.dim, dimStyle]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={close} />
      </Animated.View>

      <Animated.View style={[styles.sheet, { paddingBottom: insets.bottom + 20 }, sheetStyle]}>
        {/* 상단 은은한 오로라 글로우(브랜드 바이올렛) — 웹 셰이더 대신 네이티브 SVG 그라데이션 */}
        <View style={styles.aurora} pointerEvents="none">
          <Svg width="100%" height="100%">
            <Defs>
              <RadialGradient id="g1" cx="28%" cy="0%" rx="72%" ry="62%">
                <Stop offset="0" stopColor="#7c3aed" stopOpacity="0.30" />
                <Stop offset="1" stopColor="#7c3aed" stopOpacity="0" />
              </RadialGradient>
              <RadialGradient id="g2" cx="86%" cy="6%" rx="60%" ry="50%">
                <Stop offset="0" stopColor="#5b8def" stopOpacity="0.18" />
                <Stop offset="1" stopColor="#5b8def" stopOpacity="0" />
              </RadialGradient>
            </Defs>
            <Rect width="100%" height="100%" fill="url(#g1)" />
            <Rect width="100%" height="100%" fill="url(#g2)" />
          </Svg>
        </View>
        <View style={styles.handle} />
        <View style={styles.logoWrap}><Logo width={116} height={26} color={mono.color.text} /></View>
        <Text style={styles.subtitle}>로그인하고 MONO의 모든 기능을 이용해보세요</Text>

        <View style={styles.block}>
          <SocialButton label="Google로 계속하기" bg="#fff" fg="#18181b" recent={lastLogin === 'google'}
            loading={loading === 'google'} onPress={() => social('google')} icon={<GoogleIcon />} />
          <SocialButton label="Apple로 계속하기" bg={mono.color.surface} fg="#fff" border recent={lastLogin === 'apple'}
            loading={loading === 'apple'} onPress={() => social('apple')} icon={<AppleIcon />} />
          <SocialButton label="네이버로 계속하기" bg="#03C75A" fg="#fff" recent={lastLogin === 'naver'}
            loading={loading === 'naver'} onPress={() => social('naver')} icon={<NaverIcon />} />
          <SocialButton label="카카오로 계속하기" bg={mono.color.kakao} fg="#191919" recent={lastLogin === 'kakao'}
            loading={loading === 'kakao'} onPress={() => social('kakao')} icon={<KakaoIcon />} />

          {error ? <Text style={styles.error}>{error}</Text> : null}
        </View>

        <Text style={styles.terms}>
          계속하면 <Text style={styles.link} onPress={() => openLegal('/terms')}>이용약관</Text>과 <Text style={styles.link} onPress={() => openLegal('/privacy')}>개인정보처리방침</Text>에 동의합니다
        </Text>
      </Animated.View>
    </View>
  )
}

function SocialButton({ label, bg, fg, border, icon, recent, loading, onPress }: {
  label: string; bg: string; fg: string; border?: boolean
  icon: React.ReactNode; recent?: boolean; loading: boolean; onPress: () => void
}) {
  return (
    <Pressable style={[styles.social, { backgroundColor: bg }, border && styles.socialBorder]} onPress={loading ? undefined : onPress}>
      {recent ? <View style={styles.badgeWrap}><View style={styles.badge}><Text style={styles.badgeText}>최근 로그인</Text></View></View> : null}
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <View style={styles.socialInner}>
          {icon}
          <Text style={[styles.socialText, { color: fg }]}>{label}</Text>
        </View>
      )}
    </Pressable>
  )
}

// ── 브랜드 아이콘(웹 LoginModal 인라인 SVG 이식) ──
function GoogleIcon() {
  return (
    <Svg width={18} height={18} viewBox="0 0 18 18">
      <Path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908C16.658 14.013 17.64 11.705 17.64 9.2z" fill="#4285F4" />
      <Path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.909-2.259c-.806.54-1.836.86-3.047.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z" fill="#34A853" />
      <Path d="M3.964 10.71c-.18-.54-.282-1.117-.282-1.71s.102-1.17.282-1.71V4.958H.957C.347 6.173 0 7.548 0 9s.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05" />
      <Path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.958L3.964 6.29C4.672 4.163 6.656 3.58 9 3.58z" fill="#EA4335" />
    </Svg>
  )
}
function AppleIcon() {
  return (
    <Svg width={16} height={20} viewBox="4.2 2 16 20" fill="#fff">
      <Path d="M18.71 19.5C17.88 20.74 17 21.95 15.66 21.97C14.32 22 13.89 21.18 12.37 21.18C10.84 21.18 10.37 21.95 9.09997 22C7.78997 22.05 6.79997 20.68 5.95997 19.47C4.24997 17 2.93997 12.45 4.69997 9.39C5.56997 7.87 7.12997 6.91 8.81997 6.88C10.1 6.86 11.32 7.75 12.11 7.75C12.89 7.75 14.37 6.68 15.92 6.84C16.57 6.87 18.39 7.1 19.56 8.82C19.47 8.88 17.39 10.1 17.41 12.63C17.44 15.65 20.06 16.66 20.09 16.67C20.06 16.74 19.67 18.11 18.71 19.5ZM13 3.5C13.73 2.67 14.94 2.04 15.94 2C16.07 3.17 15.6 4.35 14.9 5.19C14.21 6.04 13.07 6.7 11.95 6.61C11.8 5.46 12.36 4.26 13 3.5Z" />
    </Svg>
  )
}
function NaverIcon() {
  return (
    <Svg width={15} height={15} viewBox="0 0 16 16" fill="#fff">
      <Path d="M10.846 8.563L5.077 0H0v16h5.154V7.435L10.923 16H16V0h-5.154v8.563z" />
    </Svg>
  )
}
function KakaoIcon() {
  return (
    <Svg width={18} height={18} viewBox="0 0 18 18">
      <Path d="M9 1.5C4.86 1.5 1.5 4.16 1.5 7.44c0 2.09 1.32 3.93 3.32 4.99l-.84 3.12a.25.25 0 0 0 .37.28L8.1 13.7c.29.03.59.05.9.05 4.14 0 7.5-2.66 7.5-5.94S13.14 1.5 9 1.5z" fill="#191919" />
    </Svg>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  dim: { backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: {
    backgroundColor: mono.color.surface, borderTopLeftRadius: 22, borderTopRightRadius: 22,
    paddingHorizontal: 20, paddingTop: 14, overflow: 'hidden',
  },
  aurora: { position: 'absolute', top: 0, left: 0, right: 0, height: 240 },
  handle: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: mono.color.fillStrong, marginBottom: 72 },
  logoWrap: { alignItems: 'center', marginBottom: 14 },
  subtitle: { color: mono.color.textSecondary, fontSize: mono.font.body, textAlign: 'center', marginBottom: 26 },
  block: { gap: 10 },
  social: { borderRadius: mono.radius.md, paddingVertical: 18, alignItems: 'center', justifyContent: 'center' },
  socialBorder: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' },
  socialInner: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  socialText: { fontSize: mono.font.body, fontWeight: '700' },
  badgeWrap: { position: 'absolute', top: 0, bottom: 0, right: 12, justifyContent: 'center', zIndex: 2 },
  badge: { backgroundColor: mono.color.accent, borderRadius: mono.radius.pill, paddingHorizontal: 10, paddingVertical: 5 },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  error: { color: mono.color.danger, fontSize: mono.font.small, textAlign: 'center', marginTop: 2 },
  terms: { color: mono.color.textTertiary, fontSize: mono.font.small, textAlign: 'center', lineHeight: 20, marginTop: 22 },
  link: { color: mono.color.textSecondary, textDecorationLine: 'underline' },
})
