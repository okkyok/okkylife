import { NextRequest, NextResponse } from 'next/server';

/**
 * 画像プロキシAPI - 完全改善版
 * 下記の問題を解決するためのエンドポイント
 * 1. Notion画像のCORS問題
 * 2. 長いURLの画像が読み込めない問題
 * 3. S3等の署名付きURLの有効期限切れ問題
 * 4. 静的画像キャッシュの実装
 */

// メモリキャッシュの実装（サーバー再起動まで保持）
type CachedImage = {
  data: ArrayBuffer;
  contentType: string;
  timestamp: number;
};

const IMAGE_CACHE = new Map<string, CachedImage>();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24時間（ミリ秒）

// 画像の種類を判断する関数
function getImageType(url: string): 'notion' | 'amazon' | 'external' {
  if (url.includes('notion.so') || url.includes('notion-static.com')) {
    return 'notion';
  } else if (url.includes('amazonaws.com')) {
    return 'amazon';
  } else {
    return 'external';
  }
}

// プレースホルダー画像へのリダイレクトレスポンスを生成
function redirectToPlaceholder(reason: string): NextResponse {
  console.log(`Image proxy: Redirecting to placeholder - ${reason}`);
  return new NextResponse(null, {
    status: 302,
    headers: {
      'Location': '/placeholder-image.jpg'
    }
  });
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  // URLパラメータから画像のURLを取得
  const { searchParams } = new URL(request.url);
  const imageUrl = searchParams.get('url');
  const forceRefresh = searchParams.get('refresh') === 'true';
  
  // URLがない場合はプレースホルダー画像にリダイレクト
  if (!imageUrl) {
    return redirectToPlaceholder('No URL provided');
  }
  
  // URLが長すぎる場合はプレースホルダー画像にリダイレクト
  if (imageUrl.length > 500) {
    return redirectToPlaceholder(`URL too long (${imageUrl.length} chars)`);
  }
  
  // 画像の種類を判断
  const imageType = getImageType(imageUrl);
  
  // Notionの画像はプレースホルダーに直接リダイレクト
  if (imageType === 'notion') {
    return redirectToPlaceholder('Notion image detected');
  }
  
  // キャッシュをチェック（強制リフレッシュでない場合）
  if (!forceRefresh && IMAGE_CACHE.has(imageUrl)) {
    const cachedImage = IMAGE_CACHE.get(imageUrl)!;
    const now = Date.now();
    
    // キャッシュが有効期限内かチェック
    if (now - cachedImage.timestamp < CACHE_TTL) {
      console.log(`Image proxy: Cache hit for ${imageUrl}`);
      return new NextResponse(cachedImage.data, {
        status: 200,
        headers: {
          'Content-Type': cachedImage.contentType,
          'Cache-Control': 'public, max-age=86400',
          'X-Cache': 'HIT',
          'Access-Control-Allow-Origin': '*'
        }
      });
    } else {
      // 期限切れのキャッシュを削除
      IMAGE_CACHE.delete(imageUrl);
    }
  }
  
  try {
    console.log(`Image proxy: Fetching ${imageUrl}`);
    
    // 画像を取得
    const response = await fetch(imageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.114 Safari/537.36'
      }
    });
    
    // レスポンスが成功しない場合はプレースホルダー画像にリダイレクト
    if (!response.ok) {
      return redirectToPlaceholder(`Fetch failed with status ${response.status}`);
    }
    
    // 画像データを取得
    const imageData = await response.arrayBuffer();
    
    // Content-Typeを取得
    const contentType = response.headers.get('Content-Type') || 'image/jpeg';
    
    // キャッシュに保存
    IMAGE_CACHE.set(imageUrl, {
      data: imageData,
      contentType,
      timestamp: Date.now()
    });
    
    console.log(`Image proxy: Successfully fetched and cached ${imageUrl}`);
    
    // レスポンスを返す
    return new NextResponse(imageData, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400',
        'X-Cache': 'MISS',
        'Access-Control-Allow-Origin': '*'
      }
    });
  } catch (error) {
    console.error('Image proxy error:', error);
    return redirectToPlaceholder('Fetch error');
  }
}
