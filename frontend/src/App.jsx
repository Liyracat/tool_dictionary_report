import React from 'react';

export default function App() {
  return (
    <div className="app-shell">
      <header>
        <h1>Tool Dictionary Report</h1>
        <p>学びを整理するためのローカル辞書ツールのフロントエンド雛形です。</p>
      </header>
      <main>
        <section className="card-grid">
          <div className="card">
            <h2>インポート</h2>
            <p>ChatGPT の会話ファイルや手動入力を取り込むための画面をここに配置します。</p>
          </div>
          <div className="card">
            <h2>検索</h2>
            <p>キーワード検索やタグ検索で過去の情報を引き出せるようにします。</p>
          </div>
          <div className="card">
            <h2>カテゴリ</h2>
            <p>「知識」「議論のまとめ」「対話者の価値観」「抽象概念」を整理して表示します。</p>
          </div>
        </section>
      </main>
    </div>
  );
}