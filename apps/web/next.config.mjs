/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: [],
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001",
    NEXT_PUBLIC_BICONOMY_API_KEY: process.env.NEXT_PUBLIC_BICONOMY_API_KEY,
  },
  webpack: (config, { isServer }) => {
    // Stub missing/browser-only deps that crash both server and client bundles
    config.resolve.alias = {
      ...config.resolve.alias,
      // MetaMask SDK pulls this in — not available in any Node/browser bundle
      "@react-native-async-storage/async-storage": false,
    };

    if (isServer) {
      // These crash SSR only — idb-keyval uses indexedDB, pino-pretty/lokijs are Node logger deps
      config.resolve.alias = {
        ...config.resolve.alias,
        "idb-keyval": false,
        "pino-pretty": false,
        "lokijs": false,
      };
    }

    return config;
  },
};

export default nextConfig;
