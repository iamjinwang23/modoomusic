import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 모노레포: @mono/shared는 TS 소스로 배포 → Next가 트랜스파일하도록 등록
  transpilePackages: ["@mono/shared"],
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'images.unsplash.com' },
      { protocol: 'https', hostname: '*.supabase.co' },
    ],
  },
};

export default nextConfig;
