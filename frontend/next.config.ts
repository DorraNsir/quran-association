import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  // Lets a verification build live beside a running `next dev` (default: .next)
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;
