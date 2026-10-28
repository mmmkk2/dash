-- ① Supabase SQL Editor에서 이 파일 전체 실행

-- 자산 목록
create table if not exists assets (
  id            bigint primary key,
  name          text not null,
  cat           text not null,
  amount        bigint not null,
  memo          text default '',
  date          text not null,
  institution   text default null,
  account_suffix text default null
);
alter table assets disable row level security;

-- 주식 종목
create table if not exists stocks (
  id             bigint primary key,
  ticker         text not null,
  name           text not null,
  market         text not null,
  shares         numeric not null,
  avg_price      numeric not null,
  current_price  numeric default null,
  last_fetched   text default null,
  purchase_date  text default null,
  institution    text default null,
  account_suffix text default null
);
alter table stocks disable row level security;

-- stocks 테이블에 기관/계좌 컬럼 추가 (기존 DB에 아래 실행)
-- alter table stocks add column if not exists institution    text default null;
-- alter table stocks add column if not exists account_suffix text default null;

-- 이미지 첨부 기능 (기존 DB에 아래 실행)
-- alter table transactions add column if not exists images jsonb default '[]';
-- insert into storage.buckets (id, name, public) values ('tx-images', 'tx-images', true) on conflict (id) do nothing;
-- create policy "tx-images read"   on storage.objects for select using (bucket_id = 'tx-images');
-- create policy "tx-images insert" on storage.objects for insert with check (bucket_id = 'tx-images');
-- create policy "tx-images delete" on storage.objects for delete using (bucket_id = 'tx-images');

-- 거래 내역
create table if not exists transactions (
  id          bigint primary key,
  entity      text not null,
  cat1        text not null,
  cat2        text not null,
  cat3        text default '',
  amount      integer not null,
  memo        text default '',
  date        text not null,
  card_id     text default '',
  is_fixed    boolean default false,
  fixed_day   integer default null,  -- 매월 발생일 (1~31)
  type        text not null check (type in ('income','expense')),
  created_at  timestamptz default now()
);

-- 카드 목록
create table if not exists cards (
  id         text primary key,
  name       text not null,
  color      text not null,
  sort_order integer default 0,
  created_at timestamptz default now()
);

-- RLS 비활성화 (개인용 앱이므로)
alter table transactions disable row level security;
alter table cards disable row level security;

-- 소모품 관리 (앤딩스터디카페 전용)
create table if not exists supplies (
  id          text primary key,
  name        text not null,
  category    text default '기타',
  cycle_days  integer not null,       -- 평균 소진 주기 (일)
  last_bought text not null,          -- 마지막 구매일 (YYYY-MM-DD)
  memo        text default '',
  created_at  timestamptz default now()
);
alter table supplies disable row level security;

-- 기본 소모품 데이터
insert into supplies (id, name, category, cycle_days, last_bought) values
  ('s1', '원두', '음료재료', 14, current_date::text),
  ('s2', '컵/빨대', '소모품', 30, current_date::text),
  ('s3', '청소용품', '청소', 30, current_date::text),
  ('s4', '화장지', '소모품', 20, current_date::text)
on conflict (id) do nothing;

-- 앱 설정 (카테고리 트리 등 기기 간 동기화)
create table if not exists settings (
  key   text primary key,
  value jsonb not null
);
alter table settings disable row level security;

-- 경매 스냅샷 (매매사업자 경매 계산기)
create table if not exists auction_snapshots (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users not null default auth.uid(),
  name        text not null,
  saved_at    timestamptz default now(),
  prop_name   text,
  bid_price   bigint,
  hold_months integer,
  tax_label   text,
  scenarios   jsonb
);
alter table auction_snapshots enable row level security;
create policy "본인 데이터만" on auction_snapshots for all using (auth.uid() = user_id);

-- 기본 카드 데이터
insert into cards (id, name, color, sort_order) values
  ('c1', '삼성 iD 달달하린',           '#1a1410', 1),
  ('c2', '신한 Marriott Bonvoy',        '#1d4e89', 2),
  ('c3', '현대 아메리칸익스프레스 Gold', '#b5451b', 3),
  ('c4', '카카오뱅크 BUSINESS 현대',    '#b8860b', 4),
  ('c5', 'KT NU Plus 우리',             '#2d6a4f', 5),
  ('c6', '네이버 현대',                 '#4a1942', 6),
  ('c7', '쿠팡 Wow',                    '#7b2d00', 7),
  ('c8', '현금',                        '#4a3f35', 8)
on conflict (id) do nothing;

-- 메모 (본인 데이터만)
create table if not exists memos (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users not null default auth.uid(),
  title       text default '',
  content     text default '',
  color       text default '#177864',
  pinned      boolean default false,
  due_date    text default null,      -- 마감일 YYYY-MM-DD (선택)
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);
alter table memos enable row level security;
-- 마감일 기능 (기존 DB에 아래 실행)
-- alter table memos add column if not exists due_date text default null;
create policy "본인 메모만" on memos for all using (auth.uid() = user_id);

-- 일정 (본인 데이터만)
create table if not exists events (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users not null default auth.uid(),
  date        text not null,          -- YYYY-MM-DD
  time        text default null,      -- HH:MM
  title       text not null,
  memo        text default '',
  color       text default '#177864',
  done        boolean default false,
  created_at  timestamptz default now()
);
alter table events enable row level security;
create policy "본인 일정만" on events for all using (auth.uid() = user_id);

-- 생리 기록 (본인 데이터만)
create table if not exists periods (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users not null default auth.uid(),
  start_date  text not null,          -- YYYY-MM-DD
  end_date    text default null,      -- 비어 있으면 진행 중
  created_at  timestamptz default now()
);
alter table periods enable row level security;
create policy "본인 생리 기록만" on periods for all using (auth.uid() = user_id);

-- 관계일 기록 (본인 데이터만)
create table if not exists intimacy_logs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users not null default auth.uid(),
  date        text not null,          -- YYYY-MM-DD
  created_at  timestamptz default now(),
  unique (user_id, date)
);
alter table intimacy_logs enable row level security;
create policy "본인 관계 기록만" on intimacy_logs for all using (auth.uid() = user_id);

-- 메모 사진 첨부 (비공개 버킷, '<user id>/파일' 경로로 본인 것만 접근)
alter table memos add column if not exists images jsonb default '[]';
insert into storage.buckets (id, name, public) values ('memo-images', 'memo-images', false) on conflict (id) do nothing;
create policy "memo-images 본인 읽기" on storage.objects for select to authenticated
  using (bucket_id = 'memo-images' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "memo-images 본인 올리기" on storage.objects for insert to authenticated
  with check (bucket_id = 'memo-images' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "memo-images 본인 삭제" on storage.objects for delete to authenticated
  using (bucket_id = 'memo-images' and (storage.foldername(name))[1] = auth.uid()::text);

-- 메모 사업자 태그 (personal / cafe / realty / goion, 없으면 null)
alter table memos add column if not exists tag text default null;

-- 일정 사업자 태그 (메모와 같은 personal / cafe / realty / goion, 없으면 null)
alter table events add column if not exists tag text default null;
