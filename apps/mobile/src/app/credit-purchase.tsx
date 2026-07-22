import { useCallback, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { iapCredits } from '@mono/shared'
import { api } from '@/lib/api'
import {
  iapAvailable, iapBuy, iapEnd, iapFinish, iapInit, iapProducts,
  onPurchaseError, onPurchaseUpdated, verifyPurchase, type Product,
} from '@/lib/iap'
import { Icon } from '@/components/ui/icon'
import { mono } from '@/theme/mono'

interface CreditState { total: number; paid: number }

// v15 Product 필드 방어적 접근(스토어/버전별 필드명 편차 대비)
const pSku = (p: Product): string => (p as { id?: string; productId?: string }).id ?? (p as { productId?: string }).productId ?? ''
const pPrice = (p: Product): string => (p as { displayPrice?: string; localizedPrice?: string; price?: string }).displayPrice ?? (p as { localizedPrice?: string }).localizedPrice ?? (p as { price?: string }).price ?? ''

// 크레딧 충전 — 직접 인앱결제(react-native-iap). 지급은 서버 검증(/api/iap/verify).
export default function CreditPurchaseScreen() {
  const insets = useSafeAreaInsets()
  const [products, setProducts] = useState<Product[] | null>(null)
  const [credits, setCredits] = useState<CreditState | null>(null)
  const [buying, setBuying] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const creditsRef = useRef(0)

  const loadCredits = useCallback(async () => {
    const c = await (api.get('/api/credits/me').catch(() => null) as Promise<CreditState | null>)
    if (c) { setCredits(c); creditsRef.current = c.total }
    return c
  }, [])

  const waitForGrant = useCallback(async (before: number) => {
    for (let i = 0; i < 8; i++) {
      await new Promise((r) => setTimeout(r, 1200))
      const c = await loadCredits()
      if (c && c.total > before) return true
    }
    return false
  }, [loadCredits])

  useEffect(() => {
    let mounted = true
    loadCredits()
    if (!iapAvailable()) { setProducts([]); return }
    iapInit().then((ok) => {
      if (!mounted) return
      if (ok) iapProducts().then((p) => mounted && setProducts(p)).catch(() => mounted && setProducts([]))
      else setProducts([]) // 초기화 실패(네이티브 미포함 등) → 준비 중
    }).catch(() => mounted && setProducts([]))

    const up = onPurchaseUpdated(async (purchase) => {
      const before = creditsRef.current
      const r = await verifyPurchase(purchase)
      if (r.ok) {
        await iapFinish(purchase) // 검증 성공 후에만 소비 완료(실패 시 다음 실행에서 재시도)
        setBuying(null)
        const granted = await waitForGrant(before)
        Alert.alert(granted ? '충전 완료' : '결제 완료', granted ? '크레딧이 충전됐어요.' : '크레딧이 곧 반영됩니다.')
      } else {
        setBuying(null)
        Alert.alert('지급 확인이 지연돼요', '결제는 처리됐어요. 잠시 후 자동으로 반영됩니다.')
      }
    })
    const errSub = onPurchaseError((e) => {
      setBuying(null)
      const ee = e as { userCancelled?: boolean; code?: string }
      if (!ee.userCancelled && ee.code !== 'E_USER_CANCELLED') setError('결제에 실패했어요')
    })

    return () => { mounted = false; up.remove(); errSub.remove(); iapEnd() }
  }, [loadCredits, waitForGrant])

  const buy = async (p: Product) => {
    if (buying) return
    setError(null); setBuying(pSku(p))
    try { await iapBuy(pSku(p)) } catch { setBuying(null); setError('결제를 시작할 수 없어요') }
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + 8 }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}><Text style={styles.close}>✕</Text></Pressable>
        <Text style={styles.title}>크레딧 충전</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}>
        <View style={styles.balance}>
          <Icon name="sparkle" size={18} color={mono.color.text} />
          <Text style={styles.balanceLabel}>보유 크레딧</Text>
          <Text style={styles.balanceValue}>{credits ? credits.total : '—'}</Text>
        </View>

        {products === null ? (
          <ActivityIndicator color={mono.color.accent} style={{ marginTop: 40 }} />
        ) : products.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>지금은 앱에서 충전할 수 없어요.</Text>
            <Text style={styles.emptySub}>결제 준비가 끝나면 이곳에서 바로 충전할 수 있어요.</Text>
          </View>
        ) : (
          products.map((p) => {
            const cr = iapCredits(pSku(p))
            const on = buying === pSku(p)
            return (
              <Pressable key={pSku(p)} style={[styles.pack, on && styles.packBusy]} disabled={!!buying} onPress={() => buy(p)}>
                <View style={styles.packLeft}>
                  <Text style={styles.packCredits}>{cr ?? '?'} 크레딧</Text>
                  <Text style={styles.packLabel}>{cr ?? '?'} Credits</Text>
                </View>
                {on ? <ActivityIndicator color="#fff" /> : <Text style={styles.packPrice}>{pPrice(p)}</Text>}
              </Pressable>
            )
          })
        )}

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Text style={styles.terms}>결제는 {Platform.OS === 'ios' ? 'App Store' : 'Google Play'}의 인앱결제로 처리되며, 크레딧은 계정에 즉시(지연 시 잠시 후) 충전됩니다. 충전된 크레딧의 환불은 {Platform.OS === 'ios' ? 'App Store' : 'Google Play'}의 정책 및 이용약관을 따릅니다.</Text>
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: mono.color.bg, paddingHorizontal: 20 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  close: { color: mono.color.text, fontSize: 22 },
  title: { color: mono.color.text, fontSize: mono.font.h2, fontWeight: '700' },
  balance: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: mono.color.surface, borderRadius: mono.radius.lg, borderWidth: 1, borderColor: mono.color.borderSoft, paddingHorizontal: 16, paddingVertical: 16, marginBottom: 20 },
  balanceLabel: { color: mono.color.text, fontSize: mono.font.body, flex: 1 },
  balanceValue: { color: mono.color.text, fontSize: mono.font.h2, fontWeight: '800' },
  pack: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: mono.color.surface, borderRadius: mono.radius.lg, borderWidth: 1, borderColor: mono.color.borderSoft, paddingHorizontal: 18, paddingVertical: 18, marginBottom: 12 },
  packBusy: { opacity: 0.6 },
  packLeft: { gap: 3 },
  packCredits: { color: mono.color.text, fontSize: mono.font.h2, fontWeight: '800' },
  packLabel: { color: mono.color.textTertiary, fontSize: mono.font.small },
  packPrice: { color: mono.color.accentLight, fontSize: mono.font.body, fontWeight: '700' },
  empty: { alignItems: 'center', marginTop: 48, gap: 8 },
  emptyText: { color: mono.color.text, fontSize: mono.font.body, fontWeight: '600' },
  emptySub: { color: mono.color.textTertiary, fontSize: mono.font.small, textAlign: 'center' },
  error: { color: mono.color.danger, fontSize: mono.font.small, textAlign: 'center', marginTop: 12 },
  terms: { color: mono.color.textTertiary, fontSize: mono.font.tiny, lineHeight: 17, marginTop: 24 },
})
