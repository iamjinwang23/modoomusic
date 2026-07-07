// 우측 하단 팝업 공지 카드 — 이미지 + 제목. 아래→위 ease-in 슬라이드 진입.
//   우상단 닫기 / 좌상단 "다시 보지 않기" 체크박스 / 카드 클릭 시 공지 상세로.
//   닫기: 체크 ON이면 localStorage 영구 숨김, 아니면 sessionStorage 세션 숨김.
'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
interface PopupData {
  id: string
  title: string
  imageUrl: string | null
}

const DISMISS_KEY = 'mono:popup-dismissed' // localStorage — 영구 숨김 (id)
const CLOSED_KEY = 'mono:popup-closed'     // sessionStorage — 세션 숨김 (id)

export function PopupAnnouncementCard() {
  const router = useRouter()
  const pathname = usePathname()
  const [popup, setPopup] = useState<PopupData | null>(null)
  const [entered, setEntered] = useState(false)
  const [closing, setClosing] = useState(false)
  const [dontShow, setDontShow] = useState(false)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 활성 팝업 1건 조회 — 마운트 시 1회. 영구/세션 숨김이면 표시 안 함.
  useEffect(() => {
    let cancelled = false
    fetch('/api/announcements/popup')
      .then((r) => r.json())
      .then((d: { popup: PopupData | null }) => {
        if (cancelled || !d.popup) return
        const dismissed = localStorage.getItem(DISMISS_KEY) === d.popup.id
        const closed = sessionStorage.getItem(CLOSED_KEY) === d.popup.id
        if (dismissed || closed) return
        setPopup(d.popup)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  // 진입 애니메이션 — 다음 프레임에 entered=true (translate-y + opacity 트랜지션)
  useEffect(() => {
    if (!popup) return
    const raf = requestAnimationFrame(() => setEntered(true))
    return () => cancelAnimationFrame(raf)
  }, [popup])

  useEffect(() => () => { if (closeTimer.current) clearTimeout(closeTimer.current) }, [])

  if (!popup) return null
  // 공지 페이지에선 중복이므로 숨김
  if (pathname.startsWith('/announcements')) return null

  function handleClose() {
    if (!popup) return
    if (dontShow) localStorage.setItem(DISMISS_KEY, popup.id)
    else sessionStorage.setItem(CLOSED_KEY, popup.id)
    setClosing(true)
    closeTimer.current = setTimeout(() => setPopup(null), 450)
  }

  function goDetail() {
    router.push(`/announcements/${popup!.id}`)
    handleClose()
  }

  const visible = entered && !closing

  return (
    <>
      {/* 모바일 딤 배경 — 바텀 모달 연출 (데스크탑은 코너 카드라 딤 없음) */}
      <div
        onClick={handleClose}
        className={`fixed inset-0 z-[59] bg-black/50 md:hidden transition-opacity duration-[450ms] ${
          visible ? 'opacity-100' : 'opacity-0'
        } ${closing ? 'pointer-events-none' : ''}`}
      />
      <div
        className={`fixed z-[60] left-0 right-0 bottom-[calc(68px+env(safe-area-inset-bottom,0px))] w-auto md:left-auto md:right-6 md:bottom-6 md:w-[360px] transition-all duration-[450ms] ease-out ${
          visible ? 'translate-y-0 opacity-100' : 'translate-y-full opacity-0 md:translate-y-6'
        }`}
      >
      {/* 모바일: 컨트롤을 카드 바깥 위쪽에 (데스크탑은 카드 상단 오버레이로 대체) */}
      <div className="flex md:hidden items-center justify-between px-1.5 pb-2 [text-shadow:0_1px_4px_rgba(0,0,0,0.9),0_0_3px_rgba(0,0,0,0.7)]">
        <label className="flex items-center gap-2 py-1.5 pl-2 pr-2 text-sm text-white cursor-pointer hover:text-white/90 transition-colors select-none">
          <input
            type="checkbox"
            checked={dontShow}
            onChange={(e) => setDontShow(e.target.checked)}
            className="w-5 h-5 accent-violet-500 drop-shadow-[0_1px_3px_rgba(0,0,0,0.8)]"
          />
          다시 보지 않기
        </label>
        <button
          onClick={handleClose}
          aria-label="닫기"
          className="w-11 h-11 rounded-full flex items-center justify-center text-white hover:bg-white/[0.12] transition-colors active:scale-90"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" className="drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>

      <div className="relative rounded-t-2xl md:rounded-2xl overflow-hidden bg-[#1A1D24] border border-white/[0.08] shadow-[0_4px_12px_rgba(0,0,0,0.6),0_14px_36px_rgba(0,0,0,0.85)]">
        {/* 이미지 (클릭 → 상세) */}
        <button onClick={goDetail} className="block w-full text-left transition-transform active:scale-[0.99]">
          <div className="relative aspect-video bg-gradient-to-br from-[#21252E] to-[#161922]">
            {popup.imageUrl && (
              <Image src={popup.imageUrl} alt="" fill unoptimized className="object-cover" sizes="360px" />
            )}
            {/* 데스크탑: 상단 가독성 스크림 (오버레이 컨트롤용) */}
            <div className="hidden md:block absolute inset-x-0 top-0 h-14 bg-gradient-to-b from-black/55 to-transparent" />
            <span className="absolute inset-0 ring-1 ring-inset ring-white/[0.06]" />
          </div>
        </button>

        {/* 데스크탑: 카드 상단 오버레이 컨트롤 (다시 보지 않기 / 닫기) */}
        <label className="hidden md:flex absolute top-2 left-2 z-10 items-center gap-1.5 px-2 py-1 rounded-lg bg-black/40 backdrop-blur-sm text-xs text-white/90 cursor-pointer hover:bg-black/55 transition-colors select-none">
          <input
            type="checkbox"
            checked={dontShow}
            onChange={(e) => setDontShow(e.target.checked)}
            className="w-3.5 h-3.5 accent-violet-500"
          />
          다시 보지 않기
        </label>
        <button
          onClick={handleClose}
          aria-label="닫기"
          className="hidden md:flex absolute top-2 right-2 z-10 w-8 h-8 rounded-full bg-black/40 backdrop-blur-sm items-center justify-center text-white/90 hover:bg-black/55 transition-colors active:scale-90"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>

        {/* 제목 (클릭 → 상세) — 데스크탑만. 흰 배경 + 검정 텍스트로 반전 */}
        <button onClick={goDetail} className="hidden md:block w-full text-left px-3.5 py-4 bg-white transition-colors hover:bg-zinc-50">
          <p className="text-base font-semibold text-zinc-900 line-clamp-2 leading-snug">{popup.title}</p>
        </button>
      </div>
      </div>
    </>
  )
}
