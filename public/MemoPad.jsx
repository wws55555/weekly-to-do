// The memo pad (메모장) view, shown in place of the planner panel when the
// header's mode switch is on 메모장. Pure UI over what useMemos() returns:
// a list of memos (most recently edited first) and a modal editor for a
// new or existing memo. A memo is just free text; its first line doubles as
// its title in the list.
function MemoPad({ memos, loading, connectionOk, onAdd, onEdit, onRemove }) {
  // null = closed, "new" = composing a new memo, otherwise the memo's id
  const [editorId, setEditorId] = React.useState(null);
  const suppressEditorPopRef = React.useRef(false);

  // same back-button pattern as the planner's modals (see WeeklyPlanner.jsx)
  React.useEffect(() => {
    if (!editorId) return;
    window.history.pushState({ wkModal: true }, "");
    const onPopState = () => {
      suppressEditorPopRef.current = true;
      setEditorId(null);
    };
    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("popstate", onPopState);
      if (!suppressEditorPopRef.current) window.history.back();
      suppressEditorPopRef.current = false;
    };
  }, [editorId]);

  const editingMemo = editorId && editorId !== "new" ? memos.find((m) => m.id === editorId) : null;
  const closeEditor = () => setEditorId(null);
  const saveEditor = (text) => {
    if (editorId === "new") onAdd(text);
    else onEdit(editorId, text);
    setEditorId(null);
  };
  const removeFromEditor = () => {
    if (onRemove(editorId)) setEditorId(null);
  };

  return (
    <>
      {loading ? (
        <div className="wk-loading">불러오는 중…</div>
      ) : (
        <div className="wk-panel">
          <div className="wk-panel-head">
            <div className="wk-tab-bg" />
            <div className="wk-panel-head-content wk-memo-head-content">
              <span className="wk-panel-day">메모</span>
              <span className="wk-panel-actions">
                <span className="wk-panel-count">{memos.length > 0 ? memos.length : ""}</span>
                <button className="wk-add-btn" onClick={() => setEditorId("new")} aria-label="새 메모">
                  <Plus size={15} />
                </button>
              </span>
            </div>
          </div>

          <div className="wk-list">
            {memos.length === 0 && <div className="wk-empty">메모가 없어요</div>}
            {memos.map((m) => {
              const lines = (m.text || "").trim().split("\n");
              const title = lines[0];
              const preview = lines.slice(1).join(" ").trim();
              return (
                <button key={m.id} className="wk-memo-item" onClick={() => setEditorId(m.id)}>
                  <span className="wk-memo-text">
                    <span className="wk-memo-title">{title}</span>
                    {preview && <span className="wk-memo-preview">{preview}</span>}
                  </span>
                  <span className="wk-memo-date">{formatMD(new Date(m.updatedAt))}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {!connectionOk && <div className="wk-warning">서버와 연결이 원활하지 않아요. 변경사항이 저장되지 않을 수 있어요.</div>}

      {(editorId === "new" || editingMemo) && (
        <MemoEditorModal
          key={editorId}
          initialText={editingMemo ? editingMemo.text : ""}
          isNew={editorId === "new"}
          onSave={saveEditor}
          onRemove={removeFromEditor}
          onClose={closeEditor}
        />
      )}
    </>
  );
}

// Owns only its own textarea state; nothing is written until 저장.
function MemoEditorModal({ initialText, isNew, onSave, onRemove, onClose }) {
  const [text, setText] = React.useState(initialText);
  const canSave = text.trim() !== "" && text !== initialText;

  return (
    <div className="wk-modal-backdrop" onClick={onClose}>
      <div className="wk-modal wk-memo-modal" onClick={(e) => e.stopPropagation()}>
        <div className="wk-modal-head">
          <span className="wk-modal-title">{isNew ? "새 메모" : "메모"}</span>
          <span className="wk-memo-modal-actions">
            {!isNew && (
              <button className="wk-modal-close" onClick={onRemove} aria-label="메모 삭제"><Trash2 size={15} /></button>
            )}
            <button className="wk-modal-close" onClick={onClose} aria-label="닫기"><X size={16} /></button>
          </span>
        </div>
        <div className="wk-edit-form">
          <textarea
            className="auth-input wk-memo-textarea"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="메모를 입력하세요"
            autoFocus={isNew}
          />
          <div className="wk-edit-actions">
            <button type="button" className="wk-edit-cancel" onClick={onClose}>취소</button>
            <button type="button" className="auth-submit" disabled={!canSave} onClick={() => onSave(text)}>저장</button>
          </div>
        </div>
      </div>
    </div>
  );
}
