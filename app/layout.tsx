import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { AuthProvider } from "@/components/AuthProvider";

const pretendard = localFont({
  src: "../node_modules/pretendard/dist/web/variable/woff2/PretendardVariable.woff2",
  display: "swap",
  variable: "--font-pretendard",
});

export const metadata: Metadata = {
  title: "모두의 노래",
  description: "오늘 하루를 나만의 음악으로",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className={`h-full ${pretendard.variable}`}>
      <body className="min-h-full font-[family-name:var(--font-pretendard)]">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
