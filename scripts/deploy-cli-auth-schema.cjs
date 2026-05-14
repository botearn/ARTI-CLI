const { Client } = require("pg");

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("Missing DATABASE_URL");
}

const sql = `
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
`;

async function main() {
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  await client.query(sql);
  const { rows } = await client.query(
    "select to_regclass('public.cli_auth_sessions') as table_name",
  );
  console.log(JSON.stringify(rows[0]));
  await client.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
