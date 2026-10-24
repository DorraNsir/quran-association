import type { NextConfig } from "next";

// The API lives on another domain. Browsers (Safari/iOS) block its refresh cookie as a
// third-party cookie, so the site relays /api/* to it: the browser only talks to the
// site's own domain. Set API_PROXY_TARGET (e.g. https://api-jamiiaomar.barakode.org)
// and NEXT_PUBLIC_API_URL=https://<site-domain>/api.
const apiProxyTarget = process.env.API_PROXY_TARGET?.replace(/\/+$/, "");

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  // Lets a verification build live beside a running `next dev` (default: .next)
  distDir: process.env.NEXT_DIST_DIR || ".next",
  async rewrites() {
    if (!apiProxyTarget) return [];
    return [{ source: "/api/:path*", destination: `${apiProxyTarget}/api/:path*` }];
  },
};

export default nextConfig;
