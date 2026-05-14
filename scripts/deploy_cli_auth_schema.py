import json
import os

import psycopg


SQL = """
create table if not exists cli_auth_sessions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  poll_token text not null unique,
  status text not null default 'pending' check (status in ('pending', 'approved', 'expired', 'consumed')),
  user_id uuid references auth.users(id) on delete set null,
  email text,
  access_token text,
  refresh_token text,
  expires_at bigint,
  consumed_at timestamptz,
  expires_at_ts timestamptz not null default (now() + interval '10 minutes'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_cli_auth_sessions_code on cli_auth_sessions (code);
create index if not exists idx_cli_auth_sessions_status on cli_auth_sessions (status);

alter table cli_auth_sessions enable row level security;

drop policy if exists "cli auth sessions no direct access" on cli_auth_sessions;
create policy "cli auth sessions no direct access"
on cli_auth_sessions
for all
to authenticated, anon
using (false)
with check (false);
"""


def main() -> None:
    database_url = os.environ["DATABASE_URL"]
    with psycopg.connect(database_url, sslmode="require") as conn:
        with conn.cursor() as cur:
            cur.execute(SQL)
            cur.execute("select to_regclass('public.cli_auth_sessions')")
            table_name = cur.fetchone()[0]
        conn.commit()
    print(json.dumps({"table_name": table_name}))


if __name__ == "__main__":
    main()
