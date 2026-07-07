import { useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { supabase } from '@/lib/supabase'

// 미로그인 오버레이 — 이메일/비번 로그인(소셜은 Phase4에서 확장) + 게스트 둘러보기
export function LoginScreen({ onGuest }: { onGuest?: () => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function login() {
    setLoading(true)
    setError(null)
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    setLoading(false)
    if (error) setError(error.message)
  }

  const canSubmit = email.trim().length > 0 && password.length > 0 && !loading

  return (
    <View style={styles.overlay}>
      <Text style={styles.title}>MONO</Text>
      <Text style={styles.subtitle}>로그인하고 시작하세요</Text>

      <TextInput
        style={styles.input}
        placeholder="이메일"
        placeholderTextColor="#6b7280"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        style={styles.input}
        placeholder="비밀번호"
        placeholderTextColor="#6b7280"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Pressable
        style={[styles.button, !canSubmit && styles.buttonDisabled]}
        onPress={canSubmit ? login : undefined}
      >
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>로그인</Text>}
      </Pressable>

      {onGuest ? (
        <Pressable style={styles.guest} onPress={onGuest}>
          <Text style={styles.guestText}>게스트로 둘러보기</Text>
        </Pressable>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: '#111318',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  title: { color: '#fff', fontSize: 34, fontWeight: '800', textAlign: 'center' },
  subtitle: { color: '#9ca3af', fontSize: 14, textAlign: 'center', marginTop: 6, marginBottom: 28 },
  input: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)', borderRadius: 12,
    paddingHorizontal: 16, paddingVertical: 14, color: '#fff', fontSize: 15, marginBottom: 12,
  },
  error: { color: '#f87171', fontSize: 13, marginBottom: 8, textAlign: 'center' },
  button: {
    backgroundColor: '#7c3aed', borderRadius: 12, paddingVertical: 15, alignItems: 'center', marginTop: 8,
  },
  buttonDisabled: { backgroundColor: 'rgba(255,255,255,0.08)' },
  buttonText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  guest: { alignItems: 'center', marginTop: 18 },
  guestText: { color: '#9ca3af', fontSize: 14 },
})
