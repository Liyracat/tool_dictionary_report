import React, { useCallback, useEffect, useMemo, useState } from 'react';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000';

const relOptions = ['born_from', 'related', 'contradicts', 'supersedes'];
const kinds = ['knowledge', 'value', 'summary', 'model', 'decision', 'term', 'correction'];
const sortOptions = [
  { value: 'relevance', label: '関連度' },
  { value: 'updated', label: '更新日' },
  { value: 'created', label: '作成日' },
];
const pageSizes = [10, 20, 50];
const emptyLinks = { born_from: [], related: [], contradicts: [], supersedes: [] };

const normalizeTags = (tags) => {
  if (!tags) return [];
  return tags
    .map((t) => {
      if (typeof t === 'string') return t;
      if (t?.name) return t.name;
      return '';
    })
    .filter(Boolean);
};

const parseEvidence = (value) => {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try {
    const parsed = JSON.parse(value);
    return typeof parsed === 'object' && parsed !== null ? parsed : { basis: value };
  } catch (err) {
    return { basis: value };
  }
};

const toDisplayItem = (raw) => {
  if (!raw) return null;
  const tags = normalizeTags(raw.tags);
  return {
    id: raw.item_id || raw.id,
    kind: raw.kind,
    schemaId: raw.schema_id,
    title: raw.title,
    domain: raw.domain || '',
    tags,
    updatedAt: (raw.updated_at || raw.updatedAt || '').slice(0, 10),
    createdAt: (raw.created_at || raw.createdAt || '').slice(0, 10),
    confidence: raw.confidence ?? 0,
    body: raw.body || '',
    payload: raw.payload || {},
    evidence: parseEvidence(raw.evidence || raw.evidence_basis),
    links: raw.links || { ...emptyLinks },
    stableKey: raw.stable_key || raw.stableKey || '',
    stableKeySuggested: raw.stableKeySuggested || raw.stable_key_suggested || '',
  };
};

const toRequestPayload = (item) => ({
  kind: item.kind,
  schema_id: item.schemaId || '',
  title: item.title || '',
  body: item.body || '',
  stable_key: item.stableKey || null,
  domain: item.domain || null,
  confidence: item.confidence ?? 0,
  payload: item.payload ?? {},
  evidence: item.evidence ?? {},
  tags: (item.tags || [])
    .map((name) => ({ name: typeof name === 'string' ? name : name?.name || '' }))
    .filter((t) => t.name),
});

async function fetchJson(url, options = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  if (!res.ok) {
    const text = await res.text();
    let detail = text;
    try {
      const parsed = JSON.parse(text || '{}');
      detail = parsed.detail || parsed.message || text;
    } catch (_) {
      // noop
    }
    const error = new Error(detail || `${res.status}: ${text}`);
    error.detail = detail;
    error.status = res.status;
    throw error;
  }
  return res.json();
}

function showApiError(err, fallbackMessage) {
  if (err?.detail) {
    alert(err.detail);
    return;
  }
  if (err?.message) {
    alert(err.message);
    return;
  }
  alert(fallbackMessage || 'エラーが発生しました');
}

function TagPill({ label }) {
  return <span className="pill">{label}</span>;
}

function Collapsible({ title, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="collapsible">
      <button className="collapsible-header" onClick={() => setOpen(!open)}>
        <span>{title}</span>
        <span>{open ? '▲' : '▼'}</span>
      </button>
      {open && <div className="collapsible-body">{children}</div>}
    </div>
  );
}

function SearchView({
  items,
  onOpenDetail,
  onCreateItem,
  onOpenImport,
  onOpenInputGenerator,
  onFiltersChange,
  isLoading,
}) {
  const [search, setSearch] = useState('');
  const [selectedKinds, setSelectedKinds] = useState([]);
  const [domain, setDomain] = useState('');
  const [tagFilter, setTagFilter] = useState('');
  const [sortBy, setSortBy] = useState('relevance');
  const [pageSize, setPageSize] = useState(20);

  useEffect(() => {
    onFiltersChange?.({ search, selectedKinds, domain, tagFilter, sortBy, pageSize });
  }, [search, selectedKinds, domain, tagFilter, sortBy, pageSize, onFiltersChange]);

  const domains = useMemo(() => Array.from(new Set(items.map((i) => i.domain).filter(Boolean))), [items]);

  const toggleKind = (kind) => {
    setSelectedKinds((prev) => (prev.includes(kind) ? prev.filter((k) => k !== kind) : [...prev, kind]));
  };

  return (
    <div className="panel">
      <div className="panel-header">
        <div>
          <h2>Search</h2>
          <p className="muted">フリーワード検索とフィルタで Item を探します。</p>
        </div>
        <div className="actions">
          <button className="ghost" onClick={onOpenInputGenerator}>
            入力JSON生成
          </button>
          <button className="ghost" onClick={onOpenImport}>
            インポート
          </button>
          <button className="primary" onClick={() => onCreateItem()}>+ 新規 Item</button>
        </div>
      </div>

      <div className="search-bar">
        <input
          type="text"
          placeholder="キーワード"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="filters">
          <div className="filter-group">
            <p className="label">kind</p>
            <div className="pill-list">
              {kinds.map((k) => (
                <label key={k} className={`chip ${selectedKinds.includes(k) ? 'active' : ''}`}>
                  <input type="checkbox" checked={selectedKinds.includes(k)} onChange={() => toggleKind(k)} />
                  {k}
                </label>
              ))}
            </div>
          </div>
          <div className="filter-group">
            <p className="label">domain</p>
            <select value={domain} onChange={(e) => setDomain(e.target.value)}>
              <option value="">すべて</option>
              {domains.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>
          <div className="filter-group">
            <p className="label">tags（カンマ区切り）</p>
            <input
              type="text"
              placeholder="例: llm,model"
              value={tagFilter}
              onChange={(e) => setTagFilter(e.target.value)}
            />
          </div>
          <div className="filter-group inline">
            <label>並び替え</label>
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
              {sortOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <label>件数</label>
            <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}>
              {pageSizes.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="result-list">
        {isLoading && <p className="muted">読み込み中...</p>}
        {!isLoading && items.length === 0 && <p className="muted">結果がありません。</p>}
        {!isLoading &&
          items.map((item) => (
            <button key={item.id} className="result-card" onClick={() => onOpenDetail(item)}>
              <div className="card-row">
                <span className={`badge kind-${item.kind}`}>{item.kind}</span>
                <strong>{item.title}</strong>
              </div>
              <div className="card-row muted small">
                <span>{item.domain}</span>
                <span>更新: {item.updatedAt}</span>
                <span>confidence: {(item.confidence * 100).toFixed(0)}%</span>
              </div>
              <div className="tag-row">
                {item.tags.slice(0, 3).map((t) => (
                  <TagPill key={t} label={t} />
                ))}
                {item.tags.length > 3 && <span className="muted small">+{item.tags.length - 3}</span>}
              </div>
              <p className="muted body-preview">{item.body}</p>
            </button>
          ))}
      </div>
    </div>
  );
}

function ItemDetail({ item, onBack, onEdit, onAddLink, onModelize, onClone, onDelete, isLoading }) {
  const [showPayload, setShowPayload] = useState(false);
  const [showEvidence, setShowEvidence] = useState(false);

  if (!item) return null;

  return (
    <div className="panel">
      <div className="panel-header">
        <div>
          <button className="ghost" onClick={onBack}>
            ← 戻る
          </button>
          <h2>{item.title}</h2>
          <p className="muted small">
            {item.kind} / {item.schemaId} / {item.domain} / 更新 {item.updatedAt}
          </p>
          <div className="tag-row">
            {item.tags.map((t) => (
              <TagPill key={t} label={t} />
            ))}
            <button className="ghost tiny" onClick={onEdit}>
              タグ編集
            </button>
          </div>
        </div>
        <div className="actions column">
          <button className="primary" onClick={onEdit}>
            編集
          </button>
          <button className="ghost" onClick={onAddLink}>
            リンク追加
          </button>
          {item.kind === 'summary' && (
            <button className="ghost" onClick={onModelize}>
              モデル化
            </button>
          )}
          <button className="ghost" onClick={onClone}>
            複製
          </button>
          <button className="ghost danger" onClick={onDelete}>
            削除
          </button>
        </div>
      </div>

      {isLoading ? (
        <p className="muted">読み込み中...</p>
      ) : (
        <>
          <div className="detail-body">
            <h3>本文</h3>
            <p className="body-text">{item.body}</p>

            <Collapsible title="payload (JSON)" defaultOpen={false}>
              <pre>{JSON.stringify(item.payload, null, 2)}</pre>
            </Collapsible>

            {item.evidence?.basis && (
              <Collapsible title="evidence.basis" defaultOpen={false}>
                <p>{item.evidence.basis}</p>
              </Collapsible>
            )}
          </div>

          <div className="links">
            <h3>links</h3>
            {relOptions.map((rel) => (
              <div key={rel} className="link-row">
                <span className="badge subtle">{rel}</span>
                <div className="link-targets">
                  {item.links?.[rel]?.length ? (
                    item.links[rel].map((linkId) => <span key={linkId} className="pill muted">{linkId}</span>)
                  ) : (
                    <span className="muted small">なし</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function ItemForm({ value, onChange, stableKeySuggested }) {
  const updateField = (field, val) => {
    onChange({ ...value, [field]: val });
  };

  return (
    <div className="form-grid">
      <label>
        kind
        <select value={value.kind} onChange={(e) => updateField('kind', e.target.value)}>
          {kinds.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
      </label>
      <label>
        schema_id
        <input
          type="text"
          value={value.schemaId || ''}
          onChange={(e) => updateField('schemaId', e.target.value)}
          placeholder="例: summary/decision"
        />
      </label>
      <label className="full">
        title
        <input type="text" value={value.title} onChange={(e) => updateField('title', e.target.value)} />
      </label>
      <label className="full">
        body
        <textarea rows={4} value={value.body} onChange={(e) => updateField('body', e.target.value)} />
      </label>
      <label>
        domain
        <input type="text" value={value.domain || ''} onChange={(e) => updateField('domain', e.target.value)} />
      </label>
      <label>
        tags（カンマ区切り）
        <input
          type="text"
          value={value.tags?.join(', ') || ''}
          onChange={(e) => updateField('tags', e.target.value.split(',').map((t) => t.trim()).filter(Boolean))}
        />
      </label>
      <label>
        confidence
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={value.confidence ?? 0}
          onChange={(e) => updateField('confidence', Number(e.target.value))}
        />
        <span className="muted small">{Math.round((value.confidence ?? 0) * 100)}%</span>
      </label>

      <div className="full">
        <Collapsible title="payload (JSON)" defaultOpen={false}>
          <textarea
            rows={6}
            value={value.payloadText ?? JSON.stringify(value.payload ?? {}, null, 2)}
            onChange={(e) => updateField('payloadText', e.target.value)}
          />
        </Collapsible>
      </div>

      <div className="stable-key full">
        <label>
          stable_key
          <input
            type="text"
            value={value.stableKey || ''}
            onChange={(e) => updateField('stableKey', e.target.value)}
          />
        </label>
        {stableKeySuggested && (
          <div className="suggestion">
            <span className="muted small">候補: {stableKeySuggested}</span>
            <button type="button" className="ghost tiny" onClick={() => updateField('stableKey', stableKeySuggested)}>
              候補を採用
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function EditView({ item, onSave, onCancel, onSaveAndClose }) {
  const [draft, setDraft] = useState({
    ...item,
    payloadText: item?.payload ? JSON.stringify(item.payload, null, 2) : '{}',
  });

  useEffect(() => {
    setDraft({
      ...item,
      payloadText: item?.payload ? JSON.stringify(item.payload, null, 2) : '{}',
    });
  }, [item]);

  const save = () => {
    try {
      const payload = JSON.parse(draft.payloadText || '{}');
      onSave({ ...draft, payload });
    } catch (e) {
      alert('payload の JSON が正しくありません');
    }
  };

  const saveAndClose = () => {
    try {
      const payload = JSON.parse(draft.payloadText || '{}');
      onSaveAndClose({ ...draft, payload });
    } catch (e) {
      alert('payload の JSON が正しくありません');
    }
  };

  return (
    <div className="panel">
      <div className="panel-header">
        <h2>Item 編集</h2>
        <p className="muted small">kind / schema / body / payload を手入力で修正します。</p>
      </div>

      <ItemForm value={draft} onChange={setDraft} stableKeySuggested={item?.stableKeySuggested} />

      <div className="actions">
        <button className="primary" onClick={save}>
          保存
        </button>
        <button className="ghost" onClick={saveAndClose}>
          保存して閉じる
        </button>
        <button className="ghost" onClick={onCancel}>
          キャンセル
        </button>
      </div>
    </div>
  );
}

function LinkModal({ currentItem, items, onClose, onAdd }) {
  const [rel, setRel] = useState(relOptions[0]);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(null);

  const candidates = useMemo(
    () =>
      items
        .filter((i) => i.id !== currentItem?.id)
        .filter((i) => i.title.toLowerCase().includes(query.toLowerCase()) || i.body.toLowerCase().includes(query.toLowerCase())),
    [items, currentItem, query],
  );

  return (
    <div className="modal-backdrop">
      <div className="modal">
        <div className="modal-header">
          <h3>リンク追加</h3>
          <button className="ghost" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="modal-body">
          <label>
            rel
            <select value={rel} onChange={(e) => setRel(e.target.value)}>
              {relOptions.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>
          <label>
            target 検索
            <input type="text" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="title / FTS" />
          </label>
          <div className="candidate-list">
            {candidates.map((c) => (
              <button key={c.id} className={`candidate-card ${selected?.id === c.id ? 'active' : ''}`} onClick={() => setSelected(c)}>
                <div className="candidate-header">
                  <div className="left">
                    <span className="badge subtle">{c.kind}</span>
                    <strong>{c.title}</strong>
                  </div>
                  <span className="muted small">confidence {(c.confidence * 100).toFixed(0)}%</span>
                </div>
                <p className="muted small">{c.body}</p>
              </button>
            ))}
          </div>
        </div>
        <div className="modal-footer">
          <button
            className="primary"
            onClick={() => {
              if (selected) onAdd({ rel, targetId: selected.id });
            }}
            disabled={!selected}
          >
            追加
          </button>
          <button className="ghost" onClick={onClose}>
            キャンセル
          </button>
        </div>
      </div>
    </div>
  );
}

function ComparisonColumn({ label, item }) {
  if (!item) return null;
  return (
    <div className="comparison-card">
      <div className="comparison-title">
        <h4>{label}</h4>
        <div className="comparison-meta">
          <span className={`badge kind-${item.kind}`}>{item.kind}</span>
          <span className="muted small">{item.schemaId}</span>
        </div>
      </div>
      <p className="strong-title">{item.title || '（titleなし）'}</p>
      <div className="comparison-field">
        <span className="label">stable_key</span>
        <code>{item.stableKey || 'なし'}</code>
      </div>
      <div className="comparison-field">
        <span className="label">domain</span>
        <span>{item.domain || 'なし'}</span>
      </div>
      <div className="comparison-field">
        <span className="label">tags</span>
        <div className="tag-row">
          {item.tags?.length ? item.tags.map((t) => <TagPill key={t} label={t} />) : <span className="muted small">なし</span>}
        </div>
      </div>
      <div className="comparison-field">
        <span className="label">body</span>
        <div className="preview small-scroll">{item.body || 'なし'}</div>
      </div>
      <div className="comparison-field">
        <span className="label">payload</span>
        <pre className="preview small-scroll">{JSON.stringify(item.payload || {}, null, 2)}</pre>
      </div>
    </div>
  );
}

function ComparisonDialog({ candidate, existing, onClose }) {
  if (!candidate || !existing) return null;

  return (
    <div className="modal-backdrop">
      <div className="modal wide">
        <div className="modal-header">
          <h3>stable_key 重複確認</h3>
          <button className="ghost" onClick={onClose}>
            ×
          </button>
        </div>
        <p className="muted small">既存の Item とインポート候補を横並びで確認します。</p>
        <div className="comparison-grid">
          <ComparisonColumn label="新規（候補）" item={candidate.item} />
          <ComparisonColumn label="既存 (DB)" item={existing} />
        </div>
      </div>
    </div>
  );
}

function SpeakerManagerModal({ onClose, onRefresh }) {
  const [speakers, setSpeakers] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [formState, setFormState] = useState({ speaker_name: '', role: '', canonical_role: 'unknown' });
  const [isSaving, setIsSaving] = useState(false);

  const loadSpeakers = useCallback(async () => {
    try {
      const data = await fetchJson(`${API_BASE}/api/speakers`);
      setSpeakers(data.speakers || []);
    } catch (err) {
      console.error(err);
      showApiError(err, 'speaker の取得に失敗しました');
    }
  }, []);

  useEffect(() => {
    loadSpeakers();
  }, [loadSpeakers]);

  const handleSelect = (speaker) => {
    setSelectedId(speaker.speaker_id);
    setFormState({
      speaker_name: speaker.speaker_name || '',
      role: speaker.role || '',
      canonical_role: speaker.canonical_role || 'unknown',
    });
  };

  const handleSave = async () => {
    if (!formState.speaker_name.trim()) {
      alert('speaker_name を入力してください');
      return;
    }
    setIsSaving(true);
    const payload = {
      ...formState,
      role: formState.role?.trim() || null,
      speaker_name: formState.speaker_name.trim(),
    };
    try {
      if (selectedId) {
        await fetchJson(`${API_BASE}/api/speakers/${selectedId}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
      } else {
        await fetchJson(`${API_BASE}/api/speakers`, {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      }
      await loadSpeakers();
      onRefresh?.();
      setSelectedId(null);
      setFormState({ speaker_name: '', role: '', canonical_role: 'unknown' });
    } catch (err) {
      console.error(err);
      showApiError(err, 'speaker の保存に失敗しました');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedId) return;
    if (!window.confirm('speaker を削除しますか？')) return;
    try {
      await fetchJson(`${API_BASE}/api/speakers/${selectedId}`, { method: 'DELETE' });
      await loadSpeakers();
      onRefresh?.();
      setSelectedId(null);
      setFormState({ speaker_name: '', role: '', canonical_role: 'unknown' });
    } catch (err) {
      console.error(err);
      showApiError(err, 'speaker の削除に失敗しました');
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Speaker マスタ</h3>
          <button className="ghost" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="modal-body speaker-grid">
          <div className="modal-list">
            {speakers.length ? (
              speakers.map((speaker) => (
                <button
                  key={speaker.speaker_id}
                  className={`list-row ${selectedId === speaker.speaker_id ? 'active' : ''}`}
                  onClick={() => handleSelect(speaker)}
                >
                  <span className="badge subtle">{speaker.canonical_role}</span>
                  <span>{speaker.speaker_name}</span>
                </button>
              ))
            ) : (
              <div className="muted small speaker-empty">speaker が登録されていません。</div>
            )}
          </div>
          <div className="speaker-form">
            <label>
              speaker_name
              <input
                type="text"
                value={formState.speaker_name}
                onChange={(e) => setFormState({ ...formState, speaker_name: e.target.value })}
              />
            </label>
            <label>
              role
              <input
                type="text"
                value={formState.role}
                onChange={(e) => setFormState({ ...formState, role: e.target.value })}
                placeholder="free-form"
              />
            </label>
            <label>
              canonical_role
              <select
                value={formState.canonical_role}
                onChange={(e) => setFormState({ ...formState, canonical_role: e.target.value })}
              >
                {['human', 'ai', 'system', 'unknown'].map((role) => (
                  <option key={role} value={role}>
                    {role}
                  </option>
                ))}
              </select>
            </label>
            <div className="actions">
              <button className="primary" onClick={handleSave} disabled={isSaving}>
                {selectedId ? '更新' : '追加'}
              </button>
              <button className="ghost" onClick={() => setFormState({ speaker_name: '', role: '', canonical_role: 'unknown' })}>
                クリア
              </button>
              <button className="ghost danger" onClick={handleDelete} disabled={!selectedId}>
                削除
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function InputJsonGenerator({ onClose }) {
  const [rawText, setRawText] = useState('');
  const [outputText, setOutputText] = useState('');
  const [messagesCount, setMessagesCount] = useState(0);
  const [speakers, setSpeakers] = useState([]);
  const [showSpeakerModal, setShowSpeakerModal] = useState(false);

  const loadSpeakers = useCallback(async () => {
    try {
      const data = await fetchJson(`${API_BASE}/api/speakers`);
      setSpeakers(data.speakers || []);
    } catch (err) {
      console.error(err);
      showApiError(err, 'speaker の取得に失敗しました');
    }
  }, []);

  useEffect(() => {
    loadSpeakers();
  }, [loadSpeakers]);

  const parseRawText = () => {
    if (!rawText.trim()) {
      alert('生テキストを入力してください');
      return;
    }
    const speakerMap = new Map(speakers.map((speaker) => [speaker.speaker_name, speaker]));
    const speakerNames = new Set(speakers.map((speaker) => speaker.speaker_name));
    const lines = rawText.split(/\r?\n/);
    const messages = [];
    let currentSpeaker = null;
    let currentLines = [];

    const flushMessage = () => {
      if (!currentSpeaker) return;
      const content = currentLines.join('\n');
      messages.push({ speaker: currentSpeaker, content });
    };

    const matchSpeakerLine = (line) => {
      if (!line) return null;
      if (speakerNames.has(line)) return line;
      const trimmed = line.replace(/[:：]$/, '');
      if (trimmed !== line && speakerNames.has(trimmed)) {
        return trimmed;
      }
      return null;
    };

    lines.forEach((line) => {
      const trimmed = line.trim();
      const matched = matchSpeakerLine(trimmed);
      if (matched) {
        flushMessage();
        currentSpeaker = matched;
        currentLines = [];
      } else if (currentSpeaker) {
        currentLines.push(line);
      }
    });
    flushMessage();

    const chunkSize = 14;
    const chunks = [];
    for (let i = 0; i < messages.length; i += chunkSize) {
      const chunkTmpId = chunks.length + 1;
      const chunkMessages = messages.slice(i, i + chunkSize).map((msg, index) => {
        const speakerData = speakerMap.get(msg.speaker);
        return {
          message_id: `${chunkTmpId}:${index + 1}`,
          speaker: msg.speaker,
          role: speakerData?.role ? speakerData.role : null,
          canonical_role: speakerData?.canonical_role || 'unknown',
          content: msg.content,
        };
      });
      chunks.push({ chunk_tmp_id: chunkTmpId, messages: chunkMessages });
    }

    const outputJson = {
      input_version: '1.0',
      chunks,
    };
    setMessagesCount(messages.length);
    setOutputText(JSON.stringify(outputJson, null, 2));
  };

  const downloadJson = () => {
    if (!outputText) {
      alert('先に入力 JSON を生成してください');
      return;
    }
    const blob = new Blob([outputText], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'input.json';
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="panel">
      <div className="panel-header">
        <div>
          <h2>入力JSON生成</h2>
          <p className="muted">生テキストから入力 JSON (v1.0) を生成します。</p>
        </div>
        <div className="actions">
          <button className="ghost" onClick={() => setShowSpeakerModal(true)}>
            speaker マスタ
          </button>
          <button className="ghost" onClick={onClose}>
            閉じる
          </button>
        </div>
      </div>

      <div className="generator-grid">
        <div>
          <h4>生テキスト</h4>
          <textarea
            rows={12}
            placeholder="[speaker] または [speaker]： の行で区切ります"
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
          />
          <div className="actions">
            <button className="primary" onClick={parseRawText}>
              入力 JSON を生成
            </button>
            <button className="ghost" onClick={downloadJson}>
              JSON をダウンロード
            </button>
            {messagesCount > 0 && <span className="muted small">{messagesCount} messages</span>}
          </div>
        </div>
        <div>
          <h4>生成結果</h4>
          <textarea rows={12} readOnly value={outputText} placeholder="生成結果がここに表示されます。" />
        </div>
      </div>

      {showSpeakerModal && (
        <SpeakerManagerModal
          onClose={() => setShowSpeakerModal(false)}
          onRefresh={loadSpeakers}
        />
      )}
    </div>
  );
}

function CandidateEditModal({ candidate, onClose, onChange }) {
  if (!candidate) return null;
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h3>候補編集</h3>
            <p className="muted small">{candidate.item?.title || '（titleなし）'}</p>
          </div>
          <button className="ghost" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="modal-body">
          <ItemForm
            value={candidate.item}
            onChange={onChange}
            stableKeySuggested={candidate.item?.stableKeySuggested}
          />
        </div>
      </div>
    </div>
  );
}

function MessageDrawer({ title, messages, onClose }) {
  if (!messages) return null;
  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <div className="drawer" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-header">
          <h3>{title}</h3>
          <button className="ghost" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="drawer-body">
          {messages.length ? (
            messages.map((msg, idx) => (
              <div key={msg.message_id || idx} className="message-block">
                <div className="message-speaker">
                  <strong>{msg.speaker || msg.role || 'unknown'}</strong>
                </div>
                <pre className="message-content">{msg.content}</pre>
              </div>
            ))
          ) : (
            <p className="muted">messages がありません。</p>
          )}
        </div>
      </div>
    </div>
  );
}

function ImportWizard({ onClose }) {
  const [extractionRawJson, setExtractionRawJson] = useState('');
  const [inputRawJson, setInputRawJson] = useState('');
  const [candidates, setCandidates] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [jobId, setJobId] = useState(null);
  const [isLoadingJob, setIsLoadingJob] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);
  const [stableKeyMatches, setStableKeyMatches] = useState({});
  const [comparison, setComparison] = useState(null);
  const [chunks, setChunks] = useState([]);
  const [selectedChunkIndex, setSelectedChunkIndex] = useState(0);
  const [messageDrawerData, setMessageDrawerData] = useState(null);
  const [inputChunksMap, setInputChunksMap] = useState({});
  const [showEditModal, setShowEditModal] = useState(false);

  const selected = candidates.find((c) => c.candidateId === selectedId);

  const mapCandidateFromApi = (cand) => {
    const item = cand.item || {};
    return {
      candidateId: cand.candidate_id,
      keep: cand.decision !== 'SKIP',
      skipType: cand.skip_type || 'NONE',
      reason: cand.reason || '',
      chunkIndex: item._chunk_index ?? item.chunk_index ?? 0,
      item: {
        id: item.item_id || item.id || '',
        kind: item.kind || 'knowledge',
        schemaId: item.schema_id || '',
        title: item.title || '',
        body: item.body || '',
        domain: item.domain || '',
        tags: normalizeTags(item.tags),
        confidence: item.confidence ?? 0,
        payload: item.payload || {},
        payloadText: JSON.stringify(item.payload || {}, null, 2),
        evidence: item.evidence || {},
        stableKey: item.stable_key || '',
        stableKeySuggested: item.stable_key_suggested || '',
        links: item.links || [],
      },
    };
  };

  const loadJob = async (id) => {
    setIsLoadingJob(true);
    setComparison(null);
    setStableKeyMatches({});
    setMessageDrawerData(null);
    try {
      const data = await fetchJson(`${API_BASE}/api/import/jobs/${id}`);
      const mapped = (data.candidates || []).map((c) => mapCandidateFromApi(c));
      const source = data.job?.source || {};
      const sourceChunks = Array.isArray(source.chunks) ? source.chunks : [{ source }];
      const chunkCandidates = mapped.reduce((acc, cand) => {
        const index = cand.chunkIndex || 0;
        acc[index] = acc[index] || [];
        acc[index].push(cand);
        return acc;
      }, {});
      const mappedChunks = sourceChunks.map((chunk, index) => {
        const chunkTmpId = chunk.chunk_tmp_id ?? chunk.chunks_tmp_id ?? chunk.chunk_id ?? index + 1;
        return {
          index,
          chunkTmpId: String(chunkTmpId),
          source: chunk.source || {},
          classification: chunk.classification || {},
          itemsCount: chunkCandidates[index]?.length || 0,
        };
      });
      const matches = {};
      Object.entries(data.stable_key_matches || {}).forEach(([key, raw]) => {
        const display = toDisplayItem(raw);
        if (display) matches[key] = display;
      });
      setStableKeyMatches(matches);
      setCandidates(mapped);
      setChunks(mappedChunks);
      const initialChunkIndex = mappedChunks[0]?.index || 0;
      setSelectedChunkIndex(initialChunkIndex);
      const firstCandidate = mapped.find((c) => c.chunkIndex === initialChunkIndex);
      setSelectedId(firstCandidate?.candidateId || null);
    } catch (err) {
      console.error(err);
      showApiError(err, 'インポートジョブの取得に失敗しました');
    } finally {
      setIsLoadingJob(false);
    }
  };

  useEffect(() => {
    const chunkCandidates = candidates.filter((c) => c.chunkIndex === selectedChunkIndex);
    if (!chunkCandidates.find((c) => c.candidateId === selectedId)) {
      setSelectedId(chunkCandidates[0]?.candidateId || null);
    }
  }, [selectedChunkIndex, candidates, selectedId]);

  const startImport = async () => {
    if (!extractionRawJson.trim()) {
      alert('抽出 JSON を貼り付けてください');
      return;
    }
    let parsed;
    try {
      parsed = JSON.parse(extractionRawJson);
    } catch (err) {
      alert('抽出 JSON のパースに失敗しました');
      return;
    }
    if (inputRawJson.trim()) {
      try {
        const parsedInput = JSON.parse(inputRawJson);
        const inputChunks = Array.isArray(parsedInput.chunks) ? parsedInput.chunks : [];
        const mappedInputChunks = {};
        inputChunks.forEach((chunk) => {
          const chunkTmpId = chunk.chunk_tmp_id ?? chunk.chunks_tmp_id ?? chunk.chunk_id;
          if (chunkTmpId != null) {
            mappedInputChunks[String(chunkTmpId)] = chunk;
          }
        });
        setInputChunksMap(mappedInputChunks);
      } catch (err) {
        alert('入力 JSON のパースに失敗しました');
        return;
      }
    } else {
      setInputChunksMap({});
    }
    const extraction = parsed.extraction || parsed;
    try {
      const res = await fetchJson(`${API_BASE}/api/import/jobs`, {
        method: 'POST',
        body: JSON.stringify({ extraction }),
      });
      setJobId(res.job_id);
      await loadJob(res.job_id);
    } catch (err) {
      console.error(err);
      showApiError(err, 'インポートジョブの作成に失敗しました');
    }
  };

  const persistCandidate = async (candidate) => {
    if (!jobId) return;
    let payloadObj = candidate.item.payload || {};
    if (candidate.item.payloadText) {
      try {
        payloadObj = JSON.parse(candidate.item.payloadText || '{}');
      } catch (err) {
        alert('payload の JSON が正しくありません');
        return;
      }
    }

    const itemPayload = {
      item_id: candidate.item.id || undefined,
      _chunk_index: candidate.chunkIndex ?? 0,
      stable_key: candidate.item.stableKey || null,
      kind: candidate.item.kind,
      schema_id: candidate.item.schemaId,
      title: candidate.item.title,
      body: candidate.item.body,
      domain: candidate.item.domain || null,
      tags: (candidate.item.tags || [])
        .map((name) => ({ name: typeof name === 'string' ? name : name?.name || '' }))
        .filter((t) => t.name),
      evidence: candidate.item.evidence || {},
      payload: payloadObj,
      confidence: candidate.item.confidence ?? 0,
      links: candidate.item.links || [],
      stable_key_suggested: candidate.item.stableKeySuggested || undefined,
    };

    try {
      await fetchJson(`${API_BASE}/api/import/jobs/${jobId}/candidates/${candidate.candidateId}`, {
        method: 'PUT',
        body: JSON.stringify({
          decision: candidate.keep ? 'KEEP' : 'SKIP',
          skip_type: candidate.skipType || 'NONE',
          reason: candidate.reason || '',
          item: itemPayload,
        }),
      });
      setCandidates((prev) =>
        prev.map((c) =>
          c.candidateId === candidate.candidateId
            ? { ...candidate, item: { ...candidate.item, payload: payloadObj, payloadText: JSON.stringify(payloadObj, null, 2) } }
            : c,
        ),
      );
    } catch (err) {
      console.error(err);
      showApiError(err, '候補の更新に失敗しました');
    }
  };

  const updateCandidateItem = (candidateId, itemUpdate) => {
    setCandidates((prev) => {
      const next = prev.map((c) => (c.candidateId === candidateId ? { ...c, item: { ...c.item, ...itemUpdate } } : c));
      const updated = next.find((c) => c.candidateId === candidateId);
      if (updated) persistCandidate(updated);
      return next;
    });
  };

  const toggleKeep = (candidateId) => {
    setCandidates((prev) => {
      const next = prev.map((c) => (c.candidateId === candidateId ? { ...c, keep: !c.keep } : c));
      const updated = next.find((c) => c.candidateId === candidateId);
      if (updated) persistCandidate(updated);
      return next;
    });
  };

  const commit = async () => {
    if (!jobId) {
      alert('先に抽出 JSON を読み込んでください');
      return;
    }
    setIsCommitting(true);
    try {
      const res = await fetchJson(`${API_BASE}/api/import/jobs/${jobId}/commit`, { method: 'POST' });
      alert(
        `コミット完了: inserted ${res.inserted}, updated ${res.updated}, skipped ${res.skipped}, links ${res.links_created}`,
      );
    } catch (err) {
      console.error(err);
      showApiError(err, 'コミットに失敗しました');
    } finally {
      setIsCommitting(false);
    }
  };

  const selectedChunk = chunks.find((chunk) => chunk.index === selectedChunkIndex) || null;
  const chunkCandidates = useMemo(
    () => candidates.filter((cand) => cand.chunkIndex === selectedChunkIndex),
    [candidates, selectedChunkIndex],
  );
  const resolveMessagesForChunk = (chunk) => {
    if (!chunk) return [];
    return inputChunksMap[chunk.chunkTmpId]?.messages || [];
  };

  return (
    <>
      <div className="panel">
        <div className="panel-header">
          <div>
            <h2>Import Wizard</h2>
            <p className="muted small">抽出 JSON の貼り付け、候補レビュー、コミットまでを行います。</p>
          </div>
          <button className="ghost" onClick={onClose}>
            閉じる
          </button>
        </div>

        <div className="import-layout">
          <div className="import-left">
            <Collapsible title="入力 JSON (v1.0)" defaultOpen={true}>
              <textarea
                rows={6}
                placeholder="入力 JSON を貼り付けてください。"
                value={inputRawJson}
                onChange={(e) => setInputRawJson(e.target.value)}
              />
            </Collapsible>
            <Collapsible title="抽出 JSON (v2.4)" defaultOpen={true}>
              <textarea
                rows={6}
                placeholder="抽出 JSON を貼り付け、またはファイルから読み込みます。"
                value={extractionRawJson}
                onChange={(e) => setExtractionRawJson(e.target.value)}
              />
              <div className="muted small">※ ファイル読み込みは未実装（MVP）。</div>
              <div className="actions">
                <button className="primary" onClick={startImport}>JSON を読み込む</button>
                {isLoadingJob && <span className="muted small">読み込み中...</span>}
              </div>
            </Collapsible>

            {jobId && <div className="muted small">job_id: {jobId}</div>}

            <h4>chunks</h4>
            <div className="chunk-list">
              {chunks.map((chunk) => (
                <div
                  key={chunk.index}
                  className={`chunk-card ${selectedChunkIndex === chunk.index ? 'active' : ''}`}
                >
                  <div className="chunk-header">
                    <div className="left">
                      <span className={`badge ${chunk.classification?.decision === 'SKIP' ? 'skip' : 'keep'}`}>
                        {chunk.classification?.decision || 'KEEP'}
                      </span>
                      <strong>Chunk {chunk.index + 1}</strong>
                      <span className="muted small">tmp_id {chunk.chunkTmpId}</span>
                    </div>
                    <span className="muted small">{chunk.itemsCount} items</span>
                  </div>
                  <div className="chunk-meta">
                    <div>
                      <span className="label">skip_type</span>
                      <span>{chunk.classification?.skip_type || 'NONE'}</span>
                    </div>
                    <div>
                      <span className="label">confidence</span>
                      <span>{((chunk.classification?.confidence || 0) * 100).toFixed(0)}%</span>
                    </div>
                  </div>
                  <p className="muted small">{chunk.classification?.reason || 'reason なし'}</p>
                  <p className="muted small">{chunk.source?.hint || 'hint なし'}</p>
                  <div className="candidate-actions">
                    <button className="ghost tiny" onClick={() => setSelectedChunkIndex(chunk.index)}>
                      選択して編集
                    </button>
                    <button
                      className="ghost tiny"
                      onClick={() =>
                        setMessageDrawerData({
                          title: `chunk_tmp_id ${chunk.chunkTmpId} messages`,
                          messages: resolveMessagesForChunk(chunk),
                        })
                      }
                    >
                      メッセージ表示
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="import-right">
            <h4>items</h4>
            <div className="item-list">
              {chunkCandidates.map((c) => (
                <div key={c.candidateId} className={`item-card ${selectedId === c.candidateId ? 'active' : ''}`}>
                  <div className="candidate-header">
                    <div className="left">
                      <button className={`pill-toggle ${c.keep ? 'keep' : 'skip'}`} onClick={() => toggleKeep(c.candidateId)}>
                        {c.keep ? '✅ KEEP' : '❌ SKIP'}
                      </button>
                      <span className="badge subtle">{c.item.kind}</span>
                      <strong>{c.item.title || '（titleなし）'}</strong>
                    </div>
                    <span className="muted small">confidence {(c.item.confidence * 100).toFixed(0)}%</span>
                  </div>
                  <div className="item-meta">
                    <div>
                      <span className="label">stable_key</span>
                      <span>{c.item.stableKey || 'なし'}</span>
                    </div>
                    <div>
                      <span className="label">domain</span>
                      <span>{c.item.domain || 'なし'}</span>
                    </div>
                  </div>
                  <p className="muted small preview-lines">{c.item.body}</p>
                  <div className="candidate-actions">
                    <button className="ghost tiny" onClick={() => setSelectedId(c.candidateId)}>
                      選択して編集
                    </button>
                    {c.item.stableKey && stableKeyMatches[c.item.stableKey] && (
                      <button
                        className="ghost tiny"
                        onClick={() =>
                          setComparison({ candidate: c, existing: stableKeyMatches[c.item.stableKey] })
                        }
                      >
                        DBと比較
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <h4>候補編集</h4>
            {selected ? (
              <div className="actions">
                <button className="primary" onClick={() => setShowEditModal(true)}>
                  候補を編集
                </button>
              </div>
            ) : (
              <p className="muted">候補を選択してください。</p>
            )}
            <div className="actions">
              <button className="primary" onClick={commit} disabled={!jobId || isCommitting}>
                commit
              </button>
              <button className="ghost" onClick={onClose}>
                破棄して閉じる
              </button>
            </div>
          </div>
        </div>
      </div>
      {comparison && (
        <ComparisonDialog
          candidate={comparison.candidate}
          existing={comparison.existing}
          onClose={() => setComparison(null)}
        />
      )}
      {messageDrawerData && (
        <MessageDrawer
          title={messageDrawerData.title}
          messages={messageDrawerData.messages}
          onClose={() => setMessageDrawerData(null)}
        />
      )}
      {showEditModal && selected && (
        <CandidateEditModal
          candidate={selected}
          onClose={() => setShowEditModal(false)}
          onChange={(val) => updateCandidateItem(selected.candidateId, val)}
        />
      )}
    </>
  );
}

export default function App() {
  const [items, setItems] = useState([]);
  const [view, setView] = useState('search');
  const [selectedItem, setSelectedItem] = useState(null);
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [searchFilters, setSearchFilters] = useState(null);
  const [isLoadingSearch, setIsLoadingSearch] = useState(false);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);

  const fetchSearchResults = useCallback(
    async (filters) => {
      setIsLoadingSearch(true);
      try {
        const params = new URLSearchParams();
        if (filters?.search) params.set('q', filters.search);
        if (filters?.selectedKinds?.length) params.set('kinds', filters.selectedKinds.join(','));
        if (filters?.domain) params.set('domain', filters.domain);
        if (filters?.tagFilter?.trim())
          params.set(
            'tags',
            filters.tagFilter
              .split(',')
              .map((t) => t.trim())
              .filter(Boolean)
              .join(','),
          );
        if (filters?.sortBy) params.set('sort', filters.sortBy);
        params.set('limit', String(filters?.pageSize || 20));

        const data = await fetchJson(`${API_BASE}/api/search?${params.toString()}`);
        setItems((data.items || []).map((item) => toDisplayItem(item)).filter(Boolean));
      } catch (err) {
        console.error(err);
        showApiError(err, '検索結果の取得に失敗しました');
      } finally {
        setIsLoadingSearch(false);
      }
    },
    [],
  );

  const handleFiltersChange = useCallback((filters) => {
    setSearchFilters(filters);
  }, []);

  useEffect(() => {
    if (searchFilters) {
      fetchSearchResults(searchFilters);
    }
  }, [searchFilters, fetchSearchResults]);

  const loadItemDetail = useCallback(async (itemId) => {
    const data = await fetchJson(`${API_BASE}/api/items/${itemId}`);
    const detail = toDisplayItem({ ...data.item, tags: data.item?.tags });
    detail.links = { ...emptyLinks };
    try {
      const links = await fetchJson(`${API_BASE}/api/items/${itemId}/links`);
      const grouped = { ...emptyLinks };
      (links.links || []).forEach((link) => {
        const rel = link.rel || 'related';
        if (!grouped[rel]) grouped[rel] = [];
        grouped[rel].push(link.target_key);
      });
      detail.links = grouped;
    } catch (err) {
      console.warn('links fetch failed', err);
    }
    return detail;
  }, []);

  const openDetail = async (item) => {
    setSelectedItem(item);
    setView('detail');
    setIsLoadingDetail(true);
    try {
      const full = await loadItemDetail(item.id);
      setSelectedItem(full);
    } catch (err) {
      console.error(err);
      showApiError(err, '詳細の取得に失敗しました');
    } finally {
      setIsLoadingDetail(false);
    }
  };

  const openNewItem = () => {
    const now = new Date().toISOString().slice(0, 10);
    setSelectedItem({
      id: null,
      kind: 'knowledge',
      schemaId: '',
      title: '',
      domain: '',
      tags: [],
      updatedAt: now,
      createdAt: now,
      confidence: 0.5,
      body: '',
      payload: {},
      evidence: {},
      links: { ...emptyLinks },
      stableKey: '',
      stableKeySuggested: 'new/item/stable-key',
    });
    setView('edit');
  };

  const persistItem = async (draft) => {
    const payload = toRequestPayload(draft);
    if (!draft.id) {
      payload.source_type = 'manual';
    }
    if (draft.id) {
      await fetchJson(`${API_BASE}/api/items/${draft.id}`,
        { method: 'PUT', body: JSON.stringify(payload) });
      return draft.id;
    }
    const res = await fetchJson(`${API_BASE}/api/items`, { method: 'POST', body: JSON.stringify(payload) });
    return res.item_id;
  };

  const refreshSearch = useCallback(() => {
    if (searchFilters) fetchSearchResults(searchFilters);
  }, [fetchSearchResults, searchFilters]);

  const handleSave = async (updated) => {
    try {
      const itemId = await persistItem(updated);
      const detail = await loadItemDetail(itemId);
      setSelectedItem(detail);
      setView('edit');
      refreshSearch();
    } catch (err) {
      console.error(err);
      showApiError(err, '保存に失敗しました');
    }
  };

  const handleSaveAndClose = async (updated) => {
    try {
      const itemId = await persistItem(updated);
      const detail = await loadItemDetail(itemId);
      setSelectedItem(detail);
      setView('detail');
      refreshSearch();
    } catch (err) {
      console.error(err);
      showApiError(err, '保存に失敗しました');
    }
  };

  const handleModelize = async () => {
    if (!selectedItem) return;
    const modelDraft = {
      ...selectedItem,
      id: null,
      kind: 'model',
      schemaId: 'model/hypothesis',
      title: '',
      payload: {},
      links: {
        ...selectedItem.links,
        born_from: [...(selectedItem.links?.born_from || []), selectedItem.id].filter(Boolean),
      },
    };
    setSelectedItem(modelDraft);
    setView('edit');
  };

  const addLink = async ({ rel, targetId }) => {
    if (!selectedItem) return;
    try {
      await fetchJson(`${API_BASE}/api/items/${selectedItem.id}/links`, {
        method: 'POST',
        body: JSON.stringify({ rel, target_item_id: targetId }),
      });
      const detail = await loadItemDetail(selectedItem.id);
      setSelectedItem(detail);
      refreshSearch();
      setShowLinkModal(false);
    } catch (err) {
      console.error(err);
      showApiError(err, 'リンクの追加に失敗しました');
    }
  };

  const handleClone = async () => {
    if (!selectedItem) return;
    try {
      const today = new Date().toISOString().slice(0, 10);
      const cloneDraft = { ...selectedItem, id: null, stableKey: '', createdAt: today, updatedAt: today };
      const itemId = await persistItem(cloneDraft);
      const detail = await loadItemDetail(itemId);
      setSelectedItem(detail);
      setView('detail');
      refreshSearch();
      alert('複製しました');
    } catch (err) {
      console.error(err);
      showApiError(err, '複製に失敗しました');
    }
  };

  const handleDelete = async () => {
    if (!selectedItem) return;
    if (!window.confirm('本当に削除しますか？')) return;
    try {
      await fetchJson(`${API_BASE}/api/items/${selectedItem.id}`, { method: 'DELETE' });
      setSelectedItem(null);
      setView('search');
      refreshSearch();
    } catch (err) {
      console.error(err);
      showApiError(err, '削除に失敗しました');
    }
  };

  return (
    <div className="app-shell">
      <header>
        <h1>Tool Dictionary Report</h1>
        <p className="muted">画面マップ v1.0 に沿った最小 UI プロトタイプです。</p>
      </header>

      {view === 'search' && (
        <SearchView
          items={items}
          onOpenDetail={openDetail}
          onCreateItem={openNewItem}
          onOpenImport={() => setView('import')}
          onOpenInputGenerator={() => setView('input-generator')}
          onFiltersChange={handleFiltersChange}
          isLoading={isLoadingSearch}
        />
      )}
      {view === 'detail' && selectedItem && (
        <ItemDetail
          item={selectedItem}
          onBack={() => setView('search')}
          onEdit={() => setView('edit')}
          onAddLink={() => setShowLinkModal(true)}
          onModelize={handleModelize}
          onClone={handleClone}
          onDelete={handleDelete}
          isLoading={isLoadingDetail}
        />
      )}
      {view === 'edit' && selectedItem && (
        <EditView
          item={selectedItem}
          onSave={(val) => handleSave(val)}
          onSaveAndClose={(val) => handleSaveAndClose(val)}
          onCancel={() => setView(selectedItem.body ? 'detail' : 'search')}
        />
      )}
      {view === 'import' && <ImportWizard onClose={() => setView('search')} />}
      {view === 'input-generator' && <InputJsonGenerator onClose={() => setView('search')} />}

      {showLinkModal && selectedItem && (
        <LinkModal
          currentItem={selectedItem}
          items={items}
          onClose={() => setShowLinkModal(false)}
          onAdd={addLink}
        />
      )}
    </div>
  );
}