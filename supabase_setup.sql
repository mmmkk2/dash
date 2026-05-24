-- ① Supabase SQL Editor에서 이 파일 전체 실행

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
