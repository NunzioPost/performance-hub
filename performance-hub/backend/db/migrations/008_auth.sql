create table if not exists auth_users (
  id bigserial primary key,
  email text not null unique,
  password_hash text not null,
  name text not null,
  role text not null check (role in ('admin', 'user')),
  active boolean not null default true,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_auth_users_email_lower
on auth_users ((lower(email)));

create table if not exists auth_sessions (
  id bigserial primary key,
  user_id bigint not null references auth_users(id) on delete cascade,
  token_hash text not null unique,
  ip text,
  user_agent text,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists idx_auth_sessions_lookup
on auth_sessions (token_hash, revoked_at, expires_at);

create index if not exists idx_auth_sessions_user
on auth_sessions (user_id, created_at desc);
