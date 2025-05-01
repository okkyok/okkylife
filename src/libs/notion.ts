import { NotionAPI } from 'notion-client';
import { Block } from 'notion-types';

// Initialize the Notion API client
const notion = new NotionAPI({
  authToken: process.env.NOTION_AUTH_TOKEN,
});

/**
 * Retry function with exponential backoff
 * @param fn Function to retry
 * @param maxRetries Maximum number of retries
 * @param initialDelay Initial delay in ms
 * @returns Promise with the result of the function
 */
async function withRetry<T>(fn: () => Promise<T>, maxRetries = 5, initialDelay = 1000): Promise<T> {
  let retries = 0;
  
  while (true) {
    try {
      return await fn();
    } catch (error: any) {
      // Check if it's a rate limit error (429) or another error that might benefit from retrying
      const isRateLimitError = 
        error.statusCode === 429 || 
        error.code === 'ERR_NON_2XX_3XX_RESPONSE' || 
        (error.message && error.message.includes('429'));
      
      // If we've reached max retries or it's not a rate limit error, throw
      if (retries >= maxRetries || !isRateLimitError) {
        throw error;
      }
      
      // Calculate delay with exponential backoff and some jitter
      const delay = initialDelay * Math.pow(2, retries) + Math.random() * 1000;
      console.log(`Rate limit hit. Retrying in ${Math.round(delay / 1000)}s... (${retries + 1}/${maxRetries})`);
      
      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, delay));
      retries++;
    }
  }
}

/**
 * Get Notion page record map with retry mechanism for rate limiting
 */
export async function getRecordMap(id: string) {
  if (!id) {
    throw new Error(`Notion pageId is undefined or empty in getRecordMap. Received: '${id}'`);
  }
  
  try {
    // Use the retry mechanism when fetching from Notion
    const recordMap = await withRetry(() => notion.getPage(id));
    
    // Validate the record map to ensure it has the necessary data
    if (!recordMap) {
      console.error(`Failed to get record map for page ${id}: Record map is null or undefined`);
      throw new Error(`Failed to get record map for page ${id}`);
    }
    
    // Check for missing blocks and log warnings
    if (recordMap.block) {
      const missingBlocks = [];
      const blockKeys = Object.keys(recordMap.block);
      
      // Count missing blocks (blocks with undefined values)
      for (const blockId in recordMap.block) {
        if (!recordMap.block[blockId]?.value) {
          missingBlocks.push(blockId);
        }
      }
      
      // Log warning if there are missing blocks
      if (missingBlocks.length > 0) {
        console.warn(`Found ${missingBlocks.length} missing blocks out of ${blockKeys.length} total blocks`);
        // Only log the first few missing blocks to avoid excessive logging
        if (missingBlocks.length > 5) {
          console.warn(`First 5 missing block IDs: ${missingBlocks.slice(0, 5).join(', ')}...`);
        } else {
          console.warn(`Missing block IDs: ${missingBlocks.join(', ')}`);
        }
      }
    }
    
    return recordMap;
  } catch (error) {
    console.error(`Error fetching Notion page ${id}:`, error);
    // Rethrow to allow the caller to handle the error
    throw error;
  }
}

/**
 * 画像URLをマッピングする関数（エラーハンドリング強化版）
 */
export function mapImageUrl(url: string, block: Block): string | null {
  // デフォルトのフォールバック画像
  const fallbackImage = '/images/fallback-image.jpg';
  
  try {
    // URLが空または無効な場合はフォールバック
    if (!url || typeof url !== 'string') {
      console.warn(`Invalid image URL: ${url}, using fallback`);
      return fallbackImage;
    }

    // Data URLはそのまま返す
    if (url.startsWith('data:')) {
      return url;
    }

    // Unsplash画像は直接返す
    if (url.startsWith('https://images.unsplash.com')) {
      return url;
    }
    
    // S3画像は直接返す
    if (url.includes('s3-us-west-2.amazonaws.com')) {
      return url;
    }

    try {
      const u = new URL(url);

      // 署名済みAmazon S3 URLの処理
      if (
        u.pathname.startsWith('/secure.notion-static.com') &&
        u.hostname.endsWith('.amazonaws.com')
      ) {
        if (
          u.searchParams.has('X-Amz-Credential') &&
          u.searchParams.has('X-Amz-Signature') &&
          u.searchParams.has('X-Amz-Algorithm')
        ) {
          // 署名済みURLはそのまま使用
          return url;
        }
      }
      
      // Notion CDN URLの処理
      if (u.hostname === 'www.notion.so' || u.hostname === 'notion.so') {
        // すでにNotion URLの場合は処理を続行
      } else if (u.protocol === 'https:' || u.protocol === 'http:') {
        // 外部URLの場合はNotion経由でプロキシ
        url = `https://www.notion.so/image/${encodeURIComponent(url)}`;
      } else {
        // 無効なプロトコルの場合はフォールバック
        console.warn(`Invalid URL protocol: ${u.protocol}, using fallback`);
        return fallbackImage;
      }
    } catch (error) {
      console.warn(`Invalid URL in mapImageUrl: ${url}, using fallback`, error);
      return fallbackImage;
    }

    // Notion内部画像パスの処理
    if (url.startsWith('/images')) {
      url = `https://www.notion.so${url}`;
    } else if (!url.startsWith('https://www.notion.so')) {
      url = `https://www.notion.so${url.startsWith('/image') ? url : `/image/${encodeURIComponent(url)}`}`;
    }

    try {
      // Notion画像URLのパラメータ設定
      const notionImageUrlV2 = new URL(url);
      let table = block?.parent_table === 'space' ? 'block' : (block?.parent_table || 'block');
      if (table === 'collection' || table === 'team') {
        table = 'block';
      }
      
      // ブロックIDが無効な場合のチェック
      if (!block?.id) {
        console.warn('Missing block ID for image URL, using fallback');
        return fallbackImage;
      }
      
      notionImageUrlV2.searchParams.set('table', table);
      notionImageUrlV2.searchParams.set('id', block.id);
      notionImageUrlV2.searchParams.set('cache', 'v2');
      
      // 最終的なURL生成
      const finalUrl = notionImageUrlV2.toString();
      return finalUrl || fallbackImage;
    } catch (error) {
      console.error(`Error creating Notion image URL for ${url}:`, error);
      return fallbackImage;
    }
  } catch (error) {
    console.error('Error mapping image URL:', error);
    return fallbackImage;
  }
}

/**
 * 画像URLをfetchする関数（リトライ機能付き）
 * @param url 画像URL
 * @param maxRetries 最大リトライ回数
 * @returns Response
 */
export async function fetchImageWithRetry(url: string, maxRetries = 5): Promise<Response> {
  let retries = 0;
  let lastError: Error = new Error(`画像取得に失敗しました: ${url}`);

  while (retries <= maxRetries) {
    try {
      // リトライ時は指数バックオフで待機時間を増やす
      if (retries > 0) {
        // 初回リトライは短く、その後徐々に長くする（最大15秒まで）
        const waitTime = Math.min(Math.pow(1.5, retries) * 500, 15000);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        console.log(`リトライ (${retries}/${maxRetries}): ${url} - ${waitTime}ms待機`);
      }

      // タイムアウト付きのfetch
      const controller = new AbortController();
      // タイムアウト時間を長めに設定（15秒）
      const timeoutId = setTimeout(() => controller.abort(), 15000);

      try {
        const response = await fetch(url, { 
          signal: controller.signal,
          // キャッシュ設定を追加
          cache: 'force-cache',
          // 接続エラー対策として接続タイムアウトを設定
          headers: {
            'Connection': 'keep-alive'
          }
        });
        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        return response;
      } catch (error: unknown) {
        clearTimeout(timeoutId);
        // EPIPEエラーなど特定のネットワークエラーの場合は少し長めに待機
        const fetchError = error as { message?: string };
        if (fetchError.message && (
            fetchError.message.includes('EPIPE') || 
            fetchError.message.includes('network') || 
            fetchError.message.includes('fetch failed')
        )) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
        throw error;
      }
    } catch (error: unknown) {
      const err = error as Error;
      lastError = err;
      retries++;
      console.error(`画像取得エラー (${retries}/${maxRetries}): ${url} - ${err.message || 'Unknown error'}`);
    }
  }

  console.error(`画像取得最終エラー: ${url} - フォールバック画像を使用します`);
  throw lastError;
}
