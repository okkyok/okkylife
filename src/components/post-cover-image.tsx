'use client';

import Image from 'next/image';
import { useState } from 'react';

interface PostCoverImageProps {
  src: string;
  alt: string;
  className?: string;
  priority?: boolean;
}

/**
 * 記事のカバー画像コンポーネント
 * エラーハンドリング機能付き
 */
export default function PostCoverImage({ 
  src, 
  alt, 
  className = '', 
  priority = false 
}: PostCoverImageProps) {
  const [error, setError] = useState(false);
  const fallbackImage = '/placeholder-image.jpg';
  
  // 画像URLが無効な場合はフォールバック画像を使用
  const imageSrc = !src || error ? fallbackImage : src;
  
  return (
    <div className={`relative h-48 overflow-hidden rounded-lg ${className}`}>
      <Image
        src={imageSrc}
        alt={alt || '記事のカバー画像'}
        fill
        style={{ objectFit: 'cover' }}
        className="transition-transform group-hover:scale-105"
        sizes="(max-width: 768px) 100vw, 50vw"
        loading={priority ? 'eager' : 'lazy'}
        placeholder="blur"
        blurDataURL="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+P+/HgAEtAJJXIDTjwAAAABJRU5ErkJggg=="
        onError={() => setError(true)}
      />
    </div>
  );
}
