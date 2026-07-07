import { useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { supabase } from '@/lib/supabase'
import { signInWithProvider, type SocialProvider } from '@/lib/social-auth'

// 미로그인 오버레이 — 소셜 로그인(주) + 이메일(보조) + 게스트 둘러보기
export function LoginScreen({ onGuest }: { onGuest?: () => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState<null | 'email' | SocialProvider>(null)
  const [error, setError] = useState<string | null>(null)

  async function emailLogin() {
    setLoading('email'); setError(null)
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    setLoading(null)
    if (error) setError(error.message)
  }

  async function social(provider: SocialProvider) {
    setLoading(provider); setError(null)
    const { error } = await signInWithProvider(provider)
    setLoading(null)
    if (error && error !== 'cancelled') setError(error)
  }

  const canEmail = email.trim().length > 0 && password.length > 0 && !loading

  return (
    <ScrollView style={styles.overlay} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>MONO</Text>
      <Text style={styles.subtitle}>로그인하고 시작하세요</Text>

      {/* 소셜 (주 로그인) */}
      <SocialButton label="Google로 계속하기" bg="#fff" fg="#111" loading={loading === 'google'} onPress={() => social('google')} />
      <SocialButton label="카카오로 계속하기" bg="#FEE500" fg="#191600" loading={loading === 'kakao'} onPress={() => social('kakao')} />
      <SocialButton label="Apple로 계속하기" bg="#000" fg="#fff" border loading={loading === 'apple'} onPress={() => social('apple')} />

      <View style={styles.divider}><Text style={styles.dividerText}>또는 이메일</Text></View>

      {/* 이메일 (보조) */}
      <TextInput style={styles.input} placeholder="이메일" placeholderTextColor="#6b7280"
        autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} />
      <TextInput style={styles.input} placeholder="비밀번호" placeholderTextColor="#6b7280"
        secureTextEntry value={password} onChangeText={setPassword} />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Pressable style={[styles.emailBtn, !canEmail && styles.disabled]} onPress={canEmail ? emailLogin : undefined}>
        {loading === 'email' ? <ActivityIndicator color="#fff" /> : <Text style={styles.emailBtnText}>이메일 로그인</Text>}
      </Pressable>

      {onGuest ? (
        <Pressable style={styles.guest} onPress={onGuest}>
          <Text style={styles.guestText}>게스트로 둘러보기</Text>
        </Pressable>
      ) : null}
    </ScrollView>
  )
}

function SocialButton({ label, bg, fg, border, loading, onPress }: {
  label: string; bg: string; fg: string; border?: boolean; loading: boolean; onPress: () => void
}) {
  return (
    <Pressable
      style={[styles.social, { backgroundColor: bg }, border && styles.socialBorder]}
      onPress={loading ? undefined : onPress}
    >
      {loading ? <ActivityIndicator color={fg} /> : <Text style={[styles.socialText, { color: fg }]}>{label}</Text>}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#111318' },
  content: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 28, paddingVertical: 48 },
  title: { color: '#fff', fontSize: 34, fontWeight: '800', textAlign: 'center' },
  subtitle: { color: '#9ca3af', fontSize: 14, textAlign: 'center', marginTop: 6, marginBottom: 24 },
  social: { borderRadius: 12, paddingVertical: 15, alignItems: 'center', marginBottom: 10 },
  socialBorder: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.16)' },
  socialText: { fontSize: 15, fontWeight: '700' },
  divider: { alignItems: 'center', marginVertical: 16 },
  dividerText: { color: '#6b7280', fontSize: 12 },
  input: {
    backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)',
    borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, color: '#fff', fontSize: 15, marginBottom: 12,
  },
  error: { color: '#f87171', fontSize: 13, marginBottom: 8, textAlign: 'center' },
  emailBtn: { backgroundColor: 'rgba(255,255,255,0.10)', borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  disabled: { opacity: 0.5 },
  emailBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  guest: { alignItems: 'center', marginTop: 18 },
  guestText: { color: '#9ca3af', fontSize: 14 },
})
