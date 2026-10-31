// 브라우저 기본 확인창(confirm/alert)은 위에 사이트 주소가 붙어서, 앱 안에서 같은 모양의 창을 띄운다.
// ask(메시지) → 확인이면 true, tell(메시지) → 닫으면 끝. 둘 다 Promise.
function show(message, { ok = '확인', cancel = null, danger = false } = {}) {
  return new Promise(resolve => {
    const font = "-apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', 'Pretendard', sans-serif"
    const back = document.createElement('div')
    back.style.cssText = 'position:fixed;inset:0;z-index:2000;background:rgba(26,20,16,0.45);backdrop-filter:blur(2px);-webkit-backdrop-filter:blur(2px);display:flex;align-items:center;justify-content:center;padding:24px'
    const box = document.createElement('div')
    box.setAttribute('role', 'alertdialog')
    box.style.cssText = `width:100%;max-width:320px;background:#fff;border-radius:18px;box-shadow:0 12px 40px rgba(0,0,0,0.18);font-family:${font};overflow:hidden`
    const text = document.createElement('div')
    text.textContent = message
    text.style.cssText = 'padding:22px 20px 18px;font-size:15.5px;line-height:1.5;color:#1c1c1e;white-space:pre-line;word-break:keep-all;text-align:center'
    const row = document.createElement('div')
    row.style.cssText = 'display:flex;border-top:0.5px solid rgba(60,60,67,0.18)'
    const btn = (label, value, strong) => {
      const b = document.createElement('button')
      b.type = 'button'
      b.textContent = label
      b.style.cssText = `flex:1;border:none;background:none;padding:14px 0;font-family:${font};font-size:16px;cursor:pointer;` +
        (strong ? `font-weight:600;color:${danger ? '#e5484d' : '#1c1c1e'}` : 'color:#8e8e93')
      b.onclick = () => done(value)
      return b
    }
    const done = value => { back.remove(); document.removeEventListener('keydown', key); resolve(value) }
    const key = e => { if (e.key === 'Escape') done(cancel ? false : true); if (e.key === 'Enter') done(true) }
    if (cancel) {
      const c = btn(cancel, false, false)
      c.style.borderRight = '0.5px solid rgba(60,60,67,0.18)'
      row.append(c)
    }
    const o = btn(ok, true, true)
    row.append(o)
    back.onclick = e => { if (e.target === back) done(cancel ? false : true) }
    box.append(text, row)
    back.append(box)
    document.body.append(back)
    document.addEventListener('keydown', key)
    o.focus()
  })
}

// 삭제·종료처럼 되돌리기 어려운 건 확인 버튼을 빨갛게
export const ask = message => show(message, { cancel: '취소', danger: /삭제|종료|중단|로그아웃|지워/.test(message) })
export const tell = message => show(message)
