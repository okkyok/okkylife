import { getRecordMap, mapImageUrl } from '@/libs/notion';
import { Post } from '@/types/post';
import { getBlurImage } from '@/utils/get-blur-image';
import { Block, RecordMap } from 'notion-types';
import { Client } from '@notionhq/client';

// Notion APIクライアントの初期化
const notion = new Client({ 
  auth: process.env.NOTION_API_KEY,
});

// Notionプロパティの型定義
interface DateProperty {
  start_date?: string;
}

// Notionのプロパティ値の型定義（配列形式）
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

/**
 * NotionのプロパティからURLを取得する関数（完全に書き直し）
 */
function getPropertyUrl(property: NotionPropertyValue | undefined): string {
  try {
    // プロパティが存在しない場合
    if (!property) {
      console.log('Property is undefined or null');
      return '';
    }
    
    // デバッグ用にプロパティの全体をログ出力
    console.log('Full property:', JSON.stringify(property, null, 2));
    
    // ファイルタイプの場合
    if (property[0] && property[0][0] === 'file') {
      const fileData = property[0][1];
      console.log('File data:', fileData);
      
      // ファイルデータが配列の場合
      if (Array.isArray(fileData) && fileData.length > 0) {
        // ファイル情報を取得
        const fileInfo = fileData[0][1];
        console.log('File info:', fileInfo);
        
        // URLがオブジェクトに含まれている場合
        if (typeof fileInfo === 'object' && fileInfo !== null && 'url' in fileInfo) {
          console.log('Found URL in file object:', fileInfo.url);
          return fileInfo.url as string;
        }
        // URLが文字列の場合
        else if (typeof fileInfo === 'string') {
          console.log('Found URL as string:', fileInfo);
          return fileInfo;
        }
      }
    }
    // URLタイプの場合
    else if (property[0] && property[0][0] === 'url' && property[0][1]) {
      const url = property[0][1];
      console.log('URL property:', url);
      return typeof url === 'string' ? url : '';
    }
    // リンク形式の場合
    else if (property[0] && property[0][1] && Array.isArray(property[0][1])) {
      const linkData = property[0][1];
      
      // リンクデータを探索
      for (const item of linkData) {
        if (Array.isArray(item) && item.length > 1) {
          if (item[0] === 'a' && item[1]) {
            console.log('Found link URL:', item[1]);
            return typeof item[1] === 'string' ? item[1] : '';
          }
        }
      }
    }
    
    console.log('No URL found in property');
    return '';
  } catch (error) {
    console.error('Error getting property URL:', error);
    return '';
  }
}

export async function getAllPostsFromNotion() {
  // メモリキャッシュを確認（ビルド時のパフォーマンス向上）
  if (global.__ALL_POSTS_CACHE) {
    const cacheTime = global.__POSTS_FETCH_TIME || 0;
    const now = Date.now();
    const cacheAge = (now - cacheTime) / 1000 / 60; // 分単位
    
    // キャッシュが30分以内なら再利用（デプロイ中の再取得を防止）
    if (cacheAge < 30) {
      console.log(`Using cached posts data (${cacheAge.toFixed(1)} minutes old)`);
      return global.__ALL_POSTS_CACHE;
    }
  }
  
  const allPosts: Post[] = [];
  const notionDbId = process.env.NOTION_DATABASE_ID;
  
  if (!notionDbId) {
    throw new Error('NOTION_DATABASE_ID is not set. Please check your .env file.');
  }
  
  try {
    console.log(`Fetching Notion database: ${notionDbId}`);
    
    // デプロイ環境でのエラーを減らすためにタイムアウトを延長
    const recordMap = await getRecordMap(notionDbId) as RecordMap;
    
    // recordMapのバリデーション
    if (!recordMap) {
      console.error('Failed to get record map: Record map is null or undefined');
      return [];
    }
    
    const { block, collection } = recordMap;
    
    // ブロックが存在しない場合のエラーハンドリング
    if (!block || Object.keys(block).length === 0) {
      console.error('Notion blocks not found. Check your database ID and permissions.');
      return [];
    }
    
    // コレクションが存在しない場合のエラーハンドリング
    if (!collection || Object.keys(collection).length === 0) {
      console.error('Notion database collection not found. Check your database ID and permissions.');
      return [];
    }
    
    const collectionValue = Object.values(collection)[0]?.value;
    if (!collectionValue || !collectionValue.schema) {
      console.error('Notion database schema not found. Check your database structure.');
      return [];
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

    // ブロック数をログ出力（デバッグ用）
    const blockCount = Object.keys(block).length;
    console.log(`Processing ${blockCount} blocks from Notion database`);
    
    // Missing blockの総数をカウント
    let totalMissingBlocks = 0;
    Object.keys(block).forEach(id => {
      if (!block[id]?.value) totalMissingBlocks++;
    });
    
    if (totalMissingBlocks > 0) {
      console.warn(`Found ${totalMissingBlocks} missing blocks out of ${blockCount} total blocks`);
    }
    
    // Missing blockの数を制限してログ出力を減らす
    let loggedMissingBlocks = 0;
    const maxMissingBlockLogs = 10; // 全体で最大10件のMissing blockログを出力
    
    Object.keys(block).forEach((pageId) => {
      try {
        const blockValue = block[pageId]?.value as BlockValue;
        if (!blockValue) {
          // Missing blockログを制限
          if (loggedMissingBlocks < maxMissingBlockLogs) {
            console.warn(`Missing block value for pageId: ${pageId}`);
            loggedMissingBlocks++;
          }
          return;
        }
      
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
          
          // Missing blockのカウントを制限（デプロイ時のログ量を減らすため）
          let missingBlockCount = 0;
          const maxPageMissingBlockLogs = 3; // ページごとに最大3件のMissing blockログを出力
          
          const dates = contents.map((content) => {
            if (!block[content] || !block[content]?.value) {
              // Missing blockがある場合は限定的にログ出力
              missingBlockCount++;
              if (missingBlockCount <= maxPageMissingBlockLogs && loggedMissingBlocks < maxMissingBlockLogs) {
                console.warn(`Missing block reference: ${content} in page ${pageId}`);
                loggedMissingBlocks++;
              } else if (missingBlockCount === maxPageMissingBlockLogs + 1 && loggedMissingBlocks < maxMissingBlockLogs) {
                console.warn(`Additional missing blocks in page ${pageId} will not be logged individually`);
                loggedMissingBlocks++;
              }
              return null;
            }
            return block[content]?.value?.last_edited_time;
          }).filter(Boolean) as number[];
          
          // ページ全体のMissing block数をログ（ただし制限付き）
          if (missingBlockCount > 0 && loggedMissingBlocks < maxMissingBlockLogs) {
            console.warn(`Total missing blocks in page ${pageId}: ${missingBlockCount} out of ${contents.length}`);
            loggedMissingBlocks++;
          }
          
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
            // 必須プロパティの取得
            slug = getPropertyText(properties[propertyMap['Slug']]);
            if (!slug) {
              console.warn(`Missing or empty Slug property for page ${pageId}`);
              return; // スラッグがない記事はスキップ
            }
            
            title = getPropertyText(properties[propertyMap['Page']]);
            if (!title) {
              console.warn(`Missing or empty Page (title) property for page ${pageId} (slug: ${slug})`);
              // タイトルがなくてもスラッグがあれば続行
            }
            
            // カテゴリの取得（複数可能）
            const categoryProp = properties[propertyMap['Category']];
            if (categoryProp && Array.isArray(categoryProp)) {
              categories = categoryProp.map(item => {
                return item[0] || '';
              }).filter(Boolean);
            }
          } catch (error) {
            console.error(`Error processing page ${pageId}:`, error);
            return;
          }
          
          // Coverプロパティの安全な取得 - 完全に書き直し
          let cover = '';
          try {
            // ページのカバー画像を取得する方法を1：プロパティから取得
            if (propertyMap['Cover']) {
              console.log(`Trying to get cover from property for page ${id} (${slug})`);
              const coverProp = properties[propertyMap['Cover']];
              
              if (coverProp) {
                cover = getPropertyUrl(coverProp);
                console.log(`Cover from property for ${id} (${slug}):`, cover);
              }
            }
            
            // ページのカバー画像を取得する方法を2：blockの内部プロパティから取得
            if (!cover && blockValue.format && blockValue.format.page_cover) {
              cover = blockValue.format.page_cover;
              console.log(`Cover from block format for ${id} (${slug}):`, cover);
              
              // Notionの相対パスを絶対URLに変換
              if (cover.startsWith('/')) {
                cover = `https://www.notion.so${cover}`;
                console.log(`Converted relative path to absolute URL: ${cover}`);
              }
            }
            
            // ページのカバー画像を取得する方法を3：blockの内部属性から取得
            if (!cover && blockValue.properties && blockValue.properties.cover) {
              const blockCover = blockValue.properties.cover;
              console.log(`Block cover property for ${id} (${slug}):`, blockCover);
              
              if (Array.isArray(blockCover) && blockCover.length > 0) {
                // 配列の場合は最初の要素を使用
                const coverValue = blockCover[0];
                if (Array.isArray(coverValue) && coverValue.length > 0) {
                  cover = coverValue[0];
                  console.log(`Extracted cover from block property: ${cover}`);
                }
              }
            }
            
            // デバッグ用にブロックの全体構造を確認
            console.log(`Block structure for ${id} (${slug}):`, JSON.stringify({
              format: blockValue.format,
              properties_keys: blockValue.properties ? Object.keys(blockValue.properties) : [],
            }, null, 2));
            
            // URLが空の場合はプレースホルダー画像を使用
            if (!cover) {
              cover = '/placeholder-image.jpg';
              console.log(`Using placeholder image for ${id} (${slug})`);
            }
          } catch (error) {
            console.warn(`Error getting cover for page ${id} (${slug}):`, error);
            cover = '/placeholder-image.jpg'; // エラー時はプレースホルダーを使用
          }
          
          // Dateプロパティの安全な取得
          let date = '';
          try {
            if (propertyMap['Date']) {
              date = getPropertyDate(properties[propertyMap['Date']]);
            }
          } catch (error) {
            console.warn(`Error getting date for page ${id}:`, error);
          }
          
          // Publishedプロパティの安全な取得
          let published = true; // デフォルトは公開
          try {
            if (propertyMap['Published']) {
              const publishedText = getPropertyText(properties[propertyMap['Published']]);
              published = publishedText.toLowerCase() !== 'false';
            }
          } catch (error) {
            console.warn(`Error getting published status for page ${id}:`, error);
          }
          
          // カバー画像のURLを処理
          let processedCover = '';
          if (cover) {
            // 元のカバー画像URLをログ出力
            console.log(`Original cover URL for ${id} (${slug}):`, cover);
            
            // mapImageUrlを使用してURLを変換
            processedCover = mapImageUrl(cover, blockValue) || '';
            console.log(`Processed cover URL for ${id} (${slug}):`, processedCover);
            
            // URLが空の場合はプレースホルダー画像を使用
            if (!processedCover) {
              processedCover = '/placeholder-image.jpg';
              console.log(`Using placeholder image for ${id} (${slug})`);
            }
          }
          
          // 投稿オブジェクトの作成
          allPosts.push({
            id,
            slug,
            title,
            categories,
            cover: processedCover,
            date,
            published,
            lastEditedAt,
          });
        }
      } catch (error) {
        console.error(`Error processing block ${pageId}:`, error);
        // エラーが発生しても処理を続行
      }
    });

    // ビルド時間を短縮するため、ビルド時の画像処理を行わない
    // 必要な画像はクライアントサイドで遅延ロードする
    
    // カバー画像がない投稿にはデフォルトのぼかし画像URLを設定
    allPosts.forEach(post => {
      // ビルド時にはぼかし画像を生成せず、空文字列を設定
      post.blurUrl = '';
    });

    console.log(`Successfully processed ${allPosts.length} posts from Notion`);
    
    // メモリキャッシュに保存（デプロイ時の再取得を防止）
    global.__ALL_POSTS_CACHE = allPosts;
    global.__POSTS_FETCH_TIME = Date.now();
    
    return allPosts;
  } catch (error) {
    console.error('Failed to fetch posts from Notion:', error);
    
    // キャッシュがあれば古いデータを返す（フォールバック）
    if (global.__ALL_POSTS_CACHE) {
      console.log('Using cached posts data as fallback due to error');
      return global.__ALL_POSTS_CACHE;
    }
    
    return [];
  }
}

// カテゴリとタグの型定義
export type Category = {
  name: string;
  count: number;
  icon?: string; // アイコンを追加
  slug: string; // 英語のスラッグを追加
};

export type Tag = {
  name: string;
  count: number;
  icon?: string; // アイコンを追加
  slug: string; // 英語のスラッグを追加
};

// メモリキャッシュの型定義
declare global {
  var __RECENT_POSTS_CACHE: Post[] | undefined;
  var __CATEGORIES_TAGS_CACHE: { categories: Category[], tags: Tag[] } | undefined;
  var __ALL_POSTS_CACHE: Post[] | undefined;
  var __POSTS_FETCH_TIME: number | undefined;
}

/**
 * 直近1ヶ月の投稿を取得する
 * ビルド時間を短縮するためにメモリキャッシュを利用
 */
export async function getRecentPosts(): Promise<Post[]> {
  try {
    // メモリキャッシュがあれば利用
    if (global.__RECENT_POSTS_CACHE) {
      return global.__RECENT_POSTS_CACHE;
    }
    
    const allPosts = await getAllPostsFromNotion();
    
    // 公開済みの投稿のみをフィルタリング
    const publishedPosts = allPosts.filter(post => post.published);
    
    // 日付でソート（最新順）
    const sortedPosts = publishedPosts.sort((a, b) => {
      const dateA = new Date(a.date || a.lastEditedAt).getTime();
      const dateB = new Date(b.date || b.lastEditedAt).getTime();
      return dateB - dateA;
    });
    
    // 直近1ヶ月分の投稿をフィルタリング
    const oneMonthAgo = new Date();
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
    
    const recentPosts = sortedPosts.filter(post => {
      const postDate = new Date(post.date || post.lastEditedAt);
      return postDate >= oneMonthAgo;
    });
    
    // メモリキャッシュに保存
    global.__RECENT_POSTS_CACHE = recentPosts;
    
    return recentPosts;
  } catch (error) {
    console.error('最近の投稿取得エラー:', error);
    return [];
  }
}

/**
 * カテゴリでフィルタリングした投稿を取得する
 * @param categorySlug フィルタリングするカテゴリのスラッグ
 */
export async function getPostsByCategory(categorySlug: string): Promise<Post[]> {
  try {
    const allPosts = await getAllPostsFromNotion();
    const { categories } = await getCategoriesAndTags();
    
    // スラッグからカテゴリ名を取得
    const categoryInfo = categories.find(c => c.slug === categorySlug);
    
    if (!categoryInfo) {
      console.warn(`カテゴリスラッグ "${categorySlug}" に一致するカテゴリが見つかりません`);
      return [];
    }
    
    const categoryName = categoryInfo.name;
    
    // 公開済みで指定されたカテゴリの投稿のみをフィルタリング
    const filteredPosts = allPosts
      .filter(post => {
        // 無効なデータをチェック
        if (!post.published) return false;
        if (!post.categories || !Array.isArray(post.categories)) return false;
        
        // カテゴリ名が一致するかチェック
        return post.categories.includes(categoryName);
      })
      .sort((a, b) => {
        // 日付の安全な取得
        const getTime = (post: Post) => {
          try {
            return new Date(post.date || post.lastEditedAt || Date.now()).getTime();
          } catch (e) {
            return Date.now(); // 日付が無効な場合は現在時刻を使用
          }
        };
        
        const dateA = getTime(a);
        const dateB = getTime(b);
        return dateB - dateA;
      });
      
    console.log(`Found ${filteredPosts.length} posts for category "${categoryName}" (slug: ${categorySlug})`);
    return filteredPosts;
  } catch (error) {
    console.error(`カテゴリスラッグ "${categorySlug}" の投稿取得エラー:`, error);
    return [];
  }
}

/**
 * カテゴリとタグの一覧を取得する
 * ビルド時間短縮のためにメモリキャッシュを利用
 */
export async function getCategoriesAndTags(): Promise<{ categories: Category[], tags: Tag[] }> {
  try {
    // メモリキャッシュがあれば利用
    if (global.__CATEGORIES_TAGS_CACHE) {
      return global.__CATEGORIES_TAGS_CACHE;
    }
    
    const allPosts = await getAllPostsFromNotion();
    
    // 公開済みの記事のみをフィルタリング
    const publishedPosts = allPosts.filter(post => post.published);
    
    // すべてのカテゴリを取得し、重複を除去
    const allCategories = publishedPosts.flatMap(post => post.categories || []);
    const uniqueCategories = [...new Set(allCategories)];
    
    // カテゴリとその記事数をマッピング
    const categoryCount = uniqueCategories.map(category => {
      const count = publishedPosts.filter(post => 
        post.categories && post.categories.includes(category)
      ).length;
      
      return { name: category, count };
    });
    
    // カテゴリにアイコンとスラッグを追加
    const categoriesWithIconsAndSlugs = categoryCount.map(category => {
      let icon = '📄'; // デフォルトは文書アイコン
      let slug = ''; // デフォルトは空文字列
      
      // カテゴリ名に基づいてアイコンとスラッグを設定
      if (category.name) {
        switch(category.name.toLowerCase()) {
          case 'パートナーシップ':
            icon = '👫'; // カップル
            slug = 'partnership';
            break;
          case '旅':
            icon = '🌎'; // 地球
            slug = 'travel';
            break;
          case 'ポーカー':
            icon = '🎴'; // トランプ
            slug = 'poker';
            break;
          case '人生':
            icon = '💼'; // ビル
            slug = 'life';
            break;
          case '生活':
            icon = '🎯'; // 家
            slug = 'lifestyle';
            break;
          case '仕組み化':
            icon = '🤖'; // ロボット
            slug = 'automation';
            break;
          case 'ビジネス':
            icon = '🛍'; // ショッピングバッグ
            slug = 'business';
            break;
          case '健康':
            icon = '❤️'; // ハート
            slug = 'health';
            break;
          default:
            // カテゴリ名をローマ字化して小文字に変換（簡易的な実装）
            slug = category.name
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, '-') // 英数字以外をハイフンに
              .replace(/^-|-$/g, ''); // 先頭と末尾のハイフンを削除
            if (!slug) slug = `category-${Date.now()}`; // スラッグが空の場合
        }
      }
      
      return { ...category, icon, slug };
    });
    
    // 記事数の多い順にソート
    const sortedCategories = categoriesWithIconsAndSlugs.sort((a, b) => b.count - a.count);
    
    // タグは現段階では固定値を返す
    const tags: Tag[] = [
      { name: 'Web開発', count: 5, icon: '💻', slug: 'web-development' },
      { name: 'デザイン', count: 3, icon: '🎨', slug: 'design' },
      { name: '旅行', count: 7, icon: '✈️', slug: 'travel' },
      { name: '読書', count: 4, icon: '📖', slug: 'reading' },
      { name: 'ポーカー', count: 2, icon: '🎴', slug: 'poker' },
    ];
    
    const result = {
      categories: sortedCategories,
      tags
    };
    
    // メモリキャッシュに保存
    global.__CATEGORIES_TAGS_CACHE = result;
    
    return result;
  } catch (error) {
    console.error('カテゴリとタグの取得エラー:', error);
    return { categories: [], tags: [] };
  }
}
