export const metadata = {
  title: 'About',
  description: 'おっきーのプロフィールページです。パートナーシップコーチとして活動しています。',
};

export default function AboutPage() {
  return (
    <div className="mt-12 max-w-2xl mx-auto">
      <h1 className="text-center text-3xl font-bold mb-8">About</h1>
      
      <div className="prose prose-lg mx-auto">
        <h2 className="text-2xl font-bold mb-4">おっきー｜パートナーシップコーチ</h2>
        
        <p className="mb-6">
          普段は旅しながら、コーチング、小さな会社の経営をしています。<br />
          大好きなのは、パートナー、旅、ポーカー。
        </p>
        
        <h3 className="text-xl font-bold mt-8 mb-4">【経歴】</h3>
        <p className="mb-6">
          "愛をもって、人生を楽しみ尽くす" 道中の記録、日々の気付きなどを徒然なるままに。<br />
          地方公立大学→インターネット広告代理店。その後、2017年3月から個人事業主として活動開始。2019年9月に起業。
        </p>
        
        <div className="mt-12 text-center">
          <a href="/" className="text-blue-600 hover:text-blue-800">← ホームに戻る</a>
        </div>
      </div>
    </div>
  );
}
