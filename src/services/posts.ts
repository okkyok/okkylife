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

  // ビルド時間を短縮するため、ビルド時の画像処理を行わない
  // 必要な画像はクライアントサイドで遅延ロードする
  
  // カバー画像がない投稿にはデフォルトのぼかし画像URLを設定
  allPosts.forEach(post => {
    // ビルド時にはぼかし画像を生成せず、空文字列を設定
    post.blurUrl = '';
  });

  return allPosts;
}

/**
 * 直近1ヶ月の記事を取得する関数
 */
export async function getRecentPosts() {
  const allPosts = await getAllPostsFromNotion();
  
  // 公開済みの記事のみをフィルタリング
  const publishedPosts = allPosts.filter(post => post.published);
  
  // 現在の日付から1ヶ月前の日付を計算
  const now = new Date();
  const oneMonthAgo = new Date();
  oneMonthAgo.setMonth(now.getMonth() - 1);
  
  // 日付が存在する記事のみを対象に、直近1ヶ月の記事をフィルタリング
  const recentPosts = publishedPosts.filter(post => {
    if (!post.date) return false;
    
    try {
      const postDate = new Date(post.date);
      return postDate >= oneMonthAgo;
    } catch (error) {
      console.warn(`Invalid date format for post: ${post.slug}`, error);
      // 日付形式が不正な場合は、最終編集日時を使用
      const lastEditedDate = new Date(post.lastEditedAt);
      return lastEditedDate >= oneMonthAgo;
    }
  });
  
  // 日付の新しい順にソート
  return recentPosts.sort((a, b) => {
    const dateA = a.date ? new Date(a.date).getTime() : a.lastEditedAt;
    const dateB = b.date ? new Date(b.date).getTime() : b.lastEditedAt;
    return dateB - dateA;
  });
}

/**
 * カテゴリとタグの一覧を取得する関数
 */
export async function getCategoriesAndTags() {
  const allPosts = await getAllPostsFromNotion();
  
  // 公開済みの記事のみをフィルタリング
  const publishedPosts = allPosts.filter(post => post.published);
  
  // すべてのカテゴリを取得し、重複を除去
  const allCategories = publishedPosts.flatMap(post => post.categories);
  const uniqueCategories = [...new Set(allCategories)];
  
  // カテゴリとその記事数をマッピング
  const categoryCount = uniqueCategories.map(category => {
    const count = publishedPosts.filter(post => 
      post.categories.includes(category)
    ).length;
    
    return { name: category, count };
  });
  
  // カテゴリにアイコンを追加
  const categoriesWithIcons = categoryCount.map(category => {
    let icon = '📄'; // デフォルトは文書アイコン
    
    // カテゴリ名に基づいてアイコンを設定
    switch(category.name.toLowerCase()) {
      case 'パートナーシップ':
        icon = '👫'; // カップル
        break;
      case '旅':
        icon = '🌎'; // 地球
        break;
      case 'ポーカー':
        icon = '🎴'; // トランプ
        break;
      case '人生':
        icon = '💼'; // ビル
        break;
      case '生活':
        icon = '🎯'; // 家
        break;
      case '仕組み化':
        icon = '🤖'; // ロボット
        break;
      case 'ビジネス':
        icon = '🛍'; // ショッピングバッグ
        break;
      case '健康':
        icon = '❤️'; // ハート
        break;
    }
    
    return { ...category, icon };
  });
  
  // 記事数の多い順にソート
  const sortedCategories = categoriesWithIcons.sort((a, b) => b.count - a.count);
  
  // タグは現段階ではダミーデータを返す
  const tags = [
    { name: 'Tag Library', count: publishedPosts.length }
  ];
  
  return {
    categories: sortedCategories,
    tags
  };
}
