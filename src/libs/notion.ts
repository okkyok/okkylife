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

/**
 * 画像URLをマッピングする関数
 */
export function mapImageUrl(url: string, block: Block): string | null {
  const fallbackImage = '/placeholder-image.jpg';
  try {
    // 基本的なバリデーション
    if (!url || typeof url !== 'string') {
      console.log('Invalid URL:', url);
      return fallbackImage;
    }
    
    // データURLはそのまま返す
    if (url.startsWith('data:')) {
      return url;
    }
    
    // URLがオブジェクトの場合（Notionの内部構造）
    if (typeof url === 'object' && url !== null) {
      console.log('URL is an object:', url);
      // @ts-ignore
      if (url.url) {
        // @ts-ignore
        return url.url;
      }
      return fallbackImage;
    }
    
    // attachment:形式のURLを処理（Notionの添付ファイル）
    if (url.startsWith('attachment:')) {
      console.log(`Processing attachment URL: ${url}`);
      
      try {
        // まずキャッシュを確認
        if (!global.__NOTION_FILE_CACHE) {
          global.__NOTION_FILE_CACHE = {};
        }
        
        // キャッシュにあればそれを使用
        if (global.__NOTION_FILE_CACHE[url]) {
          console.log(`Using cached URL for ${url}: ${global.__NOTION_FILE_CACHE[url]}`);
          return global.__NOTION_FILE_CACHE[url];
        }
        
        // ブロックから基本的な情報を取得
        const blockId = block?.id;
        
        // attachment:ID:filename.jpg 形式からIDとファイル名を抽出
        const match = url.match(/attachment:([^:]+):(.+)/);
        if (!match) {
          console.warn(`Invalid attachment URL format: ${url}`);
          return fallbackImage;
        }
        
        const [_, fileId, fileName] = match;
        
        // ブロックからファイル情報を取得
        if (block?.format?.page_cover_files) {
          const files = block.format.page_cover_files;
          for (const file of files) {
            if (file.file_id === fileId) {
              console.log(`Found matching file in block.format.page_cover_files: ${file.url}`);
              // キャッシュに保存
              global.__NOTION_FILE_CACHE[url] = file.url;
              return file.url;
            }
          }
        }
        
        // ブロックのプロパティからファイル情報を取得
        if (block?.properties?.files) {
          const files = block.properties.files;
          for (const file of files) {
            if (file.id === fileId || file.file_id === fileId) {
              console.log(`Found matching file in block.properties.files: ${file.url}`);
              // キャッシュに保存
              global.__NOTION_FILE_CACHE[url] = file.url;
              return file.url;
            }
          }
        }
        
        // ブロックのformatからファイル情報を取得
        if (block?.format?.files) {
          const files = block.format.files;
          for (const file of files) {
            if (file.id === fileId || file.file_id === fileId) {
              console.log(`Found matching file in block.format.files: ${file.url}`);
              // キャッシュに保存
              global.__NOTION_FILE_CACHE[url] = file.url;
              return file.url;
            }
          }
        }
        
        // ブロックから情報が取得できなかった場合は、署名付きURLを生成
        // これは以前の実装で動作していた方法
        
        // Notionのイメージプロキシを使用する方法（最も信頼性が高い）
        // secure.notion-static.comドメインへの直接アクセスはCORS制限があるため避ける
        
        // ファイル名から拡張子を取得
        const extension = fileName.split('.').pop() || 'jpg';
        
        // 安全なファイル名を生成
        const safeFileName = `${fileId}.${extension}`;
        console.log(`Generated safe file name: ${safeFileName}`);
        
        // Notionのイメージプロキシを使用（最も信頼性が高い方法）
        // URLをエンコードして、Notionのイメージプロキシを通す
        const encodedUrl = encodeURIComponent(`https://secure.notion-static.com/${fileId}/${encodeURIComponent(fileName)}`);
        const imageUrl = `https://www.notion.so/image/${encodedUrl}?table=block&id=${blockId || fileId}&cache=v2`;
        console.log(`Generated Notion image URL: ${imageUrl}`);
        
        // バックアップとしてS3 URLも生成（直接アクセスできない場合が多いが保持）
        const s3Url = `https://s3.us-west-2.amazonaws.com/secure.notion-static.com/${fileId}/${encodeURIComponent(fileName)}`;
        console.log(`Generated S3 URL as backup: ${s3Url}`);
        
        // フォールバックとしてプロフィール画像を使用
        const fallbackUrl = '/images/profile/profile-image.jpg';
        console.log(`Using profile image as fallback: ${fallbackUrl}`);
        
        // キャッシュに保存してNotionイメージプロキシURLを返す（より信頼性が高い）
        if (global.__NOTION_FILE_CACHE) {
          global.__NOTION_FILE_CACHE[url] = imageUrl;
        }
        return imageUrl;
      } catch (attachmentError) {
        console.error('Error processing attachment URL:', attachmentError);
        return fallbackImage;
      }
    }
    
    // Unsplash画像は直接返す
    if (url.startsWith('https://images.unsplash.com')) {
      return url;
    }
    
    // Notionの相対パスを絶対URLに変換
    if (url.startsWith('/')) {
      const notionUrl = `https://www.notion.so${url}`;
      console.log(`Converted relative Notion path to absolute URL: ${notionUrl}`);
      return notionUrl;
    }
    
    
    // Notionの画像URLを処理
    if (url.includes('notion-static.com') || url.includes('secure.notion-static.com')) {
      console.log(`Notion static image detected: ${url}`);
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
    
    // その他の場合はプレースホルダー画像を返す
    console.log(`Unrecognized URL format: ${url}, using fallback`);
    return fallbackImage;
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
