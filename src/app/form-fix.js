'use client';

/**
 * フォームフィールドの問題を修正するスクリプト
 * id/name属性のないフォームフィールドに自動的に属性を追加します
 */
export function FormFieldFixer() {
  if (typeof window !== 'undefined') {
    // クライアントサイドでのみ実行
    setTimeout(() => {
      // すべてのinput要素を取得
      const inputs = document.querySelectorAll('input:not([id]):not([name])');
      
      // id/name属性のないinput要素にランダムなIDを付与
      inputs.forEach((input, index) => {
        const randomId = `auto-input-${Date.now()}-${index}`;
        input.setAttribute('id', randomId);
        input.setAttribute('name', randomId);
        
        // 自動補完を無効化
        input.setAttribute('autocomplete', 'off');
      });
      
      // すべてのtextarea要素を取得
      const textareas = document.querySelectorAll('textarea:not([id]):not([name])');
      
      // id/name属性のないtextarea要素にランダムなIDを付与
      textareas.forEach((textarea, index) => {
        const randomId = `auto-textarea-${Date.now()}-${index}`;
        textarea.setAttribute('id', randomId);
        textarea.setAttribute('name', randomId);
        
        // 自動補完を無効化
        textarea.setAttribute('autocomplete', 'off');
      });
      
      // すべてのselect要素を取得
      const selects = document.querySelectorAll('select:not([id]):not([name])');
      
      // id/name属性のないselect要素にランダムなIDを付与
      selects.forEach((select, index) => {
        const randomId = `auto-select-${Date.now()}-${index}`;
        select.setAttribute('id', randomId);
        select.setAttribute('name', randomId);
      });
      
      console.log('フォームフィールドの修正が完了しました');
    }, 1000); // ページ読み込み後に実行
  }
  
  return null;
}
