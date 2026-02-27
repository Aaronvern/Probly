/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: [],
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001",
    NEXT_PUBLIC_BICONOMY_API_KEY: process.env.NEXT_PUBLIC_BICONOMY_API_KEY,
  },
};

export default nextConfig;
