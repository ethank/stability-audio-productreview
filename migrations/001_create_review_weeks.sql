create table if not exists review_weeks (
  week_start date primary key,
  payload jsonb not null,
  status text not null default 'draft',
  locked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists review_weeks_status_idx
  on review_weeks (status);

create index if not exists review_weeks_updated_at_idx
  on review_weeks (updated_at desc);

create index if not exists review_weeks_payload_gin_idx
  on review_weeks using gin (payload);
