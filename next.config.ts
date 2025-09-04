import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  webpack(config, { isServer }) {
    config.module.rules.push({
      test: /\.glsl$/,
      loader: 'raw-loader',
    });

    

    // Add a rule to handle .html files
    config.module.rules.push({
      test: /\.html$/,
      loader: 'html-loader',
    });

    return config;
  },
};

export default nextConfig;
