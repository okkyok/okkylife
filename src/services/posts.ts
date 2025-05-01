import { getRecordMap, mapImageUrl } from '@/libs/notion';
import { Post } from '@/types/post';
import { getBlurImage } from '@/utils/get-blur-image';
import { Block, RecordMap } from 'notion-types';

// Notionプロパティの型定義
interface DateProperty {
  start_date?: string;
}

type NotionPropertyValue = Array<any[]>;
type NotionProperties = Record<string, NotionPropertyValue>;
type BlockValue = Block & {
  properties?: NotionProperties;
  content?: string[];
  last_edited_time: number;
  type: string;
};

// Notionプロパティから安全に値を取得するヘルパー関数
function getPropertyText(property: NotionPropertyValue | undefined): string {
  try {
    if (!property || !property[0] || property[0].length === 0) return '';
    const value = property[0][0];
    return typeof value === 'string' ? value : '';
  } catch (error) {
    console.warn('Error getting property text:', error);
    return '';
  }
}

function getPropertyDate(property: NotionPropertyValue | undefined): string {
  try {
    if (!property || !property[0] || !property[0][1] || !property[0][1][0]) return '';
    
    const dateObj = property[0][1][0][1] as DateProperty;
    if (dateObj && typeof dateObj === 'object' && 'start_date' in dateObj) {
      return dateObj.start_date || '';
    }
    return '';
  } catch (error) {
    console.warn('Error getting property date:', error);
    return '';
  }
}

function getPropertyUrl(property: NotionPropertyValue | undefined): string {
  try {
    if (!property || !property[0] || !property[0][1] || !property[0][1][0]) return '';
    
    const value = property[0][1][0][1];
    return typeof value === 'string' ? value : '';
  } catch (error) {
    console.warn('Error getting property URL:', error);
    return '';
  }
}

export async function getAllPostsFromNotion() {
  const allPosts: Post[] = [];
  const notionDbId = process.env.NOTION_DATABASE_ID;
  if (!notionDbId) {
    throw new Error('NOTION_DATABASE_ID is not set. Please check your .env file.');
  }
  const recordMap = await getRecordMap(notionDbId) as RecordMap;
  const { block, collection } = recordMap;
  
  // コレクションが存在しない場合のエラーハンドリング
  if (!collection || Object.keys(collection).length === 0) {
    throw new Error('Notion database collection not found');
  }
  
  const collectionValue = Object.values(collection)[0]?.value;
  if (!collectionValue || !collectionValue.schema) {
    throw new Error('Notion database schema not found');
  }
  
  const schema = collectionValue.schema;
  const propertyMap: Record<string, string> = {};

  Object.keys(schema).forEach((key) => {
    const name = schema[key]?.name;
    if (name) {
      propertyMap[name] = key;
    }
  });

  // 必須プロパティが存在するか確認
  const requiredProps = ['Slug', 'Page', 'Category'];
  const missingProps = requiredProps.filter(prop => !propertyMap[prop]);
  if (missingProps.length > 0) {
    console.warn(`Missing required properties in Notion schema: ${missingProps.join(', ')}`);
  }

  Object.keys(block).forEach((pageId) => {
    const blockValue = block[pageId]?.value as BlockValue;
    if (!blockValue) return;
    
    // 必須条件の確認
    if (
      blockValue.type === 'page' &&
      blockValue.properties && 
      propertyMap['Slug'] && 
      blockValue.properties[propertyMap['Slug']]
    ) {
      const { properties, last_edited_time } = blockValue;
      if (!properties) return;

      // コンテンツの安全な取得
      const contents = blockValue.content || [];
      const dates = contents.map((content) => {
        return block[content]?.value?.last_edited_time;
      }).filter(Boolean) as number[];
      
      if (last_edited_time) {
        dates.push(last_edited_time);
      }
      
      dates.sort((a, b) => b - a);
      const lastEditedAt = dates[0] || Date.now();

      // 基本プロパティの安全な取得
      const id = pageId;
      let slug = '';
      let title = '';
      let categories: string[] = [];
      
      try {
        // ヘルパー関数を使用して安全にプロパティを取得
        slug = propertyMap['Slug'] ? getPropertyText(properties[propertyMap['Slug']]) : '';
        title = propertyMap['Page'] ? getPropertyText(properties[propertyMap['Page']]) : '';
        
        const categoryStr = propertyMap['Category'] ? getPropertyText(properties[propertyMap['Category']]) : '';
        if (categoryStr) {
          categories = categoryStr.split(',').map(c => c.trim()).filter(Boolean);
        }
      } catch (error) {
        console.warn(`Error parsing basic properties for page: ${id}`, error);
        return; // 基本プロパティが取得できない場合はスキップ
      }
      
      // Coverプロパティの安全な取得
      let cover = '';
      try {
        if (propertyMap['Cover']) {
          cover = getPropertyUrl(properties[propertyMap['Cover']]);
        }
      } catch (error) {
        console.warn(`Cover image not found for page: ${id}`);
      }
      
      // Dateプロパティの安全な取得
      let date = '';
      try {
        if (propertyMap['Date']) {
          date = getPropertyDate(properties[propertyMap['Date']]);
        }
      } catch (error) {
        console.warn(`Date not found for page: ${id}`);
      }
      
      // Publishedプロパティの安全な取得
      let published = false;
      try {
        if (propertyMap['Published']) {
          published = getPropertyText(properties[propertyMap['Published']]) === 'Yes';
        }
      } catch (error) {
        console.warn(`Published status not found for page: ${id}`);
      }

      // 必須フィールドの検証
      if (!slug || !title) {
        console.warn(`Skipping page ${id} due to missing required fields`);
        return;
      }
      
      allPosts.push({
        id,
        title,
        slug,
        categories,
        // Fix 403 error for images.
        // https://github.com/NotionX/react-notion-x/issues/211
        cover: cover ? mapImageUrl(cover, blockValue) || '' : '',
        date,
        published,
        lastEditedAt,
      });
    }
  });

  // 空のカバー画像URLを持つ投稿をフィルタリングしてからぼかし画像を生成
  const postsWithCover = allPosts.filter(post => post.cover);
  
  // 画像処理の並列実行を制限する関数
  async function processImagesInBatches(items: Post[], batchSize = 3) {
    // 処理対象がない場合は空配列を返す
    if (!items || items.length === 0) {
      return [];
    }
    
    const results: Array<{ base64: string }> = [];
    const resultMap = new Map<string, { base64: string }>(); // キャッシュ用マップ
    
    // バッチ処理で画像を処理
    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      console.log(`画像バッチ処理: ${i + 1}〜${Math.min(i + batchSize, items.length)}/${items.length}`);
      
      try {
        // 各バッチ内の画像を並列処理
        const batchPromises = batch.map(post => {
          // 無効なURLの場合はデフォルト値を返す
          if (!post.cover) {
            return Promise.resolve({ base64: '' });
          }
          
          // 同じURLの画像があれば再利用
          if (resultMap.has(post.cover)) {
            return Promise.resolve(resultMap.get(post.cover));
          }
          
          return getBlurImage(post.cover)
            .then(result => {
              // 成功した結果をキャッシュ
              resultMap.set(post.cover, result);
              return result;
            })
            .catch(error => {
              console.error(`画像処理エラー (${post.slug}):`, error instanceof Error ? error.message : String(error));
              // エラー時はデフォルト値を返す
              const defaultResult = { base64: '' };
              resultMap.set(post.cover, defaultResult);
              return defaultResult;
            });
        });
        
        // 各バッチ内では順次処理してレート制限を回避
        const batchResults: Array<{ base64: string }> = [];
        for (const promise of batchPromises) {
          try {
            const result = await promise;
            batchResults.push(result);
            // 各画像処理間で少し待機
            await new Promise(resolve => setTimeout(resolve, 100));
          } catch (error) {
            console.error('個別画像処理エラー:', error instanceof Error ? error.message : String(error));
            batchResults.push({ base64: '' });
          }
        }
        
        results.push(...batchResults);
      } catch (error) {
        console.error('バッチ処理エラー:', error instanceof Error ? error.message : String(error));
        // バッチ処理に失敗した場合、そのバッチには空の結果を入れる
        results.push(...Array(batch.length).fill({ base64: '' }));
      }
      
      // 各バッチ間で待機時間を長くして、レート制限を回避
      if (i + batchSize < items.length) {
        const waitTime = 500; // 500msに増やす
        console.log(`バッチ間待機: ${waitTime}ms`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
    
    return results;
  }
  
  // バッチ処理で画像を処理（エラーハンドリング追加）
  let blurImages: Array<{ base64: string }> = [];
  try {
    blurImages = await processImagesInBatches(postsWithCover);
    console.log(`ぼかし画像生成完了: ${blurImages.length}枚`);
  } catch (error) {
    console.error('ぼかし画像バッチ処理に失敗しました:', error instanceof Error ? error.message : String(error));
    // エラー時は空の配列を使用
    blurImages = Array(postsWithCover.length).fill({ base64: '' });
  }
  
  // ぼかし画像をポストに追加（カバー画像がある投稿のみ）
  postsWithCover.forEach((post, i) => {
    post.blurUrl = blurImages[i]?.base64 || '';
  });
  
  // カバー画像がない投稿にはデフォルトのぼかし画像URLを設定
  allPosts.filter(post => !post.cover).forEach(post => {
    post.blurUrl = '';
  });

  return allPosts;
}
