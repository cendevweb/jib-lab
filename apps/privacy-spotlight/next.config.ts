import type { NextConfig } from "next";

const config: NextConfig = {
  transpilePackages: ["@jib/jev", "@jib/ui", "@jib/demo-kit"],
  reactStrictMode: true,
};

export default config;
