import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/components/AuthProvider";
import { GlobalPlayerProvider } from "@/contexts/GlobalPlayerContext";
import { ToastHost } from "@/components/toast/ToastHost";

const pretendard = localFont({
  src: "../node_modules/pretendard/dist/web/variable/woff2/PretendardVariable.woff2",
  display: "swap",
  variable: "--font-pretendard",
});

// 영문은 Plus Jakarta Sans, 한글은 Pretendard
// next/font/google이 latin subset의 unicode-range를 자동으로 설정해주므로
// 한글 문자는 자동으로 다음 폴백(Pretendard)으로 렌더링됨
const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
  variable: "--font-jakarta",
});

const SITE_URL = 'https://modoomusic.com'
const SITE_NAME = '모두의 노래'
const SITE_TAGLINE = 'AI 음악 크리에이티브 플랫폼'
const SITE_DESCRIPTION = '음악 경험이 없어도 누구나 작곡할 수 있는 모두의 노래, MONO. 지금 무료로 만들어보세요.'

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} — ${SITE_TAGLINE}`,
    template: `%s · ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  keywords: ['AI 음악 생성', '작곡 AI', '음악 AI', 'AI 작곡', '무료 음악 생성', 'AI 가사', 'MONO', '모두의 노래', '모두의노래'],
  authors: [{ name: '주식회사 비누컴퍼니' }],
  creator: '주식회사 비누컴퍼니',
  publisher: '주식회사 비누컴퍼니',
  formatDetection: { email: false, address: false, telephone: false },
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    locale: 'ko_KR',
    url: SITE_URL,
    siteName: SITE_NAME,
    title: `${SITE_NAME} — ${SITE_TAGLINE}`,
    description: SITE_DESCRIPTION,
    images: [
      {
        url: '/og_image.png',
        width: 1200,
        height: 630,
        alt: `${SITE_NAME} — ${SITE_TAGLINE}`,
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: `${SITE_NAME} — ${SITE_TAGLINE}`,
    description: SITE_DESCRIPTION,
    images: ['/og_image.png'],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
      'max-video-preview': -1,
    },
  },
  icons: {
    icon: [
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/logo-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: '/logo-512.png',
    shortcut: '/logo-512.png',
  },
  verification: {
    ...(process.env.GOOGLE_SITE_VERIFICATION ? { google: process.env.GOOGLE_SITE_VERIFICATION } : {}),
    ...(process.env.NAVER_SITE_VERIFICATION
      ? { other: { 'naver-site-verification': process.env.NAVER_SITE_VERIFICATION } }
      : {}),
  },
}

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': `${SITE_URL}#organization`,
      name: SITE_NAME,
      legalName: '주식회사 비누컴퍼니',
      url: SITE_URL,
      logo: {
        '@type': 'ImageObject',
        url: `${SITE_URL}/logo-512.png`,
        width: 512,
        height: 512,
      },
      email: 'bee202408@gmail.com',
    },
    {
      '@type': 'WebSite',
      '@id': `${SITE_URL}#website`,
      url: SITE_URL,
      name: SITE_NAME,
      description: SITE_DESCRIPTION,
      inLanguage: 'ko-KR',
      image: `${SITE_URL}/og_image.png`,
      publisher: { '@id': `${SITE_URL}#organization` },
    },
    {
      '@type': 'WebApplication',
      name: SITE_NAME,
      url: SITE_URL,
      applicationCategory: 'MultimediaApplication',
      operatingSystem: 'Web',
      description: SITE_DESCRIPTION,
      inLanguage: 'ko-KR',
      image: `${SITE_URL}/og_image.png`,
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'KRW' },
    },
  ],
}

// iOS Safari가 status bar/home indicator 영역까지 콘텐츠 배경으로 채우게 함
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#111318",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className={`h-full ${pretendard.variable} ${jakarta.variable}`}>
      <body
        className="min-h-full bg-[#111318]"
        style={{ fontFamily: 'var(--font-jakarta), var(--font-pretendard), system-ui, sans-serif' }}
      >
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        <AuthProvider>
          <GlobalPlayerProvider>
            {children}
            <ToastHost />
          </GlobalPlayerProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
