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
  
  // Use the retry mechanism when fetching from Notion
  return withRetry(() => notion.getPage(id));
}

/**
 * 画像URLをマッピングする関数（エラーハンドリング強化版）
 */
export function mapImageUrl(url: string, block: Block): string | null {
  try {
    if (!url) {
      return '/images/fallback-image.jpg'; // フォールバック画像
    }

    if (url.startsWith('data:')) {
      return url;
    }

    // more recent versions of notion don't proxy unsplash images
    if (url.startsWith('https://images.unsplash.com')) {
      return url;
    }

    try {
      const u = new URL(url);

      if (
        u.pathname.startsWith('/secure.notion-static.com') &&
        u.hostname.endsWith('.amazonaws.com')
      ) {
        if (
          u.searchParams.has('X-Amz-Credential') &&
          u.searchParams.has('X-Amz-Signature') &&
          u.searchParams.has('X-Amz-Algorithm')
        ) {
          // if the URL is already signed, then use it as-is
          return url;
        }
      }
    } catch (error) {
      console.warn('Invalid URL in mapImageUrl:', url);
      // ignore invalid urls but provide a fallback
      return '/images/fallback-image.jpg';
    }

    if (url.startsWith('/images')) {
      url = `https://www.notion.so${url}`;
    }

    url = `https://www.notion.so${
      url.startsWith('/image') ? url : `/image/${encodeURIComponent(url)}`
    }`;

    const notionImageUrlV2 = new URL(url);
    let table = block.parent_table === 'space' ? 'block' : block.parent_table;
    if (table === 'collection' || table === 'team') {
      table = 'block';
    }
    notionImageUrlV2.searchParams.set('table', table);
    notionImageUrlV2.searchParams.set('id', block.id);
    notionImageUrlV2.searchParams.set('cache', 'v2');

    url = notionImageUrlV2.toString();

    return url || '/images/fallback-image.jpg';
  } catch (error) {
    console.error('Error mapping image URL:', error);
    return '/images/fallback-image.jpg'; // エラー時のフォールバック
  }
}

/**
 * リトライ機能付きの画像フェッチ関数
 * @param url 画像URL
 * @param maxRetries 最大リトライ回数
 * @returns レスポンス
 */
export async function fetchImageWithRetry(url: string, maxRetries = 3): Promise<Response> {
  let retries = 0;
  
  while (true) {
    try {
      const response = await fetch(url, { 
        headers: { 
          'User-Agent': 'Mozilla/5.0',
          'Cache-Control': 'no-cache'
        },
        // タイムアウトを設定（ブラウザAPIではサポートされていないため、AbortControllerを使用）
        signal: AbortSignal.timeout(10000) // 10秒タイムアウト
      });
      
      if (!response.ok) {
        throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
      }
      
      return response;
    } catch (error: any) {
      if (retries >= maxRetries) {
        console.error(`画像フェッチ失敗（${url}）:`, error.message || error);
        throw error;
      }
      
      const delay = 1000 * Math.pow(2, retries) + Math.random() * 1000;
      console.log(`画像フェッチ失敗。${Math.round(delay / 1000)}秒後に再試行... (${retries + 1}/${maxRetries})`);
      
      await new Promise(resolve => setTimeout(resolve, delay));
      retries++;
    }
  }
}
