import { getPlaiceholder } from 'plaiceholder';

import { fetchImageWithRetry } from '@/libs/notion';

// デフォルトのぼかし画像データ（エラー時に使用）
const DEFAULT_BLUR_DATA = {
  base64: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFklEQVR42mN8//HLfwYiAOOoQvoqBABbWyZJf74GZgAAAABJRU5ErkJggg==',
  img: {
    src: '/images/fallback-image.jpg',
    height: 100,
    width: 100
  }
};

/**
 * 画像からぼかし画像を生成する関数（エラーハンドリング強化版）
 * @param src 画像のURL
 * @returns ぼかし画像データ
 */
export async function getBlurImage(src: string) {
  try {
    // 最大3回までリトライするfetchImageWithRetry関数を使用
    const res = await fetchImageWithRetry(src, 3);
    const buffer = Buffer.from(await res.arrayBuffer());

    const {
      metadata: { height, width },
      ...plaiceholder
    } = await getPlaiceholder(buffer, { size: 10 });

    return {
      ...plaiceholder,
      img: { src, height, width },
    };
  } catch (error) {
    console.error(`ぼかし画像の生成に失敗しました: ${src}`, error);
    // エラー時はデフォルトのぼかし画像データを返す
    return DEFAULT_BLUR_DATA;
  }
}
