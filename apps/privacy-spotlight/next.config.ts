import type { NextConfig } from "next";

const config: NextConfig = {
  transpilePackages: ["@jib/ui", "@jib/demo-kit"],
  reactStrictMode: true,
};

export default config;
