import { NotionAPI } from 'notion-client';
import { Block } from 'notion-types';
import { Client } from '@notionhq/client';
import {
  BlockObjectResponse,
  PartialBlockObjectResponse
} from '@notionhq/client/build/src/api-endpoints';

// Notion APIのレスポンス型を定義
type FileObject = {
  url: string;
  expiry_time?: string;
};

type FileWithCaption = {
  file: FileObject;
  caption?: Array<any>;
  type?: 'file';
};

type ExternalFileWithCaption = {
  url: string;
  caption?: Array<any>;
};

type PageCover = {
  type: 'file' | 'external';
  file?: FileObject;
  external?: ExternalFileWithCaption;
};

// ページブロックの型定義
type PageBlock = {
  id: string;
  type: string;
  object: string;
  cover?: PageCover;
};

// 公式Notion APIクライアントの初期化
const notionClient = new Client({
  auth: process.env.NOTION_API_KEY,
});

// キャッシュの型定義
declare global {
  var __NOTION_FILE_CACHE: Record<string, string> | undefined;
}

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

// グローバルキャッシュの型定義
declare global {
  var __NOTION_FILE_CACHE: Record<string, string> | undefined;
}

/**
 * 画像URLをマッピングする関数 - 最適化版
 * Notionの画像URLを適切に処理し、Next.jsの画像最適化に対応させる
 */
export function mapImageUrl(url: string, block: Block): string | null {
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
