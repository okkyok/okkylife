import { getRecordMap, mapImageUrl } from '@/libs/notion';
import { Post } from '@/types/post';
import { getBlurImage } from '@/utils/get-blur-image';

export async function getAllPostsFromNotion() {
  const allPosts: Post[] = [];
  const notionDbId = process.env.NOTION_DATABASE_ID;
  if (!notionDbId) {
    throw new Error('NOTION_DATABASE_ID is not set. Please check your .env file.');
  }
  const recordMap = await getRecordMap(notionDbId);
  const { block, collection } = recordMap;
  const schema = Object.values(collection)[0].value.schema;
  const propertyMap: Record<string, string> = {};

  Object.keys(schema).forEach((key) => {
    propertyMap[schema[key].name] = key;
  });

  Object.keys(block).forEach((pageId) => {
    if (
      block[pageId].value.type === 'page' &&
      block[pageId].value.properties[propertyMap['Slug']]
    ) {
      const { properties, last_edited_time } = block[pageId].value;

      const contents = block[pageId].value.content || [];
      const dates = contents.map((content) => {
        return block[content]?.value?.last_edited_time;
      });
      dates.push(last_edited_time);
      dates.sort((a, b) => b - a);
      const lastEditedAt = dates[0];

      const id = pageId;
      const slug = properties[propertyMap['Slug']][0][0];
      const title = properties[propertyMap['Page']][0][0];
      const categories = properties[propertyMap['Category']][0][0].split(',');
      
      // Coverプロパティの安全な取得
      let cover = '';
      try {
        if (properties[propertyMap['Cover']] && 
            properties[propertyMap['Cover']][0] && 
            properties[propertyMap['Cover']][0][1] && 
            properties[propertyMap['Cover']][0][1][0]) {
          cover = properties[propertyMap['Cover']][0][1][0][1];
        }
      } catch (error) {
        console.warn(`Cover image not found for page: ${id}`);
      }
      
      // Dateプロパティの安全な取得
      let date = '';
      try {
        if (properties[propertyMap['Date']] && 
            properties[propertyMap['Date']][0] && 
            properties[propertyMap['Date']][0][1] && 
            properties[propertyMap['Date']][0][1][0] && 
            properties[propertyMap['Date']][0][1][0][1]) {
          date = properties[propertyMap['Date']][0][1][0][1]['start_date'];
        }
      } catch (error) {
        console.warn(`Date not found for page: ${id}`);
      }
      
      // Publishedプロパティの安全な取得
      let published = false;
      try {
        if (properties[propertyMap['Published']] && 
            properties[propertyMap['Published']][0]) {
          published = properties[propertyMap['Published']][0][0] === 'Yes';
        }
      } catch (error) {
        console.warn(`Published status not found for page: ${id}`);
      }

      allPosts.push({
        id,
        title,
        slug,
        categories,
        // Fix 403 error for images.
        // https://github.com/NotionX/react-notion-x/issues/211
        cover: cover ? mapImageUrl(cover, block[pageId].value) || '' : '',
        date,
        published,
        lastEditedAt,
      });
    }
  });

  // 空のカバー画像URLを持つ投稿をフィルタリングしてからぼかし画像を生成
  const postsWithCover = allPosts.filter(post => post.cover);
  
  // 画像処理の並列実行を制限する関数
  async function processImagesInBatches(items: Post[], batchSize = 5) {
    const results = [];
    
    // バッチ処理で画像を処理
    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      console.log(`画像バッチ処理: ${i + 1}〜${Math.min(i + batchSize, items.length)}/${items.length}`);
      
      try {
        // 各バッチ内の画像を並列処理
        const batchResults = await Promise.all(
          batch.map(post => getBlurImage(post.cover).catch(error => {
            console.error(`画像処理エラー (${post.slug}):`, error);
            // エラー時はデフォルト値を返す
            return { base64: '' };
          }))
        );
        
        results.push(...batchResults);
      } catch (error) {
        console.error('バッチ処理エラー:', error);
        // バッチ処理に失敗した場合、そのバッチには空の結果を入れる
        results.push(...Array(batch.length).fill({ base64: '' }));
      }
      
      // 各バッチ間で少し待機して、レート制限を回避
      if (i + batchSize < items.length) {
        await new Promise(resolve => setTimeout(resolve, 300));
      }
    }
    
    return results;
  }
  
  // バッチ処理で画像を処理
  const blurImages = await processImagesInBatches(postsWithCover);
  
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
