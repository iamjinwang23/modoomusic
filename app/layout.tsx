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

export const metadata: Metadata = {
  title: "모두의 노래",
  description: "오늘 하루를 나만의 음악으로",
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
