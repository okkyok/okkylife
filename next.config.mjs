// @plaiceholderをインポートしない - ビルド時の画像処理を行わないため
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import os from 'os';

// ES Moduleでのパス解決用ヘルパー
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** @type {import('next').NextConfig} */
const nextConfig = {
  // セキュリティヘッダーの設定
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Content-Security-Policy',
            // unsafe-evalを追加して警告を解消
            value: "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://*.notion.so https://*.notion-static.com https://*.amazonaws.com https://* http://*; font-src 'self' data:; connect-src 'self' https://* http://*;",
          },
        ],
      },
    ];
  },
  // 最新のNext.js設定を使用
  experimental: {
    // 実験的機能を最小限にしてビルドを高速化
    // optimizeCssとturbotraceはビルド時間が長くなる可能性があるので無効化
  },

  // 画像最適化 - 完全に最適化した版
  images: {
    // Notionの画像ドメインを明示的に許可
    remotePatterns: [
      // Notionのプロキシドメイン
      {
        protocol: 'https',
        hostname: 'www.notion.so',
      },
      // Notionの静的ファイルドメイン
      {
        protocol: 'https',
        hostname: 'secure.notion-static.com',
      },
      // Notionが使用するAWSドメイン
      {
        protocol: 'https',
        hostname: 's3.us-west-2.amazonaws.com',
      },
      {
        protocol: 'https',
        hostname: 's3-us-west-2.amazonaws.com',
      },
      {
        protocol: 'https',
        hostname: 'prod-files-secure.s3.us-west-2.amazonaws.com',
      },
      // 署名付きAWSリクエスト用
      {
        protocol: 'https',
        hostname: '*.amazonaws.com',
      },
      // 任意のドメインを許可（開発環境用）
      {
        protocol: 'https',
        hostname: '*',
      },
    ],
    // 画像最適化を有効化
    unoptimized: false,
    // SVGとセキュリティ設定
    dangerouslyAllowSVG: true,
    contentDispositionType: 'attachment',
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
    // 画像キャッシュの強化（ビルド時間短縮とパフォーマンス向上）
    minimumCacheTTL: 60 * 60 * 24 * 30, // 30日間キャッシュ
    // 画像最適化の設定（必要最小限のサイズに絞る）
    formats: ['image/webp'],
    deviceSizes: [640, 750, 828, 1080], // 必要なデバイスサイズのみ
    imageSizes: [32, 64, 96], // 必要な画像サイズのみ
    domains: ['*'], // すべてのドメインを許可（開発環境用）
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
