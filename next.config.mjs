// @plaiceholderをインポートしない - ビルド時の画像処理を行わないため
import { fileURLToPath } from 'url';
import path from 'path';
import os from 'os';

// ES Moduleでのパス解決用ヘルパー
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** @type {import('next').NextConfig} */
const nextConfig = {
  // 最新のNext.js設定を使用
  experimental: {
    // 実験的機能を最小限にしてビルドを高速化
    // optimizeCssとturbotraceはビルド時間が長くなる可能性があるので無効化
  },

  // 画像最適化
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'www.notion.so',
      },
      {
        protocol: 'https',
        hostname: 's3-us-west-2.amazonaws.com',
      },
    ],
    // Notionの添付ファイルURLをサポート
    dangerouslyAllowSVG: true,
    contentDispositionType: 'attachment',
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
    // 画像キャッシュの強化
    minimumCacheTTL: 60 * 60 * 24 * 30, // 30日間キャッシュ
    // 画像最適化の設定
    formats: ['image/webp'],
    deviceSizes: [640, 750, 828, 1080, 1200], // デバイスサイズを減らす
    imageSizes: [16, 32, 48, 64, 96], // 画像サイズを減らす
    // Notionの添付ファイルURLを許可
    domains: [''],
    unoptimized: true,
  },

  // ビルド時間の制限
  staticPageGenerationTimeout: 60, // 1分に短縮（タイムアウトを防止）
  
  // メモリ使用量の最適化
  onDemandEntries: {
    maxInactiveAge: 30 * 60 * 1000, // 30分に短縮
    pagesBufferLength: 2, // バッファサイズを小さく
  },

  // 静的最適化の強化
  poweredByHeader: false, // 不要なヘッダーを削除
  compress: true, // 圧縮を有効化
  productionBrowserSourceMaps: false, // 本番環境でのソースマップを無効化

  // webpack設定 - ビルド時間短縮のために最小限の設定にする
  webpack: (config, { webpack, isServer }) => {
    // 不要な警告を抑制
    config.plugins.push(
      new webpack.ContextReplacementPlugin(/\/keyv\//, (data) => {
        delete data.dependencies[0].critical;
        return data;
      })
    );

    // ビルド時間を短縮するために画像処理を無効化
    // 画像処理はクライアントサイドで行う

    return config;
  },
};

export default nextConfig;
