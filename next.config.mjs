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
    // appDir: true, // Next.js 13以降ではデフォルトで有効
    // ビルド高速化のための設定
    optimizeCss: true, // CSSの最適化
    turbotrace: {
      logLevel: 'error',
      logAll: false,
    },
    // ビルドキャッシュを最大限活用
    incrementalCacheHandlerPath: path.resolve(__dirname, './src/cache/cache-handler.cjs'),
    isrMemoryCacheSize: 0, // ディスクキャッシュを優先
    // 並列処理の最適化
    cpus: Math.max(1, Math.min(4, os.cpus().length / 2)), // 使用CPUコア数を制限
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
    // 画像キャッシュの強化
    minimumCacheTTL: 60 * 60 * 24 * 30, // 30日間キャッシュ
    // 画像最適化の設定
    formats: ['image/webp'],
    deviceSizes: [640, 750, 828, 1080, 1200], // デバイスサイズを減らす
    imageSizes: [16, 32, 48, 64, 96], // 画像サイズを減らす
  },

  // ビルド時間の制限
  staticPageGenerationTimeout: 120, // 2分に短縮（長すぎるとタイムアウトする可能性）
  
  // メモリ使用量の最適化
  onDemandEntries: {
    maxInactiveAge: 30 * 60 * 1000, // 30分に短縮
    pagesBufferLength: 2, // バッファサイズを小さく
  },

  // 静的最適化の強化
  poweredByHeader: false, // 不要なヘッダーを削除
  compress: true, // 圧縮を有効化
  productionBrowserSourceMaps: false, // 本番環境でのソースマップを無効化

  // webpack設定
  webpack: (config, { webpack, isServer }) => {
    // メモリ最適化
    config.optimization = {
      ...config.optimization,
      nodeEnv: 'production',
      minimize: true,
      // チャンク最適化
      splitChunks: {
        chunks: 'all',
        cacheGroups: {
          default: false,
          vendors: false,
          // 共通モジュールを分離
          commons: {
            name: 'commons',
            chunks: 'all',
            minChunks: 2,
            reuseExistingChunk: true,
          },
        },
      },
    };
    
    // 不要な警告を抑制
    config.plugins.push(
      new webpack.ContextReplacementPlugin(/\/keyv\//, (data) => {
        delete data.dependencies[0].critical;
        return data;
      })
    );

    // 画像処理の最適化
    if (!isServer) {
      // クライアントサイドでの画像処理を最適化
      config.module.rules.push({
        test: /\.(jpe?g|png|svg|gif|webp)$/i,
        use: [
          {
            loader: 'image-webpack-loader',
            options: {
              disable: process.env.NODE_ENV !== 'production',
            },
          },
        ],
      });
    }

    return config;
  },
};

export default nextConfig;
