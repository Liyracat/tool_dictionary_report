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
const schemaOptionsByKind = {
  knowledge: ['knowledge/fact.v1', 'knowledge/howto.v1', 'knowledge/definition.v1', 'knowledge/rule_of_thumb.v1'],
  value: ['value/state.v1'],
  summary: ['summary/discussion.v1', 'summary/compare.v1'],
  model: ['model/hypothesis.v1', 'model/structure.v1'],
  decision: ['decision/core.v1'],
  term: ['term/glossary.v1'],
  correction: ['correction/update.v1'],
};
const payloadSchemaConfig = {
  'knowledge/fact.v1': [
    { key: 'notes', label: 'notes', type: 'string' },
    { key: 'caveats', label: 'caveats', type: 'stringList' },
  ],
  'knowledge/howto.v1': [
    {
      key: 'steps',
      label: 'steps',
      type: 'objectList',
      fields: [
        { key: 'n', label: 'n', type: 'number' },
        { key: 'text', label: 'text', type: 'string' },
      ],
    },
    { key: 'prerequisites', label: 'prerequisites', type: 'stringList' },
    { key: 'pitfalls', label: 'pitfalls', type: 'stringList' },
    { key: 'variants', label: 'variants', type: 'stringList' },
  ],
  'knowledge/definition.v1': [
    { key: 'term', label: 'term', type: 'string' },
    { key: 'definition', label: 'definition', type: 'string' },
    { key: 'synonyms', label: 'synonyms', type: 'stringList' },
    { key: 'anti_examples', label: 'anti_examples', type: 'stringList' },
  ],
  'knowledge/rule_of_thumb.v1': [
    { key: 'rule', label: 'rule', type: 'string' },
    { key: 'when_applies', label: 'when_applies', type: 'stringList' },
    { key: 'exceptions', label: 'exceptions', type: 'stringList' },
  ],
  'value/state.v1': [
    { key: 'scope', label: 'scope', type: 'string' },
    { key: 'stance', label: 'stance', type: 'string' },
    { key: 'rationale', label: 'rationale', type: 'stringList' },
    { key: 'boundaries', label: 'boundaries', type: 'stringList' },
    { key: 'updated_reason', label: 'updated_reason', type: 'string' },
  ],
  'summary/discussion.v1': [
    { key: 'context', label: 'context', type: 'string' },
    { key: 'points', label: 'points', type: 'stringList' },
    { key: 'conclusion', label: 'conclusion', type: 'string' },
    { key: 'open_questions', label: 'open_questions', type: 'stringList' },
  ],
  'summary/compare.v1': [
    {
      key: 'compared',
      label: 'compared',
      type: 'objectList',
      fields: [
        { key: 'option', label: 'option', type: 'string' },
        { key: 'pros', label: 'pros', type: 'stringList' },
        { key: 'cons', label: 'cons', type: 'stringList' },
      ],
    },
    { key: 'conclusion', label: 'conclusion', type: 'string' },
  ],
  'model/hypothesis.v1': [
    { key: 'hypothesis', label: 'hypothesis', type: 'string' },
    { key: 'assumptions', label: 'assumptions', type: 'stringList' },
    { key: 'implications', label: 'implications', type: 'stringList' },
    { key: 'falsifiers', label: 'falsifiers', type: 'stringList' },
  ],
  'model/structure.v1': [
    {
      key: 'entities',
      label: 'entities',
      type: 'objectList',
      fields: [
        { key: 'name', label: 'name', type: 'string' },
        { key: 'type', label: 'type', type: 'string' },
        { key: 'note', label: 'note', type: 'string' },
      ],
    },
    {
      key: 'relations',
      label: 'relations',
      type: 'objectList',
      fields: [
        { key: 'from', label: 'from', type: 'string' },
        { key: 'to', label: 'to', type: 'string' },
        { key: 'type', label: 'type', type: 'string' },
        { key: 'note', label: 'note', type: 'string' },
      ],
    },
    { key: 'assumptions', label: 'assumptions', type: 'stringList' },
  ],
  'decision/core.v1': [
    { key: 'decision', label: 'decision', type: 'string' },
    { key: 'options', label: 'options', type: 'stringList' },
    { key: 'reasons', label: 'reasons', type: 'stringList' },
    { key: 'time_hint', label: 'time_hint', type: 'string' },
    {
      key: 'impact_scope',
      label: 'impact_scope',
      type: 'stringList',
      options: ['仕事', '創作', '生活', '対人', '健康', 'その他'],
    },
  ],
  'term/glossary.v1': [
    { key: 'term', label: 'term', type: 'string' },
    { key: 'meaning', label: 'meaning', type: 'string' },
    { key: 'examples', label: 'examples', type: 'stringList' },
    { key: 'related_terms', label: 'related_terms', type: 'stringList' },
  ],
  'correction/update.v1': [
    { key: 'what_changed', label: 'what_changed', type: 'string' },
    { key: 'previous_view', label: 'previous_view', type: 'string' },
    { key: 'new_view', label: 'new_view', type: 'string' },
    { key: 'why', label: 'why', type: 'string' },
  ],
};

const buildDefaultPayload = (schemaId) => {
  const config = payloadSchemaConfig[schemaId] || [];
  return config.reduce((acc, field) => {
    if (field.type === 'string' || field.type === 'number') {
      acc[field.key] = '';
    } else if (field.type === 'stringList' || field.type === 'objectList') {
      acc[field.key] = [];
    }
    return acc;
  }, {});
};

const coerceContentLines = (content) => {
  if (Array.isArray(content)) return content;
  if (content == null) return [];
  return String(content).split(/\r?\n/);
};

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

function StringListInput({ label, value = [], onChange, options }) {
  const entries = value.length ? value : [''];
  const updateEntry = (index, nextValue) => {
    const next = [...entries];
    next[index] = nextValue;
    onChange(next.filter((item) => item !== ''));
  };
  const addEntry = () => onChange([...value, '']);
  const removeEntry = (index) => {
    const next = [...value];
    next.splice(index, 1);
    onChange(next);
  };

  return (
    <div className="field-group">
      <span className="label">{label}</span>
      <div className="list-input">
        {entries.map((entry, index) => (
          <div key={`${label}-${index}`} className="list-row">
            {options ? (
              <select value={entry} onChange={(e) => updateEntry(index, e.target.value)}>
                <option value="">未選択</option>
                {options.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            ) : (
              <input type="text" value={entry} onChange={(e) => updateEntry(index, e.target.value)} />
            )}
            <button className="ghost tiny" type="button" onClick={() => removeEntry(index)}>
              削除
            </button>
          </div>
        ))}
      </div>
      <button className="ghost tiny" type="button" onClick={addEntry}>
        + 追加
      </button>
    </div>
  );
}

function ObjectListInput({ label, value = [], fields, onChange }) {
  const addEntry = () => {
    const next = [
      ...value,
      fields.reduce((acc, field) => {
        acc[field.key] = field.type === 'stringList' ? [] : '';
        return acc;
      }, {}),
    ];
    onChange(next);
  };
  const updateEntry = (index, key, nextValue) => {
    const next = value.map((entry, entryIndex) =>
      entryIndex === index ? { ...entry, [key]: nextValue } : entry,
    );
    onChange(next);
  };
  const removeEntry = (index) => {
    const next = [...value];
    next.splice(index, 1);
    onChange(next);
  };

  return (
    <div className="field-group">
      <span className="label">{label}</span>
      <div className="object-list">
        {value.map((entry, index) => (
          <div key={`${label}-${index}`} className="object-card">
            {fields.map((field) => (
              <div key={field.key} className="object-field">
                <span className="label">{field.label}</span>
                {field.type === 'stringList' ? (
                  <StringListInput
                    label=""
                    value={entry[field.key] || []}
                    onChange={(nextValue) => updateEntry(index, field.key, nextValue)}
                  />
                ) : (
                  <input
                    type={field.type === 'number' ? 'number' : 'text'}
                    value={entry[field.key] || ''}
                    onChange={(e) => updateEntry(index, field.key, e.target.value)}
                  />
                )}
              </div>
            ))}
            <button className="ghost tiny danger" type="button" onClick={() => removeEntry(index)}>
              行を削除
            </button>
          </div>
        ))}
      </div>
      <button className="ghost tiny" type="button" onClick={addEntry}>
        + 行を追加
      </button>
    </div>
  );
}

function PayloadEditor({ schemaId, value, onChange }) {
  const config = payloadSchemaConfig[schemaId] || [];
  if (!schemaId) {
    return <p className="muted small">schema_id を選択すると payload 入力フォームが表示されます。</p>;
  }
  if (!config.length) {
    return <p className="muted small">この schema_id の payload 定義はありません。</p>;
  }

  const updateField = (key, nextValue) => {
    onChange({ ...value, [key]: nextValue });
  };

  return (
    <div className="payload-grid">
      {config.map((field) => {
        if (field.type === 'string') {
          return (
            <label key={field.key} className="full">
              {field.label}
              <input
                type="text"
                value={value?.[field.key] || ''}
                onChange={(e) => updateField(field.key, e.target.value)}
              />
            </label>
          );
        }
        if (field.type === 'number') {
          return (
            <label key={field.key}>
              {field.label}
              <input
                type="number"
                value={value?.[field.key] || ''}
                onChange={(e) => updateField(field.key, Number(e.target.value))}
              />
            </label>
          );
        }
        if (field.type === 'stringList') {
          return (
            <StringListInput
              key={field.key}
              label={field.label}
              value={value?.[field.key] || []}
              options={field.options}
              onChange={(nextValue) => updateField(field.key, nextValue)}
            />
          );
        }
        if (field.type === 'objectList') {
          return (
            <ObjectListInput
              key={field.key}
              label={field.label}
              value={value?.[field.key] || []}
              fields={field.fields || []}
              onChange={(nextValue) => updateField(field.key, nextValue)}
            />
          );
        }
        return null;
      })}
    </div>
  );
}

function PayloadDisplay({ schemaId, payload }) {
  const config = payloadSchemaConfig[schemaId] || [];
  if (!schemaId || !config.length) {
    return <pre>{JSON.stringify(payload, null, 2)}</pre>;
  }

  const renderStringList = (items) => {
    if (!items?.length) return <span className="muted small">なし</span>;
    return (
      <ul className="list">
        {items.map((item, idx) => (
          <li key={`${item}-${idx}`}>{item}</li>
        ))}
      </ul>
    );
  };

  return (
    <div className="payload-display">
      {config.map((field) => {
        if (field.type === 'string' || field.type === 'number') {
          return (
            <div key={field.key} className="payload-row">
              <span className="label">{field.label}</span>
              <span>{payload?.[field.key] || 'なし'}</span>
            </div>
          );
        }
        if (field.type === 'stringList') {
          return (
            <div key={field.key} className="payload-row">
              <span className="label">{field.label}</span>
              {renderStringList(payload?.[field.key] || [])}
            </div>
          );
        }
        if (field.type === 'objectList') {
          const entries = payload?.[field.key] || [];
          return (
            <div key={field.key} className="payload-row">
              <span className="label">{field.label}</span>
              {entries.length ? (
                <div className="payload-object-list">
                  {entries.map((entry, index) => (
                    <div key={`${field.key}-${index}`} className="payload-object-card">
                      {field.fields?.map((subField) => (
                        <div key={subField.key} className="payload-sub-row">
                          <span className="label">{subField.label}</span>
                          {subField.type === 'stringList'
                            ? renderStringList(entry?.[subField.key] || [])
                            : entry?.[subField.key] || 'なし'}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              ) : (
                <span className="muted small">なし</span>
              )}
            </div>
          );
        }
        return null;
      })}
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

            <Collapsible title="payload" defaultOpen={false}>
              <PayloadDisplay schemaId={item.schemaId} payload={item.payload} />
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
      messages.push({ speaker: currentSpeaker, content: [...currentLines] });
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
      input_version: '1.1',
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
          <p className="muted">生テキストから入力 JSON (v1.1) を生成します。</p>
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
                <pre className="message-content">{coerceContentLines(msg.content).join('\n')}</pre>
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
  const createDefaultChunkForm = () => ({
    source_type: 'chatgpt text',
    hint: '',
    locatorMessageIds: '',
    turnRangeStart: '',
    turnRangeEnd: '',
    exportPath: '',
    timeRangeStart: '',
    timeRangeEnd: '',
  });
  const createDefaultItem = () => ({
    stableKey: '',
    kind: '',
    schemaId: '',
    title: '',
    body: '',
    domain: '',
    tagsText: '',
    evidenceText: '',
    payload: {},
    confidence: 1.0,
  });

  const [inputRawJson, setInputRawJson] = useState('');
  const [chunks, setChunks] = useState([]);
  const [selectedChunkIndex, setSelectedChunkIndex] = useState(0);
  const [lineStates, setLineStates] = useState({});
  const [showSkipped, setShowSkipped] = useState(false);
  const [showMarkerOnly, setShowMarkerOnly] = useState(false);
  const [chunkForm, setChunkForm] = useState(createDefaultChunkForm);
  const [items, setItems] = useState([]);
  const [selectedItemIndex, setSelectedItemIndex] = useState(null);
  const [draftItem, setDraftItem] = useState(createDefaultItem);
  const [isLoadingInput, setIsLoadingInput] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);

  const selectedChunk = chunks[selectedChunkIndex] || null;

  const resetChunkState = () => {
    setChunkForm(createDefaultChunkForm());
    setItems([]);
    setSelectedItemIndex(null);
    setDraftItem(createDefaultItem());
    setShowSkipped(false);
    setShowMarkerOnly(false);
  };

  const resetAll = () => {
    setInputRawJson('');
    setChunks([]);
    setSelectedChunkIndex(0);
    setLineStates({});
    resetChunkState();
  };

  const startImport = () => {
    if (!inputRawJson.trim()) {
      alert('入力 JSON を貼り付けてください');
      return;
    }
    setIsLoadingInput(true);
    try {
      const parsedInput = JSON.parse(inputRawJson);
      const inputChunks = Array.isArray(parsedInput.chunks) ? parsedInput.chunks : [];
      if (!inputChunks.length) {
        alert('chunks が見つかりませんでした');
        setIsLoadingInput(false);
        return;
      }
      const mappedChunks = inputChunks.map((chunk, index) => {
        const chunkTmpId = chunk.chunk_tmp_id ?? chunk.chunks_tmp_id ?? chunk.chunk_id ?? index + 1;
        const messages = (chunk.messages || []).map((message) => ({
          ...message,
          content: coerceContentLines(message.content),
        }));
        return { chunkTmpId: String(chunkTmpId), messages };
      });
      setChunks(mappedChunks);
      setSelectedChunkIndex(0);
      setLineStates({});
      resetChunkState();
    } catch (err) {
      alert('入力 JSON のパースに失敗しました');
    } finally {
      setIsLoadingInput(false);
    }
  };

  const updateLineState = (lineId, nextState) => {
    setLineStates((prev) => {
      const chunkStates = { ...(prev[selectedChunkIndex] || {}) };
      const current = chunkStates[lineId] || { marker: false, skip: false };
      chunkStates[lineId] = { ...current, ...nextState };
      return { ...prev, [selectedChunkIndex]: chunkStates };
    });
  };

  const toggleMarker = (lineId) => {
    const current = lineStates[selectedChunkIndex]?.[lineId] || { marker: false, skip: false };
    updateLineState(lineId, current.marker ? { marker: false } : { marker: true, skip: false });
  };

  const toggleSkip = (lineId) => {
    const current = lineStates[selectedChunkIndex]?.[lineId] || { marker: false, skip: false };
    updateLineState(lineId, current.skip ? { skip: false } : { skip: true, marker: false });
  };

  const goToNextChunk = () => {
    const nextIndex = selectedChunkIndex + 1;
    if (nextIndex < chunks.length) {
      setSelectedChunkIndex(nextIndex);
      resetChunkState();
      return;
    }
    resetAll();
  };

  const handleSkipChunk = () => {
    if (items.length) {
      alert('このchunkには item が存在します。すべて削除してから SKIP してください。');
      return;
    }
    goToNextChunk();
  };

  const handleSaveItem = () => {
    if (selectedItemIndex == null) {
      setItems((prev) => [...prev, draftItem]);
    } else {
      setItems((prev) => prev.map((item, idx) => (idx === selectedItemIndex ? draftItem : item)));
    }
    setSelectedItemIndex(null);
    setDraftItem(createDefaultItem());
  };

  const handleDeleteItem = (index) => {
    setItems((prev) => prev.filter((_, idx) => idx != index));
    if (selectedItemIndex === index) {
      setSelectedItemIndex(null);
      setDraftItem(createDefaultItem());
    }
  };

  const handleEditItem = (index) => {
    setSelectedItemIndex(index);
    setDraftItem(items[index]);
  };

  const parseMaybeNumber = (value) => {
    if (!value) return null;
    const num = Number(value);
    return Number.isNaN(num) ? value : num;
  };

  const buildChunkSource = () => {
    const messageIds = chunkForm.locatorMessageIds
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean);
    const locator = {};
    const turnRange = {};
    const start = parseMaybeNumber(chunkForm.turnRangeStart);
    const end = parseMaybeNumber(chunkForm.turnRangeEnd);
    if (start != null) turnRange.start = start;
    if (end != null) turnRange.end = end;
    if (messageIds.length) locator.message_ids = messageIds;
    if (Object.keys(turnRange).length) locator.turn_range = turnRange;

    const timeRange = {};
    if (chunkForm.timeRangeStart) timeRange.start = chunkForm.timeRangeStart;
    if (chunkForm.timeRangeEnd) timeRange.end = chunkForm.timeRangeEnd;

    return {
      source_type: chunkForm.source_type || 'chatgpt text',
      hint: chunkForm.hint || undefined,
      locator: Object.keys(locator).length ? locator : undefined,
      export_path: chunkForm.exportPath || undefined,
      time_range: Object.keys(timeRange).length ? timeRange : undefined,
      messages: selectedChunk?.messages || [],
    };
  };

  const commit = async () => {
    if (!selectedChunk) {
      alert('先に入力 JSON を読み込んでください');
      return;
    }
    if (!items.length) {
      alert('item を追加してください');
      return;
    }
    const invalid = items.find((item) => !item.kind || !item.schemaId);
    if (invalid) {
      alert('kind と schema_id を選択していない item があります');
      return;
    }

    setIsCommitting(true);
    const chunkId = `chunk-${selectedChunk.chunkTmpId || selectedChunkIndex + 1}`;
    const source = buildChunkSource();
    try {
      for (const item of items) {
        const payload = {
          kind: item.kind,
          schema_id: item.schemaId,
          title: item.title || '',
          body: item.body || '',
          stable_key: item.stableKey || null,
          domain: item.domain || null,
          confidence: item.confidence ?? 1.0,
          payload: item.payload || {},
          evidence: parseEvidence(item.evidenceText),
          tags: (item.tagsText || '')
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean)
            .map((name) => ({ name })),
          chunk_id: chunkId,
          source,
        };
        await fetchJson(`${API_BASE}/api/items`, {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      }
      alert(`保存完了: ${items.length} item を登録しました。`);
      goToNextChunk();
    } catch (err) {
      console.error(err);
      showApiError(err, 'コミットに失敗しました');
    } finally {
      setIsCommitting(false);
    }
  };

  const availableSchemas = schemaOptionsByKind[draftItem.kind] || [];

  return (
    <div className="panel">
      <div className="panel-header">
        <div>
          <h2>Import</h2>
          <p className="muted small">入力 JSON を読み込み、chunk と item を手動で登録します。</p>
        </div>
        <button className="ghost" onClick={onClose}>
          閉じる
        </button>
      </div>

      <div className="import-layout">
        <div className="import-left">
          <Collapsible title="入力 JSON (v1.1)" defaultOpen={true}>
            <textarea
              rows={6}
              placeholder="入力 JSON を貼り付けてください。"
              value={inputRawJson}
              onChange={(e) => setInputRawJson(e.target.value)}
            />
            <div className="actions">
              <button className="primary" onClick={startImport} disabled={isLoadingInput}>
                JSON を読み込む
              </button>
              {isLoadingInput && <span className="muted small">読み込み中...</span>}
            </div>
          </Collapsible>

          <h4>chunk 情報</h4>
          <div className="form-grid">
            <label>
              source_type
              <input
                type="text"
                value={chunkForm.source_type}
                onChange={(e) => setChunkForm({ ...chunkForm, source_type: e.target.value })}
              />
            </label>
            <label>
              hint
              <input
                type="text"
                value={chunkForm.hint}
                onChange={(e) => setChunkForm({ ...chunkForm, hint: e.target.value })}
              />
            </label>
            <label className="full">
              locator.message_ids（カンマ区切り）
              <input
                type="text"
                value={chunkForm.locatorMessageIds}
                onChange={(e) => setChunkForm({ ...chunkForm, locatorMessageIds: e.target.value })}
              />
            </label>
            <label>
              locator.turn_range.start
              <input
                type="text"
                value={chunkForm.turnRangeStart}
                onChange={(e) => setChunkForm({ ...chunkForm, turnRangeStart: e.target.value })}
              />
            </label>
            <label>
              locator.turn_range.end
              <input
                type="text"
                value={chunkForm.turnRangeEnd}
                onChange={(e) => setChunkForm({ ...chunkForm, turnRangeEnd: e.target.value })}
              />
            </label>
            <label className="full">
              export_path
              <input
                type="text"
                value={chunkForm.exportPath}
                onChange={(e) => setChunkForm({ ...chunkForm, exportPath: e.target.value })}
              />
            </label>
            <label>
              time_range.start
              <input
                type="text"
                value={chunkForm.timeRangeStart}
                onChange={(e) => setChunkForm({ ...chunkForm, timeRangeStart: e.target.value })}
              />
            </label>
            <label>
              time_range.end
              <input
                type="text"
                value={chunkForm.timeRangeEnd}
                onChange={(e) => setChunkForm({ ...chunkForm, timeRangeEnd: e.target.value })}
              />
            </label>
          </div>

          {selectedChunk ? (
            <div className="chunk-view">
              <div className="chunk-toolbar">
                <div className="chunk-title">
                  <strong>Chunk {selectedChunkIndex + 1}</strong>
                  <span className="muted small">/ {chunks.length} (tmp_id {selectedChunk.chunkTmpId})</span>
                </div>
                <div className="chunk-toolbar-actions">
                  <label className="toggle">
                    <input
                      type="checkbox"
                      checked={showSkipped}
                      onChange={(e) => setShowSkipped(e.target.checked)}
                    />
                    SKIP表示
                  </label>
                  <label className="toggle">
                    <input
                      type="checkbox"
                      checked={showMarkerOnly}
                      onChange={(e) => setShowMarkerOnly(e.target.checked)}
                    />
                    マーカーだけ表示
                  </label>
                  <button className="ghost danger" onClick={handleSkipChunk}>
                    このchunkをSKIP
                  </button>
                </div>
              </div>
              <div className="chunk-messages">
                {selectedChunk.messages.map((message, messageIndex) => (
                  <div key={`${message.message_id}-${messageIndex}`} className="message-group">
                    <div className="message-line header">
                      <strong>{`${message.message_id} - ${message.speaker}`}</strong>
                    </div>
                    {message.content.map((line, lineIndex) => {
                      const lineId = `${message.message_id}-${lineIndex}`;
                      const state = lineStates[selectedChunkIndex]?.[lineId] || { marker: false, skip: false };
                      const isMarked = state.marker;
                      const isSkipped = state.skip;
                      const shouldShow = (showMarkerOnly ? isMarked : true) && (showSkipped ? true : !isSkipped);
                      if (!shouldShow) return null;
                      return (
                        <div
                          key={lineId}
                          className={`message-line content ${isMarked ? 'marked' : ''} ${isSkipped ? 'skipped' : ''}`}
                        >
                          <div className="message-actions">
                            <button
                              className={`icon-button ${isMarked ? 'active' : ''}`}
                              type="button"
                              onClick={() => toggleMarker(lineId)}
                            >
                              ⭐
                            </button>
                            <button
                              className={`icon-button ${isSkipped ? 'active' : ''}`}
                              type="button"
                              onClick={() => toggleSkip(lineId)}
                            >
                              🗑️
                            </button>
                          </div>
                          <span className={line === '' ? 'muted' : ''}>{`${message.message_id} - ${
                            line === '' ? '（空白）' : line
                          }`}</span>
                        </div>
                      );
                    })}
                    <div className="message-gap" />
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="muted">入力 JSON を読み込むと chunk が表示されます。</p>
          )}
        </div>

        <div className="import-right">
          <div className="items-header">
            <h4>items</h4>
          </div>
          <div className="item-list">
            {items.length ? (
              items.map((item, index) => (
                <div key={`${item.title}-${index}`} className="item-card">
                  <button className="ghost tiny" type="button" onClick={() => handleEditItem(index)}>
                    {item.title || '（titleなし）'}
                  </button>
                  <span className="muted small">
                    {item.kind || 'kind未選択'}
                    {item.schemaId ? ` / ${item.schemaId}` : ''}
                  </span>
                  <button className="ghost tiny danger" type="button" onClick={() => handleDeleteItem(index)}>
                    削除
                  </button>
                </div>
              ))
            ) : (
              <p className="muted small">保存済み item はありません。</p>
            )}
          </div>

          <h4>item 情報</h4>
          <div className="form-grid">
            <label>
              stable_key
              <input
                type="text"
                value={draftItem.stableKey}
                onChange={(e) => setDraftItem({ ...draftItem, stableKey: e.target.value })}
              />
            </label>
            <label>
              kind
              <select
                value={draftItem.kind}
                onChange={(e) =>
                  setDraftItem({
                    ...draftItem,
                    kind: e.target.value,
                    schemaId: '',
                    payload: {},
                  })
                }
              >
                <option value="">未選択</option>
                {kinds.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
            </label>
            <label>
              schema_id
              <select
                value={draftItem.schemaId}
                onChange={(e) =>
                  setDraftItem({
                    ...draftItem,
                    schemaId: e.target.value,
                    payload: buildDefaultPayload(e.target.value),
                  })
                }
              >
                <option value="">未選択</option>
                {availableSchemas.map((schema) => (
                  <option key={schema} value={schema}>
                    {schema}
                  </option>
                ))}
              </select>
            </label>
            <label className="full">
              title
              <input
                type="text"
                value={draftItem.title}
                onChange={(e) => setDraftItem({ ...draftItem, title: e.target.value })}
              />
            </label>
            <label className="full">
              body
              <textarea
                rows={3}
                value={draftItem.body}
                onChange={(e) => setDraftItem({ ...draftItem, body: e.target.value })}
              />
            </label>
            <label>
              domain
              <input
                type="text"
                value={draftItem.domain}
                onChange={(e) => setDraftItem({ ...draftItem, domain: e.target.value })}
              />
            </label>
            <label>
              tags（カンマ区切り）
              <input
                type="text"
                value={draftItem.tagsText}
                onChange={(e) => setDraftItem({ ...draftItem, tagsText: e.target.value })}
              />
            </label>
            <label className="full">
              evidence
              <textarea
                rows={2}
                value={draftItem.evidenceText}
                onChange={(e) => setDraftItem({ ...draftItem, evidenceText: e.target.value })}
              />
            </label>
            <label>
              confidence
              <input
                type="number"
                min="0"
                max="1"
                step="0.01"
                value={draftItem.confidence}
                onChange={(e) => setDraftItem({ ...draftItem, confidence: Number(e.target.value) })}
              />
            </label>
          </div>

          <div className="payload-editor">
            <h4>payload</h4>
            <PayloadEditor
              schemaId={draftItem.schemaId}
              value={draftItem.payload}
              onChange={(nextValue) => setDraftItem({ ...draftItem, payload: nextValue })}
            />
          </div>

          <div className="actions">
            <button className="primary" onClick={handleSaveItem}>
              {selectedItemIndex == null ? '保存' : '更新'}
            </button>
            <button className="ghost" onClick={() => setDraftItem(createDefaultItem())}>
              クリア
            </button>
          </div>

          <div className="actions">
            <button className="primary" onClick={commit} disabled={isCommitting || !selectedChunk}>
              commit
            </button>
            <button className="ghost" onClick={onClose}>
              閉じる
            </button>
          </div>
        </div>
      </div>
    </div>
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