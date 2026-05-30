create sequence if not exists escrow_number_seq start with 2401;

create table if not exists users (
    id text primary key,
    full_name text not null,
    email text not null unique,
    password_hash text not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists users_email_idx on users (email);

create table if not exists user_sessions (
    id bigserial primary key,
    user_id text not null references users (id) on delete cascade,
    token text not null unique,
    expires_at timestamptz not null,
    created_at timestamptz not null default now()
);

create index if not exists user_sessions_user_id_idx on user_sessions (user_id);
create index if not exists user_sessions_expires_at_idx on user_sessions (expires_at);

create table if not exists escrows (
    id text primary key,
    buyer_name text not null,
    seller_name text not null,
    buyer_email text not null,
    seller_email text not null,
    amount numeric(14, 2) not null check (amount > 0),
    status text not null check (status in ('pending', 'review', 'completed')),
    condition text not null,
    inspection_days integer not null default 5 check (inspection_days > 0),
    item text not null,
    terms jsonb not null default '{}'::jsonb,
    dispatch_proof jsonb not null default '{}'::jsonb,
    dispute jsonb not null default '{}'::jsonb,
    note text not null,
    initiator_role text not null check (initiator_role in ('buyer', 'seller')),
    creator_user_id text references users (id) on delete set null,
    creation_mode text not null default 'guest' check (creation_mode in ('guest', 'account')),
    lifecycle jsonb not null default '{
        "buyerAccepted": false,
        "sellerAccepted": false,
        "paymentInitialized": false,
        "paymentConfirmed": false,
        "withdrawalRequested": false,
        "funded": false,
        "dispatched": false,
        "delivered": false,
        "disputed": false,
        "released": false,
        "withdrawn": false
    }'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists escrows_buyer_email_idx on escrows (buyer_email);
create index if not exists escrows_seller_email_idx on escrows (seller_email);
create index if not exists escrows_status_idx on escrows (status);
create index if not exists escrows_created_at_idx on escrows (created_at desc);

alter table escrows add column if not exists creator_user_id text references users (id) on delete set null;
alter table escrows add column if not exists creation_mode text not null default 'guest';
alter table escrows add column if not exists terms jsonb not null default '{}'::jsonb;
alter table escrows add column if not exists dispatch_proof jsonb not null default '{}'::jsonb;
alter table escrows add column if not exists dispute jsonb not null default '{}'::jsonb;
alter table escrows alter column lifecycle set default '{
    "buyerAccepted": false,
    "sellerAccepted": false,
    "paymentInitialized": false,
    "paymentConfirmed": false,
    "withdrawalRequested": false,
    "funded": false,
    "dispatched": false,
    "delivered": false,
    "disputed": false,
    "released": false,
    "withdrawn": false
}'::jsonb;
create index if not exists escrows_creator_user_id_idx on escrows (creator_user_id);

create table if not exists escrow_otps (
    escrow_id text not null references escrows (id) on delete cascade,
    email text not null,
    code text not null,
    expires_at timestamptz not null,
    created_at timestamptz not null default now(),
    primary key (escrow_id, email)
);

create index if not exists escrow_otps_expires_at_idx on escrow_otps (expires_at);

create table if not exists escrow_sessions (
    id bigserial primary key,
    escrow_id text not null references escrows (id) on delete cascade,
    email text not null,
    token text not null unique,
    expires_at timestamptz not null,
    created_at timestamptz not null default now()
);

create index if not exists escrow_sessions_escrow_id_idx on escrow_sessions (escrow_id);
create index if not exists escrow_sessions_expires_at_idx on escrow_sessions (expires_at);

create table if not exists escrow_events (
    id text primary key,
    escrow_id text not null references escrows (id) on delete cascade,
    type text not null,
    actor_email text,
    message text not null,
    created_at timestamptz not null default now()
);

create index if not exists escrow_events_escrow_id_idx on escrow_events (escrow_id);
create index if not exists escrow_events_created_at_idx on escrow_events (created_at desc);

create table if not exists payment_initializations (
    id text primary key,
    escrow_id text not null references escrows (id) on delete cascade,
    provider text not null check (provider in ('simulated', 'paystack')),
    provider_reference text not null,
    status text not null check (status in ('initialized', 'verified', 'failed')),
    amount numeric(14, 2) not null check (amount > 0),
    buyer_email text not null,
    authorization_url text,
    raw_response jsonb not null default '{}'::jsonb,
    verified_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (provider, provider_reference)
);

create index if not exists payment_initializations_escrow_id_idx on payment_initializations (escrow_id);
create index if not exists payment_initializations_status_idx on payment_initializations (status);

create table if not exists withdrawal_requests (
    id text primary key,
    escrow_id text not null references escrows (id) on delete cascade,
    seller_email text not null,
    seller_user_id text references users (id) on delete set null,
    amount numeric(14, 2) not null check (amount > 0),
    status text not null check (status in ('requested', 'approved', 'processing', 'paid', 'rejected', 'failed', 'cancelled')),
    payout_destination jsonb not null default '{}'::jsonb,
    provider text,
    provider_reference text,
    raw_response jsonb not null default '{}'::jsonb,
    failure_reason text,
    requested_at timestamptz not null default now(),
    approved_at timestamptz,
    processing_at timestamptz,
    paid_at timestamptz,
    rejected_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists withdrawal_requests_escrow_id_idx on withdrawal_requests (escrow_id);
create index if not exists withdrawal_requests_seller_email_idx on withdrawal_requests (seller_email);
create index if not exists withdrawal_requests_status_idx on withdrawal_requests (status);
create unique index if not exists withdrawal_requests_active_escrow_idx
on withdrawal_requests (escrow_id)
where status in ('requested', 'approved', 'processing', 'paid');
