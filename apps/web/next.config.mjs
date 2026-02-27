/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: [],
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001",
    NEXT_PUBLIC_BICONOMY_API_KEY: process.env.NEXT_PUBLIC_BICONOMY_API_KEY,
  },
  webpack: (config, { isServer }) => {
    if (isServer) {
      // These browser-only deps crash SSR — stub them out
      config.resolve.alias = {
        ...config.resolve.alias,
        "pino-pretty": false,
        "@react-native-async-storage/async-storage": false,
        "lokijs": false,
      };
    }
    return config;
  },
};

export default nextConfig;
