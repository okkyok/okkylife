'use client';

import Image from 'next/image';
import Link from 'next/link';

import CategoryList from '@/components/category-list';
import { Post } from '@/types/post';

export default function PostCard({
  post: { slug, title, date, cover, categories, blurUrl },
}: {
  post: Post;
}) {
  // デバッグ用にカバー画像のURLをログ出力
  console.log(`PostCard for ${slug} - Cover URL:`, cover);
  return (
    <Link href={`/blog/${slug}`}>
      <article className="mx-auto flex max-w-[25rem] flex-col overflow-hidden rounded-xl shadow-xl shadow-gray-400 transition-all duration-300 hover:scale-[1.05] hover:shadow-2xl dark:shadow-black">
        <div className="relative h-60">
          {/* デバッグ用：カバー画像のURLをコンソールに出力 */}
          {/* 型エラーを避けるため、console.logを直接JSXに含めない */}
          <>{(() => { console.log('PostCard rendering with cover URL:', cover); return null; })()}</>
          
          {/* デバッグモードの設定 */}
          {(() => {
            // デバッグモードをオン/オフ（trueにすると画像URLが表示されます）
            const debugMode = true;
            
            if (debugMode) {
              return (
                <div style={{ position: 'relative', width: '100%', height: '100%' }}>
                  <Image
                    src={cover || '/placeholder-image.jpg'}
                    alt={`${title}のカバー画像`}
                    fill
                    style={{ objectFit: 'cover' }}
                    unoptimized={true}
                    priority={true}
                    {...(cover && blurUrl ? {
                      placeholder: "blur",
                      blurDataURL: blurUrl
                    } : {})}
                  />
                  <div style={{ 
                    position: 'absolute', 
                    bottom: 0, 
                    left: 0, 
                    right: 0, 
                    background: 'rgba(0,0,0,0.7)', 
                    color: 'white', 
                    padding: '5px',
                    fontSize: '10px',
                    wordBreak: 'break-all'
                  }}>
                    URL: {cover || 'なし'}
                  </div>
                </div>
              );
            } else {
              return (
                <Image
                  src={cover || '/placeholder-image.jpg'}
                  alt={`${title}のカバー画像`}
                  fill
                  style={{ objectFit: 'cover' }}
                  unoptimized={true}
                  priority={true}
                  {...(cover && blurUrl ? {
                    placeholder: "blur",
                    blurDataURL: blurUrl
                  } : {})}
                />
              );
            }
          })()}
        </div>
        <div className="flex h-48 flex-col p-4">
          <h3 className="line-clamp-2 h-16 text-2xl font-bold">{title}</h3>
          <time className="mb-4 mt-2 pl-2 text-sm text-gray-400">{date}</time>
          <CategoryList categories={categories} />
        </div>
      </article>
    </Link>
  );
}
