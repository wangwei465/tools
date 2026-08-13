/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // better-sqlite3 是原生模块，不能被 webpack 打包，需在服务端以 require 方式外部加载
  // Next 14.2 该选项仍在 experimental 下（Next 15 才提升为顶层 serverExternalPackages）
  experimental: {
    serverComponentsExternalPackages: ["better-sqlite3"],
  },
};

export default nextConfig;
