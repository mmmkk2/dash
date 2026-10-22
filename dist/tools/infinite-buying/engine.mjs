export const floorPrice = n => Math.floor((n + 1e-9) * 100) / 100;
export const roundPrice = n => Math.round((n + 1e-9) * 100) / 100;
export function validate(s) {
  if (!['TQQQ','SOXL'].includes(s.symbol) || ![20,40].includes(s.splits)) throw Error('TQQQ·SOXL, 20·40분할만 지원합니다.');
  for (const k of ['cash','shares','avg','t','close','bigPct','depth']) if (!Number.isFinite(s[k]) || s[k]<0) throw Error('모든 숫자는 0 이상의 유효한 값이어야 합니다.');
  if (!Number.isInteger(s.shares)) throw Error('보유수량은 정수로 입력하세요.');
  if (s.t >= s.splits) throw Error('T는 전체 분할수보다 작아야 합니다.');
  if (s.close <= 0 || (s.shares && s.avg <= 0)) throw Error('직전 종가와 보유 평단을 확인하세요.');
  if (s.bigPct<0 || s.bigPct>30 || s.depth>50) throw Error('큰수는 0~30%, 추가 주문 범위는 0~50%로 입력하세요.');
  if (!['auto','normal','reverse'].includes(s.mode)) throw Error('모드를 확인하세요.');
  if (s.mode==='normal' && s.shares>0 && s.t>s.splits-1) throw Error('남은 회차가 1 미만이면 리버스모드를 선택하세요.');
}
function ladder(budget, top, baseQty, low, rows) {
  let qty=baseQty;
  while(qty<10000){
    const price=floorPrice(budget/(qty+1));
    if(price<low || price<=0) break;
    if(price>=top){qty++;continue;}
    const count=Math.floor((budget+1e-8)/price);
    rows.push({side:'BUY',type:'LOC',price,qty:count-qty,reason:'하락 시 수량 보충'});
    qty=count;
  }
}
export function plan(s) {
  validate(s);
  const targetPct=s.symbol==='TQQQ'?15:20;
  const initial=s.shares===0;
  const mode=initial?'normal':s.mode==='auto'?(s.t>s.splits-1?'reverse':'normal'):s.mode;
  const firstReverse=mode==='reverse' && (s.reverseFirst || s.mode==='auto');
  let star=null,unit=null,buy=[],sell=[],notes=[],quarterQty;
  const low=s.close*(1-s.depth/100),big=floorPrice(s.close*(1+s.bigPct/100));
  if(mode==='reverse'){
    if(!firstReverse){
      const values=s.last5;
      if(!Array.isArray(values)||values.length!==5||values.some(x=>!Number.isFinite(x)||x<=0)) throw Error('리버스 2일차 이후는 직전 5거래일 종가 5개가 필요합니다.');
      star=roundPrice(values.reduce((a,b)=>a+b,0)/5);
    }
    quarterQty=Math.floor(s.shares/(s.splits/2));
    if(quarterQty<1) notes.push('리버스 매도수량이 1주 미만입니다. 소액 계좌의 처리 방식은 원문에 명확하지 않아 주문을 생성하지 않습니다.');
    unit=s.cash/4;
    const top=star===null?null:Math.min(roundPrice(star-0.01),big);
    const exhausted=!firstReverse && Math.floor(unit/top)<1;
    if(firstReverse||exhausted){
      if(quarterQty) sell.push({side:'SELL',type:'MOC',price:null,qty:quarterQty,reason:firstReverse?'리버스 첫날 현금 확보':'쿼터매수 1주 불가 · 재소진'});
      notes.push('오늘은 MOC 매도만 시도합니다. 체결 후에는 리버스 첫날 설정을 해제하세요.');
    }else{
      if(quarterQty) sell.push({side:'SELL',type:'LOC',price:star,qty:quarterQty,reason:'리버스 분할매도'});
      const q=Math.floor((unit+1e-8)/top);
      if(q) buy.push({side:'BUY',type:'LOC',price:top,qty:q,reason:'잔금의 1/4 매수'});
      ladder(unit,top,q,low,buy);
    }
    notes.push(`종가가 보유평단 × ${(1-targetPct/100).toFixed(2)}보다 높아지면 일반모드로 복귀합니다. T는 유지합니다.`);
  }else{
    unit=s.cash/(s.splits-s.t);
    const front=s.t<s.splits/2;
    star=initial?null:roundPrice(s.avg*(1+(targetPct*(1-2*s.t/s.splits))/100));
    if(initial){
      const q=Math.floor((unit+1e-8)/big);
      if(q)buy.push({side:'BUY',type:'LOC',price:big,qty:q,reason:'새 사이클 첫 매수'});
      ladder(unit,big,q,low,buy);
    }else{
      const top=Math.min(roundPrice(star-0.01),big);
      let q=Math.floor((unit*(front?0.5:1)+1e-8)/top);
      if(q)buy.push({side:'BUY',type:'LOC',price:top,qty:q,reason:front?'절반 · 별지점 또는 큰수':'전액 · 별지점 또는 큰수'});
      if(front){
        const second=Math.min(roundPrice(s.avg),top);
        const total=Math.floor((unit+1e-8)/second);
        if(total>q)buy.push({side:'BUY',type:'LOC',price:second,qty:total-q,reason:'평단 · 잔여 수량'});
        q=total;
        ladder(unit,second,q,low,buy);
      }else ladder(unit,top,q,low,buy);
      const quarter=Math.floor(s.shares/4);
      if(quarter)sell.push({side:'SELL',type:'LOC',price:star,qty:quarter,reason:'보유량 1/4 · 쿼터매도'});
      if(s.shares-quarter)sell.push({side:'SELL',type:'LIMIT',price:roundPrice(s.avg*(1+targetPct/100)),qty:s.shares-quarter,reason:`평단 +${targetPct}% · 잔여 매도`});
    }
    if(!buy.length)notes.push('1주 주문에 필요한 예산이 부족합니다. 소수점 주문은 지원하지 않습니다.');
  }
  // All equal-price orders are combined, including big-number replacements.
  buy=buy.reduce((out,row)=>{const old=out.find(x=>x.price===row.price);if(old){old.qty+=row.qty;old.reason+=' + '+row.reason;}else out.push({...row});return out;},[]);
  if(buy.some(x=>x.price===big))notes.push('큰수 기준은 주문 거부를 피하기 위한 보조값입니다. 현재 장세와 증권사 허용범위에 맞게 확인하세요.');
  return {mode,initial,front:s.t<s.splits/2,unit,star,targetPct,buy,sell,notes};
}
export function settle(s, p, events, buyFraction) {
  if(![0,0.5,1].includes(buyFraction))throw Error('매수 회차는 없음·절반·1회 중 선택하세요.');
  let n={...s,last5:[...(s.last5||[])]},basis=s.avg*s.shares,realized=0,soldKinds=new Set(),bought=false;
  const soldByType={};
  for(const e of events){
    if(!['BUY','SELL'].includes(e.side)||!['LOC','LIMIT','MOC'].includes(e.type)||!Number.isInteger(e.qty)||e.qty<=0||!Number.isFinite(e.price)||e.price<=0||!Number.isFinite(e.fee)||e.fee<0)throw Error('체결 수량·가격·수수료를 확인하세요.');
    if(e.side==='BUY'){
      const cost=e.qty*e.price+e.fee;
      if(cost>n.cash+1e-6)throw Error('매수금과 수수료가 잔금을 초과합니다.');
      n.cash-=cost; basis+=e.qty*e.price;n.shares+=e.qty;bought=true;
    }else{
      if(e.qty>n.shares)throw Error('매도 수량이 보유량을 초과합니다.');
      soldByType[e.type]=(soldByType[e.type]||0)+e.qty;
      const allowed=p.sell.filter(x=>x.type===e.type).reduce((v,x)=>v+x.qty,0);
      if(soldByType[e.type]>allowed)throw Error('해당 주문 종류의 매도 수량이 계산표를 초과합니다.');
      const avg=n.shares?basis/n.shares:0;
      const proceeds=e.qty*e.price-e.fee;
      n.cash+=proceeds;realized+=proceeds-avg*e.qty;basis-=avg*e.qty;n.shares-=e.qty;soldKinds.add(e.type);
    }
  }
  if(!events.length)throw Error('체결 기록을 하나 이상 입력하세요.');
  if(bought && !buyFraction)throw Error('매수 체결이 있으면 절반 또는 1회 매수 회차를 선택하세요.');
  if(!bought && buyFraction)throw Error('매수 체결이 없으면 매수 회차를 없음으로 선택하세요.');
  for(const [type,qty] of Object.entries(soldByType)){
    const expected=p.sell.filter(x=>x.type===type).reduce((v,x)=>v+x.qty,0);
    if(qty!==expected)throw Error('부분 매도는 T 갱신 규칙이 명확하지 않습니다. 계좌 상태를 직접 수정하세요.');
  }
  if(p.mode==='normal'){
    if(soldKinds.has('LIMIT') && soldKinds.has('LOC'))n.t=0;
    else if(soldKinds.has('LIMIT'))n.t*=0.25;
    else if(soldKinds.has('LOC'))n.t*=0.75;
    n.t+=buyFraction;
    if(n.t>s.splits-1){n.mode='reverse';n.reverseFirst=true;}
  }else{
    if(soldKinds.size)n.t*=s.splits===20?0.9:0.95;
    if(bought)n.t+=(s.splits-n.t)*0.25;
    n.reverseFirst=false;n.mode='reverse';
  }
  n.avg=n.shares?basis/n.shares:0;
  if(n.shares===0){n.t=0;n.mode='auto';n.reverseFirst=false;}
  return {state:n,realized};
}
