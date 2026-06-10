import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  webpack(config) {
    config.resolve.alias = {
      ...config.resolve.alias,
      canvas: false,
      'canvas-prebuilt': false,
    };

    return config;
  },
};

export default nextConfig;
