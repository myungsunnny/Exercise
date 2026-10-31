import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 변화 사진 업로드(클라이언트에서 축소 후 전송, 서버에서 5MB 제한 재검사)
  experimental: { serverActions: { bodySizeLimit: "6mb" } },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
