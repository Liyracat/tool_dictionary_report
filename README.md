# Tool Dictionary Report

FastAPI + React のローカル辞書ツール雛形です。ChatGPT の会話ログや手入力で得た知識を整理し、キーワード検索やタグ検索で引き出せるアプリケーションの土台になります。

## 構成

- **backend/**: FastAPI アプリケーション（uvicorn で起動）
- **frontend/**: Vite + React フロントエンド
- **DB**: SQLite（FTS5 利用を想定）。既定の DB パスは環境変数で指定します。

## 事前準備

- Python 3.11 以降
- Node.js 18 以降 / npm

### 環境変数

| 変数名 | 説明 | 例 |
| --- | --- | --- |
| `DB_PATH` | SQLite DB の保存先パス。未指定なら `./data/app.db` を想定。 | `./data/app.db` |

## Backend (FastAPI)

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

- ルート: `GET /` で `{"status": "ok"}` を返します。
- ヘルスチェック: `GET /health` で稼働確認ができます。

## Frontend (React)

```bash
cd frontend
npm install
npm run dev -- --host --port 5173
```

- ブラウザで `http://localhost:5173` を開くとトップ画面が表示されます。

## 備考

- ID は UUID を前提としています。
- 今後、`knowledge`/`value` の `stable_key` で UPSERT、digest 重複時の 409 応答などを実装予定です。
