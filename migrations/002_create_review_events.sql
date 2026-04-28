create table if not exists review_events (
  id bigserial primary key,
  week_start date not null references review_weeks (week_start) on delete cascade,
  event_type text not null,
  actor text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists review_events_week_start_created_at_idx
  on review_events (week_start, created_at desc);

create index if not exists review_events_event_type_idx
  on review_events (event_type);
