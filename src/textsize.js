// 글자 크기: 화면 전체를 조금씩 키우거나 줄인다 (기기마다 따로 저장).
// 글자만 키우면 칸이 깨져서, 화면 전체 배율(zoom)로 같이 키운다.
const KEY = 'dash.textSize'
export const SIZES = [
  { k: 's', label: '작게', z: 0.92 },
  { k: 'm', label: '기본', z: 1 },
  { k: 'l', label: '크게', z: 1.08 },
  { k: 'xl', label: '아주 크게', z: 1.16 },
]

export const textZoom = () => {
  let k = 'm'
  try { k = localStorage.getItem(KEY) || 'm' } catch {}
  return (SIZES.find(s => s.k === k) || SIZES[1]).z
}

// 배율을 입히고, 브라우저가 dvh까지 키우면(크롬) 창 높이가 화면을 넘지 않게 --vz로 되돌린다
export function applyTextSize() {
  const z = textZoom()
  const root = document.documentElement
  root.style.zoom = z === 1 ? '' : String(z)
  let vz = 1
  if (z !== 1) {
    const probe = document.createElement('div')
    probe.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:100dvh;visibility:hidden;pointer-events:none'
    document.body.append(probe)
    const h = probe.getBoundingClientRect().height
    probe.remove()
    if (h > window.innerHeight * 1.02) vz = window.innerHeight / h
  }
  root.style.setProperty('--vz', String(vz))
}

// 앱 안 창: 네 단계 중 고르면 바로 바뀐다
export function openTextSize() {
  const font = "-apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', 'Pretendard', sans-serif"
  const back = document.createElement('div')
  back.style.cssText = 'position:fixed;inset:0;z-index:2000;background:rgba(26,20,16,0.45);backdrop-filter:blur(2px);-webkit-backdrop-filter:blur(2px);display:flex;align-items:center;justify-content:center;padding:24px'
  const box = document.createElement('div')
  box.setAttribute('role', 'dialog')
  box.style.cssText = `width:100%;max-width:340px;background:#fff;border-radius:18px;box-shadow:0 12px 40px rgba(0,0,0,0.18);font-family:${font};overflow:hidden;color:#1c1c1e`
  const title = document.createElement('div')
  title.textContent = '글자 크기'
  title.style.cssText = 'padding:20px 20px 4px;font-size:20px;font-weight:700;letter-spacing:-0.3px'
  const sample = document.createElement('div')
  sample.textContent = '이 기기에서만 바뀌어요. 메모·가계부·자산·앤딩 모두 같이 커지고 작아져요.'
  sample.style.cssText = 'padding:4px 20px 16px;font-size:14px;line-height:1.5;color:#8e8e93;word-break:keep-all'
  const row = document.createElement('div')
  row.style.cssText = 'display:flex;gap:6px;padding:0 16px 18px'
  const cur = () => { try { return localStorage.getItem(KEY) || 'm' } catch { return 'm' } }
  const paint = () => [...row.children].forEach(b => {
    const on = b.dataset.k === cur()
    b.style.background = on ? '#ef6a5f' : '#f2f2f4'
    b.style.color = on ? '#fff' : '#1c1c1e'
    b.style.fontWeight = on ? '600' : '400'
  })
  SIZES.forEach((s, i) => {
    const b = document.createElement('button')
    b.type = 'button'
    b.dataset.k = s.k
    b.innerHTML = `<div style="font-size:${14 + i * 2}px;line-height:22px">가</div><div style="font-size:12px;margin-top:2px">${s.label}</div>`
    b.style.cssText = `flex:1;border:none;border-radius:12px;padding:10px 0;cursor:pointer;font-family:${font}`
    b.onclick = () => { try { localStorage.setItem(KEY, s.k) } catch {} applyTextSize(); paint() }
    row.append(b)
  })
  paint()
  const done = document.createElement('button')
  done.type = 'button'
  done.textContent = '완료'
  done.style.cssText = `display:block;width:100%;border:none;border-top:0.5px solid rgba(60,60,67,0.18);background:none;padding:14px 0;font-family:${font};font-size:16px;font-weight:600;color:#1c1c1e;cursor:pointer`
  const close = () => { back.remove(); document.removeEventListener('keydown', key) }
  const key = e => { if (e.key === 'Escape' || e.key === 'Enter') close() }
  done.onclick = close
  back.onclick = e => { if (e.target === back) close() }
  box.append(title, sample, row, done)
  back.append(box)
  document.body.append(back)
  document.addEventListener('keydown', key)
}
