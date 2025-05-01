import { getPlaiceholder } from 'plaiceholder';
import { fetchImageWithRetry } from '../libs/notion';

// デフォルトのぼかし画像データ（エラー時に使用）
const DEFAULT_BLUR_DATA = {
  base64: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFklEQVR42mN8//HLfwYiAOOoQvoqBABbWyZJf74GZgAAAABJRU5ErkJggg==',
  img: {
    src: '/images/fallback-image.jpg',
    height: 100,
    width: 100
  }
};

// URLキャッシュを使用して、同じURLに対して複数回フェッチしないようにする
const blurCache = new Map<string, any>();

// 処理中のURLを追跡するためのMap
const pendingRequests = new Map<string, Promise<any>>();

/**
 * 画像からぼかし画像を生成する関数（エラーハンドリング強化版）
 * @param src 画像のURL
 * @returns ぼかし画像データ
 */
export async function getBlurImage(src: string) {
  // 無効なURLの場合はデフォルトを返す
  if (!src || typeof src !== 'string') {
    console.warn('無効な画像URL:', src);
    return DEFAULT_BLUR_DATA;
  }

  // キャッシュにあればそれを返す
  if (blurCache.has(src)) {
    return blurCache.get(src);
  }

  // 同じURLのリクエストが処理中なら、その結果を待つ
  if (pendingRequests.has(src)) {
    return pendingRequests.get(src);
  }

  // 新しいリクエストを作成して追跡
  const requestPromise = (async () => {
    try {
      // fetchImageWithRetryを使用してリトライ機能を活用
      const res = await fetchImageWithRetry(src, 3);
      
      // arrayBufferを一度だけ取得
      const arrayBuffer = await res.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      // 画像サイズを小さくしてメモリ使用量を削減
      const {
        metadata: { height, width },
        ...plaiceholder
      } = await getPlaiceholder(buffer, { size: 8 });

      const result = {
        ...plaiceholder,
        img: { src, height, width },
      };
      
      // 結果をキャッシュに保存
      blurCache.set(src, result);
      
      return result;
    } catch (error) {
      console.error(`ぼかし画像の生成に失敗しました: ${src}`, error instanceof Error ? error.message : error);
      // エラー時はデフォルトのぼかし画像データを返す
      const fallback = DEFAULT_BLUR_DATA;
      blurCache.set(src, fallback); // エラー結果もキャッシュ
      return fallback;
    } finally {
      // 処理が完了したら、追跡リストから削除
      pendingRequests.delete(src);
    }
  })();

  // 処理中のリクエストを追跡
  pendingRequests.set(src, requestPromise);
  
  return requestPromise;
}
