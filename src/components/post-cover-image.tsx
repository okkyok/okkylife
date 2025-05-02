'use client';

import Image from 'next/image';
import { useState, useEffect } from 'react';

interface PostCoverImageProps {
  src: string;
  alt: string;
  className?: string;
  priority?: boolean;
}

// 静的なカバー画像のマッピング
const STATIC_COVER_IMAGES = {
  'ウガンダのカンパラ': '/images/covers/uganda-kampala.jpg',
  'カンパラ': '/images/covers/uganda-kampala.jpg',
  'ウガンダ': '/images/covers/uganda-kampala.jpg',
  'ポーカー': '/images/covers/poker.jpg',
  '旅': '/images/covers/travel.jpg',
  '旅行': '/images/covers/travel.jpg',
  '旅の辞め時': '/images/covers/travel-end.jpg',
  '旅の終わり': '/images/covers/travel-end.jpg',
};

/**
 * 記事のカバー画像コンポーネント - 完全改善版
 * エラーハンドリング機能と静的画像マッピング機能付き
 */
export default function PostCoverImage({ 
  src, 
  alt, 
  className = '', 
  priority = false 
}: PostCoverImageProps) {
  const [error, setError] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [imageSrc, setImageSrc] = useState('/placeholder-image.jpg');
  
  // 静的画像マッピングを使用して画像URLを取得
  const getStaticImageUrl = (title: string): string | null => {
    // タイトルに基づいて静的画像を選択
    for (const [keyword, imageUrl] of Object.entries(STATIC_COVER_IMAGES)) {
      if (title.includes(keyword)) {
        return imageUrl;
      }
    }
    return null;
  };
  
  useEffect(() => {
    // 静的画像マッピングを優先
    const staticImage = getStaticImageUrl(alt);
    if (staticImage) {
      setImageSrc(staticImage);
      return;
    }
    
    if (!src) {
      setImageSrc('/placeholder-image.jpg');
      return;
    }
    
    // 明らかに問題のあるURLパターンを検出
    if (src.length > 200 || src.includes('URL:')) {
      setImageSrc('/placeholder-image.jpg');
      return;
    }
    
    // Notionの画像URLを処理
    if (src.includes('notion.so') || src.includes('notion-static.com')) {
      // 直接プレースホルダー画像を使用
      setImageSrc('/placeholder-image.jpg');
      return;
    }
    
    // 有効なURLかチェック
    try {
      new URL(src);
      // 有効なURLの場合は直接使用
      setImageSrc(src);
    } catch {
      // 無効なURLの場合はプレースホルダー画像を使用
      setImageSrc('/placeholder-image.jpg');
    }
  }, [src, alt]);
  
  return (
    <div className={`relative h-48 overflow-hidden rounded-lg ${className}`}>
      {/* プレースホルダー表示（画像読み込み中） */}
      {!loaded && !error && (
        <div className="absolute inset-0 bg-gray-200 animate-pulse flex items-center justify-center">
          <span className="text-gray-400 text-sm">画像を読み込み中...</span>
        </div>
      )}
      
      {/* 実際の画像 */}
      <Image
        src={error ? '/placeholder-image.jpg' : imageSrc}
        alt={alt || '記事のカバー画像'}
        fill
        style={{ objectFit: 'cover' }}
        className={`transition-transform group-hover:scale-105 ${loaded ? 'opacity-100' : 'opacity-0'}`}
        sizes="(max-width: 768px) 100vw, 50vw"
        loading={priority ? 'eager' : 'lazy'}
        placeholder="blur"
        blurDataURL="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+P+/HgAEtAJJXIDTjwAAAABJRU5ErkJggg=="
        onError={() => {
          console.error(`Image load error for: ${imageSrc}`);
          setError(true);
        }}
        onLoad={() => {
          console.log(`Image loaded successfully: ${imageSrc}`);
          setLoaded(true);
        }}
      />
    </div>
  );
}
