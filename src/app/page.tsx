import Image from 'next/image';
import Link from 'next/link';
import { getRecentPosts, getCategoriesAndTags } from '@/services/posts';

export const metadata = {
  title: 'Welcome | 愛をもって、人生を楽しみ尽くす',
  description: 'おっきーのブログです。パートナーシップコーチとして活動しています。',
};

export default async function HomePage() {
  // 直近1ヶ月の記事とカテゴリ・タグを取得
  const recentPosts = await getRecentPosts();
  const { categories, tags } = await getCategoriesAndTags();
  
  return (
    <div className="mt-12">
      <div className="flex flex-col md:flex-row gap-8">
        {/* 左側: Aboutの内容 (2/5) */}
        <div className="md:w-2/5">
          <div className="mb-6 flex justify-center">
            <div className="relative w-48 h-48 rounded-full overflow-hidden border-4 border-gray-200 shadow-lg">
              <Image 
                src="/images/profile-image.jpg" 
                alt="おっきーのプロフィール写真" 
                fill
                style={{ objectFit: 'cover' }}
                priority
              />
            </div>
          </div>
          
          <div className="prose prose-lg mx-auto">
            <h2 className="text-xl font-bold mb-4 text-center">おっきー｜パートナーシップコーチ</h2>
            
            <p className="mb-4">
              普段は旅しながら、コーチング、小さな会社の経営をしています。<br />
              大好きなのは、パートナー、旅、ポーカー。
            </p>
            
            <h3 className="text-lg font-bold mt-6 mb-2">【経歴】</h3>
            <p className="mb-4">
              "愛をもって、人生を楽しみ尽くす" 道中の記録、日々の気付きなどを徒然なるままに。<br />
              地方公立大学→インターネット広告代理店。その後、2017年3月から個人事業主として活動開始。2019年9月に起業。
            </p>
            
            <div className="mt-6 mb-10 text-center">
              <Link href="/about" className="text-blue-600 hover:text-blue-800">詳しく見る →</Link>
            </div>
            
            {/* カテゴリ一覧 */}
            <div className="mt-8 border-t border-gray-200 pt-6">
              <div className="flex items-center mb-4">
                <span className="text-gray-700 mr-2">■</span>
                <h3 className="text-lg font-bold">カテゴリ</h3>
              </div>
              
              <ul className="space-y-2">
                {categories.map((category) => (
                  <li key={category.name} className="flex items-center">
                    <span className="mr-2">{category.icon}</span>
                    <Link href={`/categories/${encodeURIComponent(category.name)}`} className="hover:text-blue-600 transition-colors flex-grow">
                      {category.name}
                    </Link>
                    <span className="text-sm text-gray-500 ml-auto">{category.count}</span>
                  </li>
                ))}
              </ul>
            </div>
            
            {/* タグ一覧 */}
            <div className="mt-8 border-t border-gray-200 pt-6">
              <div className="flex items-center mb-4">
                <span className="text-gray-700 mr-2">■</span>
                <h3 className="text-lg font-bold">タグ一覧</h3>
              </div>
              
              <ul className="space-y-2">
                {tags.map((tag) => (
                  <li key={tag.name} className="flex items-center">
                    <span className="mr-2">🏷️</span>
                    <Link href={`/tags/${encodeURIComponent(tag.name)}`} className="hover:text-blue-600 transition-colors flex-grow">
                      {tag.name}
                    </Link>
                    <span className="text-sm text-gray-500 ml-auto">{tag.count}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
        
        {/* 右側: 直近1ヶ月の新着記事 (3/5) */}
        <div className="md:w-3/5 border-t md:border-t-0 md:border-l border-gray-200 pt-6 md:pt-0 md:pl-8">
          <h2 className="text-2xl font-bold mb-6 text-center">直近の記事</h2>
          
          {recentPosts.length > 0 ? (
            <ul className="space-y-6">
              {recentPosts.map(post => (
                <li key={post.id} className="border-b border-gray-100 pb-4">
                  <Link href={`/posts/${post.slug}`} className="block group">
                    {post.cover && (
                      <div className="relative h-48 mb-3 overflow-hidden rounded-lg">
                        <Image 
                          src={post.cover} 
                          alt={post.title}
                          fill
                          style={{ objectFit: 'cover' }}
                          className="transition-transform group-hover:scale-105"
                          sizes="(max-width: 768px) 100vw, 50vw"
                          loading="lazy"
                          placeholder="blur"
                          blurDataURL="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+P+/HgAEtAJJXIDTjwAAAABJRU5ErkJggg=="
                        />
                      </div>
                    )}
                    <h3 className="text-xl font-semibold group-hover:text-blue-600 transition-colors">{post.title}</h3>
                    {post.date && (
                      <p className="text-sm text-gray-500 mt-1">{new Date(post.date).toLocaleDateString('ja-JP')}</p>
                    )}
                    <div className="flex flex-wrap gap-2 mt-2">
                      {post.categories.map(category => (
                        <span key={category} className="text-xs bg-gray-100 px-2 py-1 rounded">{category}</span>
                      ))}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-center text-gray-500">最近の記事はありません</p>
          )}
          
          <div className="mt-8 text-center">
            <Link href="/posts" className="text-blue-600 hover:text-blue-800">すべての記事を見る →</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
