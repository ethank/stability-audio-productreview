create table if not exists review_users (
  id bigserial primary key,
  email text not null unique,
  name text not null,
  role text not null default 'editor' check (role in ('admin', 'editor', 'viewer')),
  password_hash text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists review_users_role_idx
  on review_users (role);

create index if not exists review_users_active_idx
  on review_users (active);
