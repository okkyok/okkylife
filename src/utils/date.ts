/**
 * 日付を日本語形式でフォーマットする
 * @param dateString 日付文字列
 * @returns フォーマットされた日付文字列（例: 2025年5月2日）
 */
export function formatDate(dateString: string): string {
  try {
    const date = new Date(dateString);
    
    // 無効な日付の場合は元の文字列を返す
    if (isNaN(date.getTime())) {
      return dateString;
    }
    
    // 日本語形式でフォーマット
    return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
  } catch (error) {
    console.error('日付フォーマットエラー:', error);
    return dateString;
  }
}

/**
 * 日付を相対的な表現でフォーマットする
 * @param dateString 日付文字列
 * @returns 相対的な日付表現（例: 1日前、2週間前）
 */
export function formatRelativeDate(dateString: string): string {
  try {
    const date = new Date(dateString);
    const now = new Date();
    
    // 無効な日付の場合は元の文字列を返す
    if (isNaN(date.getTime())) {
      return dateString;
    }
    
    const diffTime = Math.abs(now.getTime() - date.getTime());
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) {
      return '今日';
    } else if (diffDays === 1) {
      return '昨日';
    } else if (diffDays < 7) {
      return `${diffDays}日前`;
    } else if (diffDays < 30) {
      return `${Math.floor(diffDays / 7)}週間前`;
    } else if (diffDays < 365) {
      return `${Math.floor(diffDays / 30)}ヶ月前`;
    } else {
      return `${Math.floor(diffDays / 365)}年前`;
    }
  } catch (error) {
    console.error('相対日付フォーマットエラー:', error);
    return dateString;
  }
}
