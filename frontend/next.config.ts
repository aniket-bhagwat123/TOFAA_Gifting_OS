import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async headers() {
    // The worker file itself must never be cached, or an update could not reach users.
    return [{ source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }, { key: "Service-Worker-Allowed", value: "/" }] }];
  },
  distDir: process.env.NODE_ENV === "development" ? ".next-dev" : ".next"
};

export default nextConfig;
