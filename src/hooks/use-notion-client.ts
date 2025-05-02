'use client';

import { useEffect, useState } from 'react';
import { ExtendedRecordMap } from 'notion-types';

/**
 * Notionクライアントを安全に使用するためのカスタムフック
 * クライアントサイドでの問題を回避するために、
 * サーバーから受け取ったデータのみを使用
 */
export function useNotionClient() {
  const [error, setError] = useState<Error | null>(null);

  // クライアントサイドでのエラーハンドリング
  useEffect(() => {
    // クライアントサイドでのエラーをキャッチするためのグローバルエラーハンドラー
    const handleError = (event: ErrorEvent) => {
      // notion-clientに関連するエラーをキャッチ
      if (
        event.error &&
        (event.error.message?.includes('notion') ||
          event.error.message?.includes('http2') ||
          event.error.message?.includes('dns') ||
          event.error.stack?.includes('notion'))
      ) {
        console.error('Notion client error:', event.error);
        setError(event.error);
        // エラーが処理されたことを示す
        event.preventDefault();
      }
    };

    // エラーハンドラーを登録
    window.addEventListener('error', handleError);

    // クリーンアップ関数
    return () => {
      window.removeEventListener('error', handleError);
    };
  }, []);

  /**
   * 画像URLを安全にマッピングする関数
   * @param url 元の画像URL
   * @param block Notionブロック
   * @returns マッピングされた画像URL
   */
  const safeMapImageUrl = (url: string, block: any): string => {
    try {
      // 基本的なURL検証
      if (!url) return '/placeholder-image.jpg';

      // Notion画像の場合はプレースホルダーを使用
      if (
        url.includes('notion.so') ||
        url.includes('notion-static.com') ||
        url.length > 200
      ) {
        return '/placeholder-image.jpg';
      }

      // 有効なURLかチェック
      try {
        new URL(url);
        return url;
      } catch {
        return '/placeholder-image.jpg';
      }
    } catch (error) {
      console.error('Error in safeMapImageUrl:', error);
      return '/placeholder-image.jpg';
    }
  };

  return {
    error,
    safeMapImageUrl,
  };
}
