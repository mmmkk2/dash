// 노트 (메모 화면의 '노트'): 강의노트처럼 긴 글을 소제목·목록으로 정리하고 PDF 등 파일을 붙인다
// Supabase lecture_notes 테이블 + 비공개 버킷 note-files('<user id>/...'), 본인만 (supabase_setup.sql 맨 아래)
import { useState, useEffect, useMemo, useRef } from 'react'
import { Search, Paperclip, FileText, File as FileIcon, X, Pencil, Trash2, Heading, List, ChevronDown, StickyNote, Maximize2, Minimize2 } from 'lucide-react'
import { supabase } from './login'
import { F, C, plain, Sheet, useBackClose, GrowTextarea, Fab, TAGS, MEMO_TINT } from '../notes-app'

// 노트 태그(과목) 색: 메모 태그와 이름이 겹치면 같은 색(부동산·고이온·앤딩·개인), 아니면 이름으로 정해지는 색
const EXTRA = [{ color: '#c0697f', soft: '#fdf4f6' }, { color: '#4f9aa3', soft: '#f2f9fa' }, { color: '#b08a2e', soft: '#fcf9ef' }, { color: '#7b7fc4', soft: '#f6f6fd' }]
function subjectColor(s) {
  if (!s) return { color: MEMO_TINT, soft: C.fill }
  const t = Object.values(TAGS).find(t => s.includes(t.label) || t.label.includes(s))
  if (t) return t
  let h = 0
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return EXTRA[h % EXTRA.length]
}

const BUCKET = 'note-files'
const MEMO_BUCKET = 'memo-images' // 메모에서 옮겨 온 사진은 메모 버킷에 그대로 두고 bucket으로 표시
const MAX_FILE = 50 * 1024 * 1024
const shortDate = s => { const d = new Date(s); return `${d.getMonth() + 1}/${d.getDate()}` }
const fileSize = n => n >= 1048576 ? `${(n / 1048576).toFixed(1)}MB` : `${Math.max(1, Math.round(n / 1024))}KB`

// 본문 한 줄씩: '# 제목' / '## 소제목' / '- 목록' / 그 외 문단
const parse = text => (text || '').split('\n').map((line, i) => {
  const h = line.match(/^(#{1,2}) (.*)/)
  if (h) return { kind: h[1].length === 1 ? 'h1' : 'h2', text: h[2], i }
  if (/^[-*] /.test(line)) return { kind: 'li', text: line.slice(2), i }
  return { kind: line.trim() ? 'p' : 'gap', text: line, i }
})

// 본문의 주소(http·https·www.)는 눌러서 새 창으로 열리게
const URL_RE = /(https?:\/\/|www\.)[^\s<>"']+/g
function Linkify({ text }) {
  const out = []
  let last = 0
  for (const m of text.matchAll(URL_RE)) {
    const url = m[0].replace(/[).,;:!?\]}'"]+$/, '') // 문장 끝 문장부호는 주소에서 뺀다
    if (m.index > last) out.push(text.slice(last, m.index))
    out.push(<a key={m.index} href={url.startsWith('www.') ? `https://${url}` : url} target="_blank" rel="noreferrer"
      style={{ color: '#2f6fb3', textDecoration: 'underline', textUnderlineOffset: 3, wordBreak: 'break-all' }}>{url}</a>)
    last = m.index + url.length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

function NoteBody({ text }) {
  const lines = useMemo(() => parse(text), [text])
  const heads = lines.filter(l => l.kind === 'h1' || l.kind === 'h2')
  const [tocOpen, setTocOpen] = useState(true)
  const jump = i => document.getElementById(`note-line-${i}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  return (
    <>
      {heads.length >= 2 && (
        <div style={{ background: C.fill, borderRadius: 12, padding: '10px 14px', margin: '4px 0 14px' }}>
          <button onClick={() => setTocOpen(o => !o)} style={{ ...plain, display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, fontWeight: 600, color: C.sub }}>
            목차 <ChevronDown size={14} style={{ transform: tocOpen ? 'none' : 'rotate(-90deg)', transition: 'transform .15s' }} />
          </button>
          {tocOpen && heads.map(h => (
            <button key={h.i} onClick={() => jump(h.i)} style={{ ...plain, display: 'block', textAlign: 'left', fontSize: 14, color: C.text, padding: '4px 0 0', paddingLeft: h.kind === 'h2' ? 12 : 0 }}>{h.text}</button>
          ))}
        </div>
      )}
      <div style={{ fontSize: 15.5, lineHeight: 1.65 }}>
        {lines.map(l => {
          const id = `note-line-${l.i}`
          if (l.kind === 'h1') return <div key={l.i} id={id} style={{ fontSize: 19, fontWeight: 700, margin: '18px 0 6px', scrollMarginTop: 80 }}>{l.text}</div>
          if (l.kind === 'h2') return <div key={l.i} id={id} style={{ fontSize: 16.5, fontWeight: 700, margin: '14px 0 4px', scrollMarginTop: 80 }}>{l.text}</div>
          if (l.kind === 'li') return <div key={l.i} style={{ display: 'flex', gap: 8, paddingLeft: 4 }}><span style={{ color: C.sub }}>•</span><span style={{ flex: 1, minWidth: 0, whiteSpace: 'pre-wrap' }}><Linkify text={l.text} /></span></div>
          if (l.kind === 'gap') return <div key={l.i} style={{ height: 10 }} />
          return <div key={l.i} style={{ whiteSpace: 'pre-wrap' }}><Linkify text={l.text} /></div>
        })}
      </div>
    </>
  )
}

function FileRow({ f, onOpen, onRemove }) {
  const pdf = /pdf/i.test(f.type) || /\.pdf$/i.test(f.name)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: C.card, border: `0.5px solid ${C.sep}`, borderRadius: 12, marginTop: 6 }}>
      {pdf ? <FileText size={20} color="#e5484d" /> : <FileIcon size={20} color={C.sub} />}
      <button onClick={onOpen} style={{ ...plain, flex: 1, minWidth: 0, textAlign: 'left' }}>
        <div style={{ fontSize: 14.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: C.text }}>{f.name}</div>
        {f.size > 0 && <div style={{ fontSize: 12, color: C.sub }}>{fileSize(f.size)}</div>}
      </button>
      {onRemove && <button onClick={onRemove} aria-label={`${f.name} 빼기`} style={{ ...plain, color: C.sub, padding: 4 }}><X size={16} /></button>}
    </div>
  )
}

export default function LectureNotes({ setErr, onMovedToMemo }) {
  const [notes, setNotes] = useState(null)
  const [q, setQ] = useState('')
  const [subject, setSubject] = useState('')
  const [edit, setEdit] = useState(null) // { id?, title, subject, content, files, editing, uploaded }
  const [uploading, setUploading] = useState(0)
  const [full, setFull] = useState(false) // 크게 보기 (메모 창과 같은 방식)
  const fileRef = useRef(null)

  async function load() {
    const { data, error } = await supabase.from('lecture_notes').select('*').order('updated_at', { ascending: false })
    if (error) { setNotes([]); return setErr(error.message) }
    setNotes(data)
  }
  useEffect(() => { load() }, [])

  const subjects = useMemo(() => [...new Set((notes || []).map(n => n.subject).filter(Boolean))], [notes])
  const shown = (notes || []).filter(n => (!subject || n.subject === subject)
    && (!q.trim() || `${n.title} ${n.subject} ${n.content}`.toLowerCase().includes(q.trim().toLowerCase())))

  const open = n => setEdit({ ...n, files: n.files || [], editing: false, uploaded: [], snapshot: JSON.stringify([n.title, n.subject, n.content, n.files || []]) })
  const create = () => setEdit({ title: '', subject: subject || '', content: '', files: [], editing: true, uploaded: [] })
  const removeFiles = paths => { if (paths.length) supabase.storage.from(BUCKET).remove(paths) }
  // 첨부 지우기: 파일마다 들어 있는 버킷에서
  const removeAttached = files => { for (const b of new Set(files.map(f => f.bucket || BUCKET))) supabase.storage.from(b).remove(files.filter(f => (f.bucket || BUCKET) === b).map(f => f.path)) }
  const discard = () => { removeFiles(edit.uploaded); setEdit(null) }

  async function save() {
    const changed = !edit.id || JSON.stringify([edit.title, edit.subject, edit.content, edit.files]) !== edit.snapshot
    if (!changed) return setEdit(null)
    if (!edit.title.trim() && !edit.content.trim() && !edit.files.length) return discard()
    const row = { title: edit.title.trim(), subject: edit.subject.trim() || null, content: edit.content, files: edit.files, updated_at: new Date().toISOString() }
    const { error } = edit.id
      ? await supabase.from('lecture_notes').update(row).eq('id', edit.id)
      : await supabase.from('lecture_notes').insert(row)
    if (error) return setErr(error.message)
    setEdit(null); load()
  }
  async function remove() {
    if (!confirm('이 노트를 삭제할까요? 붙인 파일도 함께 지워져요.')) return
    const { error } = await supabase.from('lecture_notes').delete().eq('id', edit.id)
    if (error) return setErr(error.message)
    removeAttached(edit.files); setEdit(null); load()
  }
  useBackClose(!!edit, () => (edit?.editing ? save() : setEdit(null)))
  useBackClose(!!edit && full, () => setFull(false))

  async function addFiles(list) {
    const { data: { user } } = await supabase.auth.getUser()
    for (const file of list) {
      if (file.size > MAX_FILE) { setErr(`${file.name}: 50MB 이하 파일만 붙일 수 있어요`); continue }
      setUploading(n => n + 1)
      try {
        const path = `${user.id}/${crypto.randomUUID()}-${file.name.replace(/[^\w.\-가-힣]/g, '_')}`
        const { error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type || 'application/octet-stream' })
        if (error) throw error
        const f = { path, name: file.name, size: file.size, type: file.type }
        setEdit(ed => ed && { ...ed, files: [...ed.files, f], uploaded: [...ed.uploaded, path] })
      } catch (e) { setErr(e.message) } finally { setUploading(n => n - 1) }
    }
  }
  // HTML·글 파일은 저장소 주소로 열면 소스가 글자로(한글 깨짐) 나와서, 받아서 앱 안에서 UTF-8로 보여준다
  const [viewer, setViewer] = useState(null) // { name, html } | { name, text }
  useBackClose(!!viewer, () => setViewer(null))
  async function openFile(f) {
    const isHtml = /\.html?$/i.test(f.name) || /html/i.test(f.type || '')
    const isText = !isHtml && (/\.(txt|md|csv|json)$/i.test(f.name) || /^text\//i.test(f.type || ''))
    if (isHtml || isText) {
      const { data, error } = await supabase.storage.from(f.bucket || BUCKET).download(f.path)
      if (error || !data) return setErr(error?.message || '파일을 열지 못했어요')
      const body = new TextDecoder('utf-8').decode(await data.arrayBuffer())
      return setViewer(isHtml ? { name: f.name, html: body } : { name: f.name, text: body })
    }
    const w = window.open('', '_blank') // 팝업 차단을 피하려고 누른 순간 창부터 연다
    const { data, error } = await supabase.storage.from(f.bucket || BUCKET).createSignedUrl(f.path, 3600)
    if (error || !data?.signedUrl) { w?.close(); return setErr(error?.message || '파일을 열지 못했어요') }
    if (w) w.location.href = data.signedUrl; else location.href = data.signedUrl
  }
  // 노트 → 메모: 제목+본문(제목 표시 # 는 뗌)을 메모 한 장으로. 메모에서 온 사진은 메모 사진으로 돌아가고,
  // 그 밖의 첨부(PDF 등)는 메모에 붙일 수 없어 지운다 (먼저 물어봄)
  async function toMemo() {
    const photos = edit.files.filter(f => f.bucket === MEMO_BUCKET)
    const others = edit.files.filter(f => f.bucket !== MEMO_BUCKET)
    if (!confirm(others.length ? `첨부 파일 ${others.length}개는 메모에 붙일 수 없어 지워져요.\n메모로 옮길까요?` : '이 노트를 메모로 옮길까요?')) return
    const content = [edit.title.trim(), edit.content.replace(/^#{1,2} /gm, '')].filter(t => t.trim()).join('\n')
    const row = { title: '', content, color: '#1c1c1e', pinned: false, updated_at: new Date().toISOString() }
    if (photos.length) row.images = photos.map(f => f.path)
    const { error } = await supabase.from('memos').insert(row)
    if (error) return setErr(error.message)
    await supabase.from('lecture_notes').delete().eq('id', edit.id)
    removeAttached(others)
    setEdit(null); load(); onMovedToMemo?.()
  }
  // 편집 중 줄 앞에 '## ' 또는 '- ' 넣기
  const taRef = useRef(null)
  const prefix = mark => {
    const ta = taRef.current
    const pos = ta ? ta.selectionStart : edit.content.length
    const start = edit.content.lastIndexOf('\n', pos - 1) + 1
    const content = edit.content.slice(0, start) + mark + edit.content.slice(start)
    setEdit(ed => ({ ...ed, content }))
    requestAnimationFrame(() => { ta?.focus(); ta?.setSelectionRange(pos + mark.length, pos + mark.length) })
  }

  const input = { width: '100%', boxSizing: 'border-box', border: 'none', outline: 'none', background: 'transparent', fontFamily: F, color: C.text }
  const toolBtn = { ...plain, display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, fontWeight: 600, color: C.text, background: C.card, border: `0.5px solid ${C.sep}`, borderRadius: 999, padding: '7px 11px' }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: C.card, borderRadius: 12, padding: '10px 12px', marginBottom: 10, border: `0.5px solid ${C.sep}` }}>
        <Search size={16} color={C.sub} strokeWidth={2.2} />
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="노트 검색" style={{ ...input, fontSize: 15 }} />
      </div>
      {subjects.length > 0 && (
        // 메모 태그 칩과 같은 모양: 선택하면 태그 색으로 채움, 아니면 흰 칩에 색 점·색 글씨 (전체는 메모와 같은 코랄)
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', marginBottom: 18, paddingBottom: 2 }}>
          {['', ...subjects].map(s => {
            const on = subject === s, t = s && subjectColor(s)
            return (
              <button key={s || '_all'} onClick={() => setSubject(on && s ? '' : s)} aria-pressed={on} style={{ ...plain, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap', fontSize: 12, fontWeight: 600, borderRadius: 999, padding: '5px 10px', background: on ? (t ? t.color : MEMO_TINT) : C.card, color: on ? '#fff' : (t ? t.color : C.text), border: `0.5px solid ${on && t ? t.color : C.sep}` }}>
                {t && <span style={{ width: 8, height: 8, borderRadius: '50%', background: on ? '#fff' : t.color }} />}
                {s || '전체'}
              </button>
            )
          })}
        </div>
      )}
      {notes && shown.length === 0 && <div style={{ textAlign: 'center', color: C.sub, padding: '60px 0', fontSize: 15 }}>{notes.length ? '찾는 노트가 없어요' : '+ 버튼으로 첫 노트를 만들어 보세요'}</div>}
      {shown.map(n => {
        const preview = parse(n.content).find(l => l.kind !== 'gap')?.text || ''
        return (
          <button key={n.id} onClick={() => open(n)} style={{ ...plain, display: 'block', width: '100%', textAlign: 'left', background: C.card, borderRadius: 16, border: `0.5px solid ${C.sep}`, padding: '13px 15px', marginBottom: 8, color: C.text }}>
            <div style={{ fontSize: 16, fontWeight: 650, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{n.title || '제목 없음'}</div>
            {preview && <div style={{ fontSize: 13.5, color: C.sub, marginTop: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{preview}</div>}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: C.sub, marginTop: 6 }}>
              {n.subject && <span style={{ background: subjectColor(n.subject).soft, borderRadius: 6, padding: '2px 7px', color: subjectColor(n.subject).color, fontWeight: 600 }}>{n.subject}</span>}
              <span>{shortDate(n.updated_at)}</span>
              {n.files?.length > 0 && <span style={{ display: 'flex', alignItems: 'center', gap: 2 }}><Paperclip size={12} />{n.files.length}</span>}
            </div>
          </button>
        )
      })}
      {!edit && <Fab label="새 노트" color={subjectColor(subject).color} onClick={create} />}

      {viewer && (
        <div onClick={() => setViewer(null)} style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(26,20,16,0.6)', backdropFilter: 'blur(2px)', WebkitBackdropFilter: 'blur(2px)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
        <div onClick={e => e.stopPropagation()} style={{ width: 'calc(100% - 16px)', maxWidth: 660, height: 'min(78dvh, calc(100dvh - 80px))', background: '#fff', borderRadius: '24px 24px 0 0', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 -10px 40px rgba(0,0,0,0.12)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px 12px', borderBottom: `0.5px solid ${C.sep}` }}>
            <div style={{ flex: 1, minWidth: 0, fontSize: 15, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{viewer.name}</div>
            <button onClick={() => setViewer(null)} style={{ ...plain, fontSize: 15, fontWeight: 600, color: '#fff', background: MEMO_TINT, borderRadius: 999, padding: '7px 16px' }}>닫기</button>
          </div>
          {viewer.html != null
            // 올린 HTML은 따로 격리된 틀에서 (스크립트는 되지만 이 앱의 로그인·데이터에는 접근 못 함)
            ? <iframe title={viewer.name} srcDoc={viewer.html} sandbox="allow-scripts allow-popups" style={{ flex: 1, border: 'none', width: '100%' }} />
            : <pre style={{ flex: 1, margin: 0, padding: 16, overflow: 'auto', fontSize: 13.5, lineHeight: 1.55, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>{viewer.text}</pre>}
        </div>
        </div>
      )}

      {edit && (
        // 높이는 메모 읽기 창과 같게 (메모 본문 45dvh + 머리·아래 198px), 크게 보기는 메모와 같은 full
        <Sheet full={full} titleLines={2} title={edit.editing ? (edit.id ? '노트 편집' : '새 노트') : (edit.title || '제목 없음')} tint={subjectColor(edit.subject?.trim()).color}
          onCancel={edit.editing ? (edit.id ? () => { removeFiles(edit.uploaded); open(notes.find(x => x.id === edit.id)) } : discard) : () => setEdit(null)}
          hideCancel={!edit.editing} onBackdrop={edit.editing ? save : () => setEdit(null)}
          doneLabel={edit.editing ? (uploading ? '올리는 중…' : '저장') : '편집'} doneDisabled={uploading > 0}
          onDone={edit.editing ? save : () => setEdit(e => ({ ...e, editing: true }))}
          actions={<>
            <button aria-label={full ? '작게 보기' : '크게 보기'} onClick={() => setFull(f => !f)} style={{ ...plain, display: 'flex', color: C.sub, padding: 4 }}>
              {full ? <Minimize2 size={19} /> : <Maximize2 size={19} />}
            </button>
            {edit.id && !edit.editing && <button onClick={toMemo} aria-label="메모로 옮기기" title="메모로 옮기기" style={{ ...plain, display: 'flex', color: C.sub, padding: 4 }}><StickyNote size={19} /></button>}
            {edit.id && <button onClick={remove} aria-label="노트 삭제" style={{ ...plain, display: 'flex', color: C.sub, padding: 4 }}><Trash2 size={19} /></button>}
          </>}>
          {edit.editing ? (
            <>
              <input value={edit.title} onChange={e => setEdit(ed => ({ ...ed, title: e.target.value }))} placeholder="제목" autoFocus={!edit.id} style={{ ...input, fontSize: 22, fontWeight: 700, padding: '2px 0' }} />
              <input value={edit.subject} onChange={e => setEdit(ed => ({ ...ed, subject: e.target.value }))} placeholder="태그 · 과목 (예: 경매 기초)" list="note-subjects" style={{ ...input, fontSize: 14, color: C.sub, padding: '6px 0 10px', borderBottom: `0.5px solid ${C.sep}` }} />
              <datalist id="note-subjects">{subjects.map(s => <option key={s} value={s} />)}</datalist>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '10px 0' }}>
                <button onClick={() => prefix('## ')} style={toolBtn}><Heading size={14} />소제목</button>
                <button onClick={() => prefix('- ')} style={toolBtn}><List size={14} />목록</button>
                <button onClick={() => fileRef.current?.click()} style={toolBtn}><Paperclip size={14} />파일 추가</button>
                <input ref={fileRef} type="file" multiple hidden onChange={e => { addFiles([...e.target.files]); e.target.value = '' }} />
              </div>
              {edit.files.length > 0 && <div style={{ marginBottom: 10 }}>{edit.files.map(f => <FileRow key={f.path} f={f} onOpen={() => openFile(f)} onRemove={() => setEdit(ed => ({ ...ed, files: ed.files.filter(x => x.path !== f.path) }))} />)}</div>}
              <GrowTextarea value={edit.content} minRows={12} maxHeight="none" onChange={e => setEdit(ed => ({ ...ed, content: e.target.value }))}
                placeholder={'강의 내용을 정리해 보세요\n\n# 큰 제목\n## 소제목\n- 목록'} style={{ ...input, fontSize: 15.5, lineHeight: 1.6, resize: 'none' }} inputRef={taRef} />
            </>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: C.sub, margin: '0 0 12px' }}>
                {edit.subject && <span style={{ background: subjectColor(edit.subject).soft, borderRadius: 6, padding: '2px 8px', color: subjectColor(edit.subject).color, fontWeight: 600 }}>{edit.subject}</span>}
                <span>{shortDate(edit.updated_at)} 수정</span>
              </div>
              {edit.files.length > 0 && <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: C.sub, marginBottom: 2 }}>첨부 {edit.files.length}</div>
                {edit.files.map(f => <FileRow key={f.path} f={f} onOpen={() => openFile(f)} />)}
              </div>}
              <NoteBody text={edit.content} />
            </>
          )}
        </Sheet>
      )}
    </div>
  )
}
