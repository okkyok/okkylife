import Image from 'next/image';
import Link from 'next/link';
import { getRecentPosts } from '@/services/posts';

export const metadata = {
  title: 'Welcome | 愛をもって、人生を楽しみ尽くす',
  description: 'おっきーのブログです。パートナーシップコーチとして活動しています。',
};

export default async function HomePage() {
  // 直近1ヶ月の記事を取得
  const recentPosts = await getRecentPosts();
  
  return (
    <div className="mt-12">
      <h1 className="text-center text-3xl font-bold mb-8">愛をもって、人生を楽しみ尽くす</h1>
      
      <div className="flex flex-col md:flex-row gap-8">
        {/* 左半分: Aboutの内容 */}
        <div className="md:w-1/2">
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
            
            <div className="mt-6 text-center">
              <Link href="/about" className="text-blue-600 hover:text-blue-800">詳しく見る →</Link>
            </div>
          </div>
        </div>
        
        {/* 右半分: 直近1ヶ月の新着記事 */}
        <div className="md:w-1/2 border-t md:border-t-0 md:border-l border-gray-200 pt-6 md:pt-0 md:pl-8">
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
