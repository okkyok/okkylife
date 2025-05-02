// サーバーサイドでのみ実行されるインポート
import { Block } from 'notion-types';
import {
  BlockObjectResponse,
  PartialBlockObjectResponse
} from '@notionhq/client/build/src/api-endpoints';

// 必要なモジュールを直接インポート
import { NotionAPI } from 'notion-client';

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

// グローバルキャッシュの型定義
declare global {
  var __NOTION_FILE_CACHE: Record<string, string> | undefined;
}

/**
 * 画像URLをマッピングする関数 - 最適化版
 * Notionの画像URLを適切に処理し、Next.jsの画像最適化に対応させる
 */
export function mapImageUrl(url: string, block: any = {}): string | null {
  const fallbackImage = '/placeholder-image.jpg';
  
  try {
    // 基本的なバリデーション
    if (!url) {
      return fallbackImage;
    }
    
    // URLがオブジェクトの場合（Notionの内部構造）
    if (typeof url !== 'string') {
      // @ts-ignore
      if (url && url.url) {
        // @ts-ignore
        return url.url;
      }
      return fallbackImage;
    }
    
    // キャッシュの初期化
    if (typeof global !== 'undefined' && !global.__NOTION_FILE_CACHE) {
      global.__NOTION_FILE_CACHE = {};
    }
    
    // キャッシュにあればそれを使用
    if (typeof global !== 'undefined' && global.__NOTION_FILE_CACHE && global.__NOTION_FILE_CACHE[url]) {
      return global.__NOTION_FILE_CACHE[url];
    }
    
    // データURLはそのまま返す
    if (url.startsWith('data:')) {
      return url;
    }
    
    // Unsplash画像は直接返す
    if (url.startsWith('https://images.unsplash.com')) {
      return url;
    }
    
    // attachment:形式のURLを処理（Notionの添付ファイル）
    if (url.startsWith('attachment:')) {
      try {
        // attachment:ID:filename.jpg 形式からIDとファイル名を抽出
        const match = url.match(/attachment:([^:]+):(.+)/);
        if (!match) {
          return fallbackImage;
        }
        
        const [_, fileId, fileName] = match;
        const blockId = block?.id || fileId;
        
        // ブロックからファイル情報を取得（複数の場所を確認）
        // 1. page_cover_files
        if (block?.format?.page_cover_files) {
          for (const file of block.format.page_cover_files) {
            if (file.file_id === fileId) {
              const result = file.url;
              if (typeof global !== 'undefined' && global.__NOTION_FILE_CACHE) {
                global.__NOTION_FILE_CACHE[url] = result;
              }
              return result;
            }
          }
        }
        
        // 2. properties.files
        if (block?.properties?.files) {
          for (const file of block.properties.files) {
            if (file.id === fileId || file.file_id === fileId) {
              const result = file.url;
              if (typeof global !== 'undefined' && global.__NOTION_FILE_CACHE) {
                global.__NOTION_FILE_CACHE[url] = result;
              }
              return result;
            }
          }
        }
        
        // 3. format.files
        if (block?.format?.files) {
          for (const file of block.format.files) {
            if (file.id === fileId || file.file_id === fileId) {
              const result = file.url;
              if (typeof global !== 'undefined' && global.__NOTION_FILE_CACHE) {
                global.__NOTION_FILE_CACHE[url] = result;
              }
              return result;
            }
          }
        }
        
        // ブロックから情報が取得できなかった場合は、Notionのイメージプロキシを使用
        const encodedUrl = encodeURIComponent(`https://secure.notion-static.com/${fileId}/${encodeURIComponent(fileName)}`);
        const imageUrl = `https://www.notion.so/image/${encodedUrl}?table=block&id=${blockId}&cache=v2`;
        
        if (typeof global !== 'undefined' && global.__NOTION_FILE_CACHE) {
          global.__NOTION_FILE_CACHE[url] = imageUrl;
        }
        return imageUrl;
      } catch (attachmentError) {
        console.error('Error processing attachment URL:', attachmentError);
        return fallbackImage;
      }
    }
    
    // 既に署名されたAmazon S3 URLの場合はそのまま返す
    try {
      const u = new URL(url);
      if (
        u.pathname.startsWith('/secure.notion-static.com') &&
        u.hostname.endsWith('.amazonaws.com') &&
        u.searchParams.has('X-Amz-Credential') &&
        u.searchParams.has('X-Amz-Signature') &&
        u.searchParams.has('X-Amz-Algorithm')
      ) {
        return url;
      }
    } catch {
      // 無効なURLは無視
    }
    
    // Notionの相対パスを絶対URLに変換
    if (url.startsWith('/')) {
      if (url.startsWith('/images')) {
        return `https://www.notion.so${url}`;
      }
      
      // Notionのイメージプロキシを使用
      const notionImageUrl = `https://www.notion.so${
        url.startsWith('/image') ? url : `/image/${encodeURIComponent(url)}`
      }`;
      
      // ブロック情報を追加
      try {
        const notionImageUrlV2 = new URL(notionImageUrl);
        let table = block.parent_table === 'space' ? 'block' : block.parent_table;
        if (table === 'collection' || table === 'team') {
          table = 'block';
        }
        notionImageUrlV2.searchParams.set('table', table);
        notionImageUrlV2.searchParams.set('id', block.id);
        notionImageUrlV2.searchParams.set('cache', 'v2');
        
        const result = notionImageUrlV2.toString();
        if (typeof global !== 'undefined' && global.__NOTION_FILE_CACHE) {
          global.__NOTION_FILE_CACHE[url] = result;
        }
        return result;
      } catch {
        return notionImageUrl;
      }
    }
    
    // Notionの画像URLを処理
    if (url.includes('notion-static.com') || url.includes('secure.notion-static.com')) {
      return url;
    }
    
    // S3画像は直接返す
    if (url.includes('amazonaws.com')) {
      return url;
    }
    
    // 外部画像URLはそのまま返す
    if (url.startsWith('https://') || url.startsWith('http://')) {
      return url;
    }
    
    // Notionのイメージプロキシを通す
    try {
      const notionImageUrl = `https://www.notion.so/image/${encodeURIComponent(url)}`;
      const notionImageUrlV2 = new URL(notionImageUrl);
      let table = block.parent_table === 'space' ? 'block' : block.parent_table;
      if (table === 'collection' || table === 'team') {
        table = 'block';
      }
      notionImageUrlV2.searchParams.set('table', table);
      notionImageUrlV2.searchParams.set('id', block.id);
      notionImageUrlV2.searchParams.set('cache', 'v2');
      
      const result = notionImageUrlV2.toString();
      if (typeof global !== 'undefined' && global.__NOTION_FILE_CACHE) {
        global.__NOTION_FILE_CACHE[url] = result;
      }
      return result;
    } catch {
      // その他の場合はプレースホルダー画像を返す
      return fallbackImage;
    }
  } catch (error) {
    console.error('Error mapping image URL:', error);
    // エラーが発生した場合はプレースホルダー画像を返す
    return fallbackImage;
  }
}

/**
 * 画像URLをfetchする関数（リトライ機能付き）
 * @param url 画像URL
 * @param maxRetries 最大リトライ回数
 * @returns Response
 */
/**
 * Notionのattachment URLを実際のファイルURLに解決する関数
 * @param attachmentUrl attachment:ID:filename 形式のURL
 * @param blockId ブロックID（オプション）
 * @returns 実際のファイルURL
 */
export async function resolveAttachmentUrl(attachmentUrl: string, blockId?: string): Promise<string> {
  const fallbackImage = '/placeholder-image.jpg';
  
  try {
    // キャッシュが存在するか確認
    if (!global.__NOTION_FILE_CACHE) {
      global.__NOTION_FILE_CACHE = {};
    }
    
    // キャッシュにあれば使用
    if (global.__NOTION_FILE_CACHE[attachmentUrl]) {
      console.log(`Using cached file URL for ${attachmentUrl}: ${global.__NOTION_FILE_CACHE[attachmentUrl]}`);
      return global.__NOTION_FILE_CACHE[attachmentUrl];
    }
    
    // attachment:ID:filename 形式からIDとファイル名を抽出
    const match = attachmentUrl.match(/attachment:([^:]+):(.+)/);
    if (!match) {
      console.warn(`Invalid attachment URL format: ${attachmentUrl}`);
      return fallbackImage;
    }
    
    const [_, fileId, fileName] = match;
    console.log(`Resolving attachment - fileId: ${fileId}, fileName: ${fileName}`);
    
    // ブロックIDがあれば、そのブロックのファイル情報を取得
    if (blockId) {
      try {
        // Notion APIを使用してブロック情報を取得
        const response = await notionClient.blocks.retrieve({ block_id: blockId });
        console.log(`Block info for ${blockId}:`, JSON.stringify(response, null, 2));
        
        // レスポンスの型を確認
        console.log(`Response type: ${response.object}`);
        
        // ページブロックの場合
        if ('type' in response && response.type && response.type.toString() === 'page') {
          try {
            // ページブロックとして扱う
            const pageBlock = response as PageBlock;
            
            // カバー画像がある場合
            if (pageBlock.cover) {
              const cover = pageBlock.cover;
              
              // ファイルタイプのカバーの場合
              if (cover.type === 'file' && cover.file) {
                const fileUrl = cover.file.url;
                console.log(`Found file URL from Notion API: ${fileUrl}`);
                
                // キャッシュに保存
                global.__NOTION_FILE_CACHE[attachmentUrl] = fileUrl;
                return fileUrl;
              }
              
              // 外部URLタイプのカバーの場合
              if (cover.type === 'external' && cover.external) {
                const externalUrl = cover.external.url;
                console.log(`Found external URL from Notion API: ${externalUrl}`);
                
                // キャッシュに保存
                global.__NOTION_FILE_CACHE[attachmentUrl] = externalUrl;
                return externalUrl;
              }
            }
          } catch (error) {
            console.error('Error processing page block:', error);
          }
        }
      } catch (blockError) {
        console.error(`Error fetching block info: ${blockError}`);
        // ブロック取得に失敗しても続行
      }
    }
    
    // ファイルIDから直接ファイル情報を取得する方法を試す
    try {
      // ファイルIDが実際にブロックIDの場合、そのブロック情報を取得
      const fileResponse = await notionClient.blocks.retrieve({ block_id: fileId });
      console.log(`File block info:`, JSON.stringify(fileResponse, null, 2));
      
      // レスポンスの型を確認
      console.log(`File response type: ${fileResponse.object}`);
      
      try {
        // ブロックがファイルタイプの場合
        if ('type' in fileResponse && fileResponse.type && fileResponse.type.toString() === 'file') {
          // ファイルブロックの場合
          if ('file' in fileResponse) {
            const file = fileResponse.file as any;
            if (file && file.url) {
              const fileUrl = file.url;
              console.log(`Found file URL from file block: ${fileUrl}`);
              
              // キャッシュに保存
              global.__NOTION_FILE_CACHE[attachmentUrl] = fileUrl;
              return fileUrl;
            }
          }
        }
        
        // ブロックが画像タイプの場合
        if ('type' in fileResponse && fileResponse.type && fileResponse.type.toString() === 'image') {
          if ('image' in fileResponse) {
            const image = fileResponse.image as any;
            
            // ファイルタイプの画像の場合
            if (image.type === 'file' && image.file && image.file.url) {
              const imageUrl = image.file.url;
              console.log(`Found image URL from image block: ${imageUrl}`);
              
              // キャッシュに保存
              global.__NOTION_FILE_CACHE[attachmentUrl] = imageUrl;
              return imageUrl;
            }
            
            // 外部URLタイプの画像の場合
            if (image.type === 'external' && image.external && image.external.url) {
              const externalImageUrl = image.external.url;
              console.log(`Found external image URL from image block: ${externalImageUrl}`);
              
              // キャッシュに保存
              global.__NOTION_FILE_CACHE[attachmentUrl] = externalImageUrl;
              return externalImageUrl;
            }
          }
        }
      } catch (error) {
        console.error('Error processing file/image block:', error);
      }
    } catch (fileError) {
      console.log(`File block retrieval failed: ${fileError}`);
      // ファイルブロック取得に失敗しても続行
    }
    
    // 最後の手段として、Notionの署名付きURLの一般的なパターンを試す
    // 通常、Notionのファイルは secure.notion-static.com にホストされている
    const notionFileUrl = `https://www.notion.so/signed/${fileId}/${encodeURIComponent(fileName)}`;
    console.log(`Generated Notion signed URL: ${notionFileUrl}`);
    
    // キャッシュに保存
    global.__NOTION_FILE_CACHE[attachmentUrl] = notionFileUrl;
    return notionFileUrl;
  } catch (error) {
    console.error('Error resolving attachment URL:', error);
    return fallbackImage;
  }
}

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
