/**
 * カスタムキャッシュハンドラー
 * Next.jsのビルドプロセスを高速化するためのキャッシュ最適化
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// キャッシュディレクトリ
const CACHE_DIR = path.join(process.cwd(), '.next/cache/custom-cache');

// キャッシュが存在することを確認
if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

/**
 * キャッシュハンドラー
 */
module.exports = class CustomCacheHandler {
  constructor(options) {
    this.options = options || {};
    this.maxAge = this.options.maxAge || 7 * 24 * 60 * 60 * 1000; // 1週間
  }

  // キーからファイルパスを生成
  getFilePath(key) {
    const hash = crypto.createHash('md5').update(key).digest('hex');
    return path.join(CACHE_DIR, `${hash}.json`);
  }

  // キャッシュの取得
  async get(key) {
    try {
      const filePath = this.getFilePath(key);
      
      if (!fs.existsSync(filePath)) {
        return null;
      }

      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      
      // 有効期限チェック
      if (data.expiresAt && Date.now() > data.expiresAt) {
        // 期限切れの場合は削除
        fs.unlinkSync(filePath);
        return null;
      }
      
      return data.value;
    } catch (error) {
      console.warn(`キャッシュ読み込みエラー: ${error.message}`);
      return null;
    }
  }

  // キャッシュの設定
  async set(key, value, options = {}) {
    try {
      const filePath = this.getFilePath(key);
      const ttl = options.ttl || this.maxAge;
      
      const data = {
        value,
        expiresAt: ttl ? Date.now() + ttl : null,
      };
      
      fs.writeFileSync(filePath, JSON.stringify(data));
      return true;
    } catch (error) {
      console.warn(`キャッシュ書き込みエラー: ${error.message}`);
      return false;
    }
  }

  // キャッシュの削除
  async delete(key) {
    try {
      const filePath = this.getFilePath(key);
      
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      
      return true;
    } catch (error) {
      console.warn(`キャッシュ削除エラー: ${error.message}`);
      return false;
    }
  }
};
