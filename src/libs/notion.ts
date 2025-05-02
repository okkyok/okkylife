import { NotionAPI } from 'notion-client';
import { Block } from 'notion-types';

// NotionAPIクライアントの初期化（オプション強化版）
const notion = new NotionAPI({
  authToken: process.env.NOTION_AUTH_TOKEN,
  activeUser: process.env.NOTION_USER_ID, // ユーザーIDがあれば設定
  userTimeZone: 'Asia/Tokyo', // タイムゾーンを設定
});

// メモリキャッシュの型定義
declare global {
  var __NOTION_PAGE_CACHE: Record<string, any> | undefined;
}

// エラー発生時のログ出力用関数
function logNotionError(error: any) {
  console.error('Notion API Error:', error?.message || 'Unknown error');
  
  // エラーの詳細情報をログ出力（デプロイ時のトラブルシューティング用）
  if (error?.stack) {
    console.error('Error stack:', error.stack.split('\n').slice(0, 3).join('\n'));
  }
  
  // レート制限エラーかどうかを確認
  if (error?.statusCode === 429 || (error?.message && error?.message.includes('rate'))) {
    console.error('Rate limit error detected. Consider adding delay between requests.');
  }
}

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
 * Notionページのレコードマップを取得する（リトライ機能付き）
 * デプロイ環境でのMissing blockエラーを軽減するための最適化を含む
 */
export async function getRecordMap(id: string) {
  if (!id) {
    throw new Error(`Notion pageId is undefined or empty in getRecordMap. Received: '${id}'`);
  }
  
  try {
    console.log(`Fetching Notion database with ID: ${id}`);
    
    // キャッシュキーを生成
    const cacheKey = `notion_page_${id}`;
    
    // メモリキャッシュがあれば使用（デプロイ時のパフォーマンス向上）
    // @ts-ignore
    if (global.__NOTION_PAGE_CACHE && global.__NOTION_PAGE_CACHE[cacheKey]) {
      // @ts-ignore
      console.log(`Using cached Notion data for ${id}`);
      // @ts-ignore
      return global.__NOTION_PAGE_CACHE[cacheKey];
    }
    
    // 拡張オプションを使用してNotionページを取得
    const options = {
      // 再帰的な深さを制限して必要なデータのみ取得（パフォーマンス向上）
      maxDepth: 3,
      // 署名付きURLを取得（アクセス権限の問題を軽減）
      signFileUrls: true,
      // タイムアウトを延長（デプロイ環境での問題を軽減）
      timeout: 60000, // 60秒
    };
    
    // リトライ回数と初期待機時間を増やして信頼性を向上
    const maxRetries = 7;  // 最大リトライ回数を増やす
    const initialDelay = 3000;  // 初期待機時間を長めに設定
    
    try {
      // リトライ機能を使用してNotionからデータを取得
      const recordMap = await withRetry(
        () => notion.getPage(id, options), 
        maxRetries, 
        initialDelay
      );
    
    // レコードマップのバリデーション
    if (!recordMap) {
      console.error(`Failed to get record map for page ${id}: Record map is null or undefined`);
      throw new Error(`Failed to get record map for page ${id}`);
    }
    
    // ブロックの存在確認
    if (!recordMap.block || Object.keys(recordMap.block).length === 0) {
      console.error(`No blocks found in record map for page ${id}`);
      throw new Error(`No blocks found for page ${id}`);
    }
    
    // Missing blockの数をカウントして警告をログ出力（ログ量を制限）
    if (recordMap.block) {
      const blockKeys = Object.keys(recordMap.block);
      const totalBlocks = blockKeys.length;
      
      // Missing blockをカウント
      const missingBlocks = blockKeys.filter(blockId => !recordMap.block[blockId]?.value);
      const missingBlockCount = missingBlocks.length;
      
      // 警告ログを出力（ただし量を制限）
      if (missingBlockCount > 0) {
        const missingRatio = (missingBlockCount / totalBlocks * 100).toFixed(1);
        console.warn(`Found ${missingBlockCount} missing blocks out of ${totalBlocks} total blocks (${missingRatio}%)`);
        
        // 最初の数個のMissing blockのみログ出力
        if (missingBlockCount > 5) {
          console.warn(`Sample missing blocks: ${missingBlocks.slice(0, 5).join(', ')}...`);
        } else {
          console.warn(`Missing blocks: ${missingBlocks.join(', ')}`);
        }
      }
      
      console.log(`Successfully fetched Notion page with ${totalBlocks - missingBlockCount} valid blocks`);
    }
    
      // メモリキャッシュに保存
      // @ts-ignore
      if (!global.__NOTION_PAGE_CACHE) {
        // @ts-ignore
        global.__NOTION_PAGE_CACHE = {};
      }
      // @ts-ignore
      global.__NOTION_PAGE_CACHE[cacheKey] = recordMap;
      
      return recordMap;
    } catch (error) {
      // エラーログを出力
      logNotionError(error);
      console.error(`Failed to fetch Notion page ${id} after ${maxRetries} retries`);
      throw error;
    }
  } catch (error) {
    console.error(`Error fetching Notion page ${id}:`);
    logNotionError(error);
    // エラーを再スローして呼び出し元で処理できるようにする
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
    if (url.includes('s3-us-west-2.amazonaws.com') || url.includes('amazonaws.com')) {
      return url;
    }
    
    // 外部画像URLはそのまま返す
    if (url.startsWith('https://') || url.startsWith('http://')) {
      return url;
    }

    try {
      // 相対パスの場合は絶対パスに変換
      if (url.startsWith('/')) {
        url = `https://www.notion.so${url}`;
        return url;
      }
      
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
        // すでにNotion URLの場合はそのまま返す
        return url;
      }
    } catch (error) {
      // URL解析エラーの場合、元のURLをそのまま返す
      console.warn(`Invalid URL in mapImageUrl: ${url}, returning as-is`);
      return url;
    }

    // その他の場合は元のURLをそのまま返す
    return url || fallbackImage;
  } catch (error) {
    console.error('Error mapping image URL:', error);
    // エラーが発生した場合も元のURLを返す
    return url || fallbackImage;
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
