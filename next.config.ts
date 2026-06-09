import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  webpack(config, { isServer }) {
    if (!isServer) {
      const externals = Array.isArray(config.externals)
        ? config.externals
        : config.externals
          ? [config.externals]
          : [];

      config.externals = [
        ...externals,
        {
          canvas: '{}',
          'canvas-prebuilt': '{}',
        },
      ];
    }

    return config;
  },
};

export default nextConfig;
