import Link from 'next/link';
import Image from 'next/image';
import { getPostsByCategory, getCategoriesAndTags } from '@/services/posts';
import { formatDate } from '@/utils/date';

export async function generateMetadata({ params }: { params: { category: string } }) {
  const decodedCategory = decodeURIComponent(params.category);
  
  return {
    title: `${decodedCategory} | 愛をもって、人生を楽しみ尽くす`,
    description: `${decodedCategory}に関する記事の一覧です。`,
  };
}

export default async function CategoryPage({ params }: { params: { category: string } }) {
  const decodedCategory = decodeURIComponent(params.category);
  const posts = await getPostsByCategory(decodedCategory);
  const { categories } = await getCategoriesAndTags();
  
  // カテゴリのアイコンを取得
  const categoryInfo = categories.find(c => c.name === decodedCategory);
  const categoryIcon = categoryInfo?.icon || '📄';
  
  return (
    <div className="mt-8 max-w-4xl mx-auto px-4">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold mb-2 flex items-center justify-center">
          <span className="mr-2 text-2xl">{categoryIcon}</span>
          {decodedCategory}
        </h1>
        <p className="text-gray-600">
          {posts.length}件の記事が見つかりました
        </p>
      </div>
      
      {posts.length > 0 ? (
        <div className="space-y-8">
          {posts.map(post => (
            <div key={post.id} className="border-b border-gray-200 pb-6">
              <Link href={`/posts/${post.slug}`} className="block group">
                <div className="flex flex-col md:flex-row gap-4">
                  {post.cover && (
                    <div className="md:w-1/3 relative h-48 overflow-hidden rounded-lg">
                      <Image
                        src={post.cover}
                        alt={post.title}
                        fill
                        style={{ objectFit: 'cover' }}
                        loading="lazy"
                        placeholder="blur"
                        blurDataURL="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+P+/HgAEtAJJXIDTiQAAAABJRU5ErkJggg=="
                      />
                    </div>
                  )}
                  <div className="md:w-2/3">
                    <h2 className="text-xl font-bold mb-2 group-hover:text-blue-600 transition-colors">
                      {post.title}
                    </h2>
                    <div className="text-sm text-gray-500 mb-2">
                      {post.date && formatDate(post.date)}
                    </div>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {post.categories && post.categories.map(category => (
                        <Link 
                          href={`/categories/${encodeURIComponent(category)}`} 
                          key={category}
                          className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-800 px-2 py-1 rounded transition-colors"
                        >
                          {category}
                        </Link>
                      ))}
                    </div>
                  </div>
                </div>
              </Link>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-12">
          <p className="text-gray-500">このカテゴリの記事はまだありません。</p>
          <Link href="/" className="mt-4 inline-block text-blue-600 hover:text-blue-800">
            ← ホームに戻る
          </Link>
        </div>
      )}
      
      <div className="mt-12 text-center">
        <Link href="/" className="text-blue-600 hover:text-blue-800">
          ← ホームに戻る
        </Link>
      </div>
    </div>
  );
}
