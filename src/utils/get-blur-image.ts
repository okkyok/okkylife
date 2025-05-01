import { getPlaiceholder } from 'plaiceholder';

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

/**
 * 画像からぼかし画像を生成する関数（エラーハンドリング強化版）
 * @param src 画像のURL
 * @returns ぼかし画像データ
 */
export async function getBlurImage(src: string) {
  // キャッシュにあればそれを返す
  if (blurCache.has(src)) {
    return blurCache.get(src);
  }

  try {
    // 通常のfetchを使用し、Response.cloneエラーを回避
    const res = await fetch(src, {
      headers: { 
        'User-Agent': 'Mozilla/5.0',
        'Cache-Control': 'no-cache'
      },
      // タイムアウトを設定
      signal: AbortSignal.timeout(10000) // 10秒タイムアウト
    });
    
    if (!res.ok) {
      throw new Error(`Failed to fetch image: ${res.status} ${res.statusText}`);
    }
    
    // arrayBufferを一度だけ取得
    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const {
      metadata: { height, width },
      ...plaiceholder
    } = await getPlaiceholder(buffer, { size: 10 });

    const result = {
      ...plaiceholder,
      img: { src, height, width },
    };
    
    // 結果をキャッシュに保存
    blurCache.set(src, result);
    
    return result;
  } catch (error) {
    console.error(`ぼかし画像の生成に失敗しました: ${src}`, error);
    // エラー時はデフォルトのぼかし画像データを返す
    const fallback = DEFAULT_BLUR_DATA;
    blurCache.set(src, fallback); // エラー結果もキャッシュ
    return fallback;
  }
}
