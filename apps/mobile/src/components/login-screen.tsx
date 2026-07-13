import { useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import Animated, { FadeInDown } from 'react-native-reanimated'
import Svg, { Path } from 'react-native-svg'
import AsyncStorage from '@react-native-async-storage/async-storage'
import * as WebBrowser from 'expo-web-browser'
import { signInWithNaver, signInWithProvider, type SocialProvider } from '@/lib/social-auth'
import Logo from '@/assets/logo.svg'
import { mono } from '@/theme/mono'

type Provider = SocialProvider | 'naver'

const WEB_BASE = process.env.EXPO_PUBLIC_API_BASE_URL ?? 'https://www.modoonorae.com'
const LAST_LOGIN_KEY = 'mono:lastLogin'

// 미로그인 오버레이 — 웹 LoginModal 톤앤매너 파리티(로고·태그라인·브랜드 소셜 버튼·약관). 소셜 전용(이메일 미지원).
export function LoginScreen({ onGuest }: { onGuest?: () => void }) {
  const [loading, setLoading] = useState<null | Provider>(null)
  const [error, setError] = useState<string | null>(null)
  const [lastLogin, setLastLogin] = useState<string | null>(null)

  useEffect(() => { AsyncStorage.getItem(LAST_LOGIN_KEY).then(setLastLogin).catch(() => {}) }, [])

  async function social(provider: Provider) {
    setLoading(provider); setError(null)
    AsyncStorage.setItem(LAST_LOGIN_KEY, provider).catch(() => {})
    const { error } = provider === 'naver' ? await signInWithNaver() : await signInWithProvider(provider)
    setLoading(null)
    if (error && error !== 'cancelled') setError(error)
  }

  const openLegal = (path: string) => WebBrowser.openBrowserAsync(`${WEB_BASE}${path}`).catch(() => {})

  return (
    <ScrollView style={styles.overlay} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      <Animated.View entering={FadeInDown.delay(40).duration(500)} style={styles.logoWrap}>
        <Logo width={100} height={22} color={mono.color.text} />
      </Animated.View>
      <Animated.Text entering={FadeInDown.delay(110).duration(500)} style={styles.subtitle}>지금 MONO와 함께 나만의 노래를 만들어보세요</Animated.Text>

      <View style={styles.block}>
        <SocialButton delay={200} label="Google로 계속하기" bg="#fff" fg="#18181b" recent={lastLogin === 'google'}
          loading={loading === 'google'} onPress={() => social('google')} icon={<GoogleIcon />} />
        <SocialButton delay={260} label="Apple로 계속하기" bg={mono.color.surface} fg="#fff" border recent={lastLogin === 'apple'}
          loading={loading === 'apple'} onPress={() => social('apple')} icon={<AppleIcon />} />
        <SocialButton delay={320} label="네이버로 계속하기" bg="#03C75A" fg="#fff" recent={lastLogin === 'naver'}
          loading={loading === 'naver'} onPress={() => social('naver')} icon={<NaverIcon />} />
        <SocialButton delay={380} label="카카오로 계속하기" bg={mono.color.kakao} fg="#191919" recent={lastLogin === 'kakao'}
          loading={loading === 'kakao'} onPress={() => social('kakao')} icon={<KakaoIcon />} />

        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>

      <Animated.Text entering={FadeInDown.delay(400).duration(500)} style={styles.terms}>
        계속하면 <Text style={styles.link} onPress={() => openLegal('/terms')}>이용약관</Text>과 <Text style={styles.link} onPress={() => openLegal('/privacy')}>개인정보처리방침</Text>에 동의합니다
      </Animated.Text>

      {onGuest ? (
        <Pressable style={styles.guest} onPress={onGuest} hitSlop={8}>
          <Text style={styles.guestText}>게스트로 둘러보기</Text>
        </Pressable>
      ) : null}
    </ScrollView>
  )
}

function SocialButton({ label, bg, fg, border, icon, recent, loading, delay, onPress }: {
  label: string; bg: string; fg: string; border?: boolean
  icon: React.ReactNode; recent?: boolean; loading: boolean; delay: number; onPress: () => void
}) {
  return (
    <Animated.View entering={FadeInDown.delay(delay).duration(500)}>
      <Pressable style={[styles.social, { backgroundColor: bg }, border && styles.socialBorder]} onPress={loading ? undefined : onPress}>
        {recent ? (
          <View style={styles.badgeWrap}><View style={styles.badge}><Text style={styles.badgeText}>최근 로그인</Text></View></View>
        ) : null}
        <View style={styles.socialIcon}>{icon}</View>
        {loading ? <ActivityIndicator color={fg} /> : <Text style={[styles.socialText, { color: fg }]}>{label}</Text>}
      </Pressable>
    </Animated.View>
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
    <Svg width={16} height={18} viewBox="0 0 16 18" fill="#fff">
      <Path d="M13.23 9.36c-.02-1.9 1.56-2.82 1.63-2.87-1.12-1.63-2.85-1.86-3.47-1.88-1.48-.15-2.9.87-3.65.87-.76 0-1.93-.85-3.17-.83C2.89 4.68 1.31 5.72.5 7.3c-1.63 2.82-.42 7 1.15 9.29.78 1.12 1.7 2.38 2.91 2.33 1.17-.05 1.61-.75 3.03-.75 1.41 0 1.81.75 3.05.72 1.26-.02 2.05-1.14 2.82-2.27.9-1.3 1.26-2.57 1.28-2.63-.03-.01-2.44-.93-2.46-3.67-.02-2.3 1.88-3.4 1.96-3.46z" />
      <Path d="M10.4.75C11 .04 11.69-.5 12.37-.5c.04.91-.2 1.82-.79 2.52-.58.7-1.32 1.18-2.11 1.11-.05-.89.23-1.78.93-2.38z" />
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
function NaverIcon() {
  return (
    <Svg width={15} height={15} viewBox="0 0 16 16" fill="#fff">
      <Path d="M10.846 8.563L5.077 0H0v16h5.154V7.435L10.923 16H16V0h-5.154v8.563z" />
    </Svg>
  )
}

const styles = StyleSheet.create({
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: mono.color.bg },
  content: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: mono.space(7), paddingVertical: mono.space(12) },
  logoWrap: { alignItems: 'center', marginBottom: mono.space(4) },
  subtitle: { color: mono.color.textSecondary, fontSize: mono.font.body, textAlign: 'center', marginBottom: mono.space(8) },
  block: { gap: 10 },
  social: { borderRadius: mono.radius.md, paddingVertical: 15, alignItems: 'center', justifyContent: 'center' },
  socialBorder: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' },
  socialIcon: { position: 'absolute', left: 16, top: 0, bottom: 0, justifyContent: 'center' },
  socialText: { fontSize: mono.font.body, fontWeight: '700' },
  badgeWrap: { position: 'absolute', top: 0, bottom: 0, right: 12, justifyContent: 'center', zIndex: 2 },
  badge: { backgroundColor: mono.color.accent, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  error: { color: mono.color.danger, fontSize: mono.font.small, textAlign: 'center', marginTop: 2 },
  terms: { color: mono.color.textTertiary, fontSize: mono.font.tiny, textAlign: 'center', lineHeight: 18, marginTop: mono.space(8) },
  link: { color: mono.color.textSecondary, textDecorationLine: 'underline' },
  guest: { alignItems: 'center', marginTop: mono.space(5) },
  guestText: { color: mono.color.textSecondary, fontSize: mono.font.body },
})
