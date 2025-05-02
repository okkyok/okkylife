import Link from 'next/link';
import Image from 'next/image';
import { getPostsByCategory, getCategoriesAndTags } from '@/services/posts';
import { formatDate } from '@/utils/date';
import PostCoverImage from '@/components/post-cover-image';

export async function generateMetadata({ params }: { params: { category: string } }) {
  const categorySlug = params.category; // スラッグを取得
  const { categories } = await getCategoriesAndTags();
  
  // スラッグからカテゴリ情報を取得
  const categoryInfo = categories.find(c => c.slug === categorySlug);
  const categoryName = categoryInfo?.name || categorySlug;
  
  return {
    title: `${categoryName} | 愛をもって、人生を楽しみ尽くす`,
    description: `${categoryName}に関する記事の一覧です。`,
  };
}

export default async function CategoryPage({ params }: { params: { category: string } }) {
  const categorySlug = params.category; // スラッグを取得
  const posts = await getPostsByCategory(categorySlug);
  const { categories } = await getCategoriesAndTags();
  
  // スラッグからカテゴリ情報を取得
  const categoryInfo = categories.find(c => c.slug === categorySlug);
  const categoryName = categoryInfo?.name || categorySlug;
  const categoryIcon = categoryInfo?.icon || '📄';
  
  return (
    <div className="mt-8 max-w-4xl mx-auto px-4">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold mb-2 flex items-center justify-center">
          <span className="mr-2 text-2xl">{categoryIcon}</span>
          {categoryName}
        </h1>
        <p className="text-gray-600">
          {posts.length}件の記事が見つかりました
        </p>
      </div>
      
      {posts.length > 0 ? (
        <div className="space-y-8">
          {posts.map(post => (
            <div key={post.id} className="border-b border-gray-200 pb-6">
              <Link href={`/blog/${post.slug}`} className="block group">
                <div className="flex flex-col md:flex-row gap-4">
                  <div className="md:w-1/3">
                    <PostCoverImage
                      src={post.cover}
                      alt={post.title}
                    />
                  </div>
                  <div className="md:w-2/3">
                    <h2 className="text-xl font-bold mb-2 group-hover:text-blue-600 transition-colors">
                      {post.title}
                    </h2>
                    <div className="text-sm text-gray-500 mb-2">
                      {post.date && formatDate(post.date)}
                    </div>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {post.categories && post.categories.map(categoryName => {
                        // カテゴリ名からスラッグを取得
                        const catInfo = categories.find(c => c.name === categoryName);
                        const catSlug = catInfo?.slug || categoryName.toLowerCase().replace(/\s+/g, '-');
                        
                        return (
                          <Link 
                            href={`/categories/${catSlug}`} 
                            key={categoryName}
                            className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-800 px-2 py-1 rounded transition-colors"
                          >
                            {categoryName}
                          </Link>
                        );
                      })}
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
