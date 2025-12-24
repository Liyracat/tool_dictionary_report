-- =========================================================
-- Core tables
-- =========================================================
PRAGMA foreign_keys = ON;

-- 取り込み単位（原文は保存しない）
CREATE TABLE IF NOT EXISTS chunks (
  chunk_id      TEXT PRIMARY KEY,               -- UUID推奨
  thread_id     TEXT NOT NULL,                  -- ChatGPT thread/conversation id
  source_type   TEXT NOT NULL DEFAULT 'chatgpt_export_json',
  time_start    TEXT,                           -- ISO8601
  time_end      TEXT,                           -- ISO8601
  digest        TEXT NOT NULL,                  -- sha256等
  locator_json  TEXT NOT NULL,                  -- export_path/turn_range/message_idsなど
  hint          TEXT,                           -- 30-80文字くらいの“葉っぱ”
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_chunks_thread_time
  ON chunks(thread_id, time_start, time_end);

CREATE UNIQUE INDEX IF NOT EXISTS uq_chunks_digest
  ON chunks(digest);


-- 抽出アイテム本体（items一本化）
CREATE TABLE IF NOT EXISTS items (
  item_id     TEXT PRIMARY KEY,                -- UUID推奨
  chunk_id    TEXT NOT NULL REFERENCES chunks(chunk_id) ON DELETE CASCADE,

  kind        TEXT NOT NULL,                   -- knowledge/value/summary/model/decision/...
  schema_id   TEXT NOT NULL,                   -- knowledge/howto.v1 等
  stable_key  TEXT,                            -- LLM提案→人間採用
  title       TEXT NOT NULL,                   -- 結論が一目で分かる短文
  body        TEXT NOT NULL,                   -- 結論本文

  -- 知識の「同一分野内で上書き」をやりやすくする補助（LLM推定→後で直す）
  domain      TEXT,                            -- 例: "aquarium", "software.testing"

  -- 評価/状態
  confidence  REAL NOT NULL DEFAULT 0.0,
  status      TEXT NOT NULL DEFAULT 'active',  -- active/archived/deleted など
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),

  -- 原文引用はしない。思い出し用の手がかりだけ。
  evidence_basis     TEXT,                     -- 根拠の説明（要約）

  -- kindの取りうる値を緩く制約（増やす前提なのでガチガチにはしない）
  CHECK (length(kind) > 0),
  CHECK (length(schema_id) > 0),
  CHECK (confidence >= 0.0 AND confidence <= 1.0)
);

CREATE INDEX IF NOT EXISTS idx_items_kind
  ON items(kind);

CREATE INDEX IF NOT EXISTS idx_items_chunk
  ON items(chunk_id);

CREATE INDEX IF NOT EXISTS idx_items_stable_key
  ON items(stable_key);

CREATE INDEX IF NOT EXISTS idx_items_domain
  ON items(kind, domain);

-- 知識・価値観は「最新が正」＝ stable_key でUPSERTしたい想定
-- （stable_keyがNULLのものは重複OK）
CREATE UNIQUE INDEX IF NOT EXISTS uq_items_stateful_stable_key
  ON items(kind, stable_key)
  WHERE stable_key IS NOT NULL
    AND kind IN ('knowledge','value');

-- 決断は将来価値があるので一覧しやすく（任意）
CREATE INDEX IF NOT EXISTS idx_items_decision_time
  ON items(kind, created_at)
  WHERE kind = 'decision';


-- schema差分を押し込むpayload（JSON文字列）
CREATE TABLE IF NOT EXISTS item_payloads (
  item_id     TEXT PRIMARY KEY REFERENCES items(item_id) ON DELETE CASCADE,
  payload_json TEXT NOT NULL                  -- JSON（steps/options/reasons/relations等）
);

-- item間リンク（item→item only）
CREATE TABLE IF NOT EXISTS item_links (
  link_id     TEXT PRIMARY KEY,               -- UUID推奨
  item_id     TEXT NOT NULL REFERENCES items(item_id) ON DELETE CASCADE,
  rel         TEXT NOT NULL,                  -- born_from/supersedes/related/contradicts
  target_key  TEXT NOT NULL,                  -- item_id
  note        TEXT,                           -- 任意メモ
  confidence  REAL NOT NULL DEFAULT 0.0,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CHECK (confidence >= 0.0 AND confidence <= 1.0)
);

CREATE INDEX IF NOT EXISTS idx_item_links_item
  ON item_links(item_id);

CREATE INDEX IF NOT EXISTS idx_item_links_target
  ON item_links(target_key);

CREATE INDEX IF NOT EXISTS idx_item_links_rel
  ON item_links(rel);


-- =========================================================
-- Tags (loose hierarchy)
-- =========================================================
CREATE TABLE IF NOT EXISTS tags (
  tag_id     INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  path       TEXT NOT NULL DEFAULT '',        -- "知識/アクアリウム" みたいなゆる階層
  parent_id  INTEGER REFERENCES tags(tag_id) ON DELETE SET NULL,

  UNIQUE(name, path)
);

CREATE INDEX IF NOT EXISTS idx_tags_path
  ON tags(path);

CREATE TABLE IF NOT EXISTS item_tags (
  item_id    TEXT NOT NULL REFERENCES items(item_id) ON DELETE CASCADE,
  tag_id     INTEGER NOT NULL REFERENCES tags(tag_id) ON DELETE CASCADE,
  confidence REAL NOT NULL DEFAULT 0.0,
  PRIMARY KEY (item_id, tag_id),
  CHECK (confidence >= 0.0 AND confidence <= 1.0)
);

CREATE INDEX IF NOT EXISTS idx_item_tags_tag
  ON item_tags(tag_id);


-- =========================================================
-- Speaker master
-- =========================================================
CREATE TABLE IF NOT EXISTS speakers (
  speaker_id     INTEGER PRIMARY KEY AUTOINCREMENT,
  speaker_name   TEXT NOT NULL UNIQUE,
  role           TEXT,
  canonical_role TEXT NOT NULL DEFAULT 'unknown',
  CHECK (canonical_role IN ('human', 'ai', 'system', 'unknown'))
);


-- =========================================================
-- Full Text Search (FTS5)
-- contentless FTS + triggers
-- =========================================================
CREATE VIRTUAL TABLE IF NOT EXISTS items_fts USING fts5(
  item_id UNINDEXED,
  title,
  body,
  tags_text,
  kind,
  schema_id,
  domain,
  tokenize = 'unicode61'
);

-- FTS同期用：タグ文字列生成（雑にGROUP_CONCAT）
-- ※SQLiteの制約上、トリガー内でSELECTを使う形にする

CREATE TRIGGER IF NOT EXISTS trg_items_ai_fts
AFTER INSERT ON items
BEGIN
  INSERT INTO items_fts(item_id, title, body, tags_text, kind, schema_id, domain)
  VALUES(
    NEW.item_id,
    NEW.title,
    NEW.body,
    COALESCE((
      SELECT GROUP_CONCAT(t.name, ' ')
      FROM item_tags it
      JOIN tags t ON t.tag_id = it.tag_id
      WHERE it.item_id = NEW.item_id
    ), ''),
    NEW.kind,
    NEW.schema_id,
    COALESCE(NEW.domain,'')
  );
END;

CREATE TRIGGER IF NOT EXISTS trg_items_au_fts
AFTER UPDATE OF title, body, kind, schema_id, domain ON items
BEGIN
  DELETE FROM items_fts WHERE item_id = NEW.item_id;
  INSERT INTO items_fts(item_id, title, body, tags_text, kind, schema_id, domain)
  VALUES(
    NEW.item_id,
    NEW.title,
    NEW.body,
    COALESCE((
      SELECT GROUP_CONCAT(t.name, ' ')
      FROM item_tags it
      JOIN tags t ON t.tag_id = it.tag_id
      WHERE it.item_id = NEW.item_id
    ), ''),
    NEW.kind,
    NEW.schema_id,
    COALESCE(NEW.domain,'')
  );
END;

CREATE TRIGGER IF NOT EXISTS trg_items_ad_fts
AFTER DELETE ON items
BEGIN
  DELETE FROM items_fts WHERE item_id = OLD.item_id;
END;

-- タグ付け替え時もFTS更新（「後から直す」が要件なので重要）
CREATE TRIGGER IF NOT EXISTS trg_item_tags_ai_fts
AFTER INSERT ON item_tags
BEGIN
  DELETE FROM items_fts WHERE item_id = NEW.item_id;
  INSERT INTO items_fts(item_id, title, body, tags_text, kind, schema_id, domain)
  SELECT
    i.item_id,
    i.title,
    i.body,
    COALESCE((
      SELECT GROUP_CONCAT(t.name, ' ')
      FROM item_tags it
      JOIN tags t ON t.tag_id = it.tag_id
      WHERE it.item_id = i.item_id
    ), ''),
    i.kind,
    i.schema_id,
    COALESCE(i.domain,'')
  FROM items i
  WHERE i.item_id = NEW.item_id;
END;

CREATE TRIGGER IF NOT EXISTS trg_item_tags_ad_fts
AFTER DELETE ON item_tags
BEGIN
  DELETE FROM items_fts WHERE item_id = OLD.item_id;
  INSERT INTO items_fts(item_id, title, body, tags_text, kind, schema_id, domain)
  SELECT
    i.item_id,
    i.title,
    i.body,
    COALESCE((
      SELECT GROUP_CONCAT(t.name, ' ')
      FROM item_tags it
      JOIN tags t ON t.tag_id = it.tag_id
      WHERE it.item_id = i.item_id
    ), ''),
    i.kind,
    i.schema_id,
    COALESCE(i.domain,'')
  FROM items i
  WHERE i.item_id = OLD.item_id;
END;

-- 1ジョブ = 1回の抽出JSON取り込み（レビュー単位）
CREATE TABLE IF NOT EXISTS import_jobs (
  job_id        TEXT PRIMARY KEY,  -- UUID推奨

  -- 抽出JSONの source から拾える範囲は持っておく（一覧に便利）
  source_type   TEXT NOT NULL DEFAULT 'chatgpt_export_json',
  thread_id     TEXT,
  chunk_id      TEXT,              -- 抽出JSON上のchunk_id（作業単位）。DBのchunks.chunk_idと一致させてもOK
  digest        TEXT,              -- source.digest（重複検出に使える）
  hint          TEXT,              -- source.hint（葉っぱ）

  -- 生のsource情報を保持（locator等）
  source_json   TEXT NOT NULL,     -- JSON object (抽出JSON.source)

  -- 状態
  status        TEXT NOT NULL DEFAULT 'reviewing',  -- reviewing/committed/discarded
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),

  CHECK (status IN ('reviewing','committed','discarded'))
);

CREATE INDEX IF NOT EXISTS idx_import_jobs_status_time
  ON import_jobs(status, created_at);

CREATE INDEX IF NOT EXISTS idx_import_jobs_thread
  ON import_jobs(thread_id);


-- ジョブ内の候補（1 candidate = 1 item候補）
CREATE TABLE IF NOT EXISTS import_candidates (
  candidate_id   TEXT PRIMARY KEY,  -- UUID推奨
  job_id         TEXT NOT NULL REFERENCES import_jobs(job_id) ON DELETE CASCADE,

  -- 抽出JSONの items[].item_id（temp-id:n）を保持しておくとリンク解決が楽
  temp_item_id   TEXT NOT NULL,     -- 例: "temp-id:3"

  decision       TEXT NOT NULL DEFAULT 'KEEP',  -- KEEP/SKIP
  skip_type      TEXT NOT NULL DEFAULT 'NONE',  -- NONE/EMO/EVENT/NOISE/DUPLICATE/OTHER
  reason         TEXT,                           -- 任意

  -- レビューで編集された item を丸ごと保持（items相当 + payload/evidence/tags/links も含めてOK）
  item_json      TEXT NOT NULL,                  -- JSON object

  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),

  CHECK (decision IN ('KEEP','SKIP'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_import_candidates_job_temp
  ON import_candidates(job_id, temp_item_id);

CREATE INDEX IF NOT EXISTS idx_import_candidates_job_decision
  ON import_candidates(job_id, decision);


-- ジョブ更新時刻更新（雑にトリガー）
CREATE TRIGGER IF NOT EXISTS trg_import_candidates_au_job_touch
AFTER UPDATE ON import_candidates
BEGIN
  UPDATE import_jobs
  SET updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  WHERE job_id = NEW.job_id;
END;


-- （任意）コミット時の temp-id:n → 実item_id 解決を残したい場合のマップ
CREATE TABLE IF NOT EXISTS import_id_map (
  job_id       TEXT NOT NULL REFERENCES import_jobs(job_id) ON DELETE CASCADE,
  temp_item_id TEXT NOT NULL,
  item_id      TEXT NOT NULL,  -- 実際に作られた items.item_id
  PRIMARY KEY (job_id, temp_item_id)
);

CREATE INDEX IF NOT EXISTS idx_import_id_map_item
  ON import_id_map(item_id);