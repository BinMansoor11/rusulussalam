begin;

create schema private;
revoke all on schema private from public, anon, authenticated, service_role;
grant usage on schema private to authenticated;

-- SECURITY DEFINER code assumes client roles cannot create competing RPCs.
revoke create on schema public from public, anon, authenticated, service_role;

create type public.user_role as enum ('visitor', 'volunteer', 'admin');
create type public.conversation_status as enum ('waiting', 'active', 'ended', 'flagged');
create type public.message_sender_role as enum ('visitor', 'volunteer');
create type public.report_reason as enum ('harassment', 'crisis_emergency', 'inappropriate', 'other');
create type public.report_status as enum ('pending', 'reviewed', 'escalated', 'dismissed');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  public_id text not null unique check (public_id ~ '^(VIS|VOL|ADM)-[0-9A-F]{12}$'),
  role public.user_role not null default 'visitor',
  created_at timestamptz not null default now()
);

create table public.volunteers (
  id uuid primary key references public.profiles(id) on delete cascade,
  supported_languages text[] not null default array['en'],
  is_available boolean not null default false,
  max_active_conversations integer not null default 2 check (max_active_conversations between 1 and 5),
  assignment_revision bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (array_ndims(supported_languages) = 1 and array_lower(supported_languages, 1) = 1
    and cardinality(supported_languages) between 1 and 2
    and supported_languages <@ array['en', 'ur']
    and (cardinality(supported_languages) = 1 or supported_languages[1] <> supported_languages[2]))
);

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  language text not null check (language in ('en', 'ur')),
  status public.conversation_status not null default 'waiting',
  visitor_id uuid references public.profiles(id) on delete set null,
  volunteer_id uuid references public.profiles(id) on delete set null,
  visitor_public_id text not null,
  volunteer_public_id text,
  created_at timestamptz not null default clock_timestamp(),
  started_at timestamptz,
  ended_at timestamptz,
  flagged_at timestamptz,
  ended_by text check (ended_by in ('visitor', 'volunteer', 'system')),
  check (status not in ('waiting', 'active') or visitor_id is not null),
  check (volunteer_id is null or volunteer_public_id is not null),
  check (visitor_id is null or volunteer_id is null or visitor_id <> volunteer_id),
  check (status <> 'active' or (volunteer_id is not null and started_at is not null)),
  check (status <> 'waiting' or (volunteer_id is null and started_at is null)),
  check ((status in ('ended', 'flagged')) = (ended_at is not null)),
  check ((ended_at is null) = (ended_by is null)),
  check ((status = 'flagged') = (flagged_at is not null))
);

create unique index conversations_one_open_per_visitor on public.conversations (visitor_id)
  where status in ('waiting', 'active');
create index conversations_visitor on public.conversations (visitor_id);
create index conversations_volunteer on public.conversations (volunteer_id, status);
create index conversations_waiting on public.conversations (language, created_at) where status = 'waiting';
create index conversations_waiting_expiry on public.conversations (created_at) where status = 'waiting';
create index conversations_ended_expiry on public.conversations (ended_at) where status = 'ended';
create index conversations_flagged_expiry on public.conversations (flagged_at) where status = 'flagged';

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid references public.profiles(id) on delete set null,
  sender_role public.message_sender_role not null,
  sender_public_id text not null,
  content text not null check (content ~ '[^[:space:]]' and char_length(content) <= 2000),
  created_at timestamptz not null default clock_timestamp()
);

create index messages_history on public.messages (conversation_id, created_at desc, id desc);
create index messages_sender on public.messages (sender_id);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references public.conversations(id) on delete set null,
  reporter_id uuid references public.profiles(id) on delete set null,
  reporter_role public.message_sender_role not null,
  reporter_public_id text not null,
  reported_public_id text,
  conversation_language text not null check (conversation_language in ('en', 'ur')),
  reason public.report_reason not null,
  notes text check (char_length(notes) <= 2000),
  status public.report_status not null default 'pending',
  admin_notes text check (char_length(admin_notes) <= 2000),
  created_at timestamptz not null default clock_timestamp(),
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles(id) on delete set null
);

create index reports_conversation on public.reports (conversation_id);
create index reports_reporter on public.reports (reporter_id);
create index reports_reviewer on public.reports (reviewed_by);
create index reports_created on public.reports (created_at desc, id desc);

create table public.cleanup_logs (
  id uuid primary key default gen_random_uuid(),
  status text not null check (status in ('success', 'failure')),
  details jsonb not null,
  executed_at timestamptz not null default clock_timestamp()
);
create index cleanup_logs_expiry on public.cleanup_logs (executed_at);

alter table public.profiles enable row level security;
alter table public.volunteers enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.reports enable row level security;
alter table public.cleanup_logs enable row level security;

revoke all on public.profiles, public.volunteers, public.conversations,
  public.messages, public.reports, public.cleanup_logs
  from public, anon, authenticated, service_role;

create function private.generate_public_id(p_role public.user_role)
returns text language sql volatile set search_path = ''
as $$
  select case p_role when 'admin' then 'ADM-' when 'volunteer' then 'VOL-' else 'VIS-' end
    || upper(left(replace(pg_catalog.gen_random_uuid()::text, '-', ''), 12));
$$;

create function private.handle_new_user()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  for attempt in 1..10 loop
    insert into public.profiles (id, public_id)
    values (new.id, private.generate_public_id('visitor'))
    on conflict (public_id) do nothing;
    if found then return new; end if;
  end loop;
  raise exception 'Could not allocate a public ID';
end;
$$;

create trigger human_connection_new_user
after insert on auth.users for each row execute function private.handle_new_user();

-- Run against a fresh project so preexisting identities are reviewed explicitly.
do $$
begin
  if exists (select 1 from auth.users) then
    raise exception 'Review existing auth users before installing Human Connection';
  end if;
end;
$$;

create function private.close_conversations_on_profile_delete()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  update public.conversations
  set status = 'ended', ended_at = clock_timestamp(), ended_by = 'system'
  where status in ('waiting', 'active') and (visitor_id = old.id or volunteer_id = old.id);
  return old;
end;
$$;

create trigger human_connection_profile_delete
before delete on public.profiles for each row execute function private.close_conversations_on_profile_delete();

create function private.require_role(p_role public.user_role)
returns void language plpgsql stable security definer set search_path = ''
as $$
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and role = p_role) then
    raise exception 'Access denied' using errcode = '42501';
  end if;
end;
$$;

create function private.conversation_payload(p_chat public.conversations)
returns jsonb language sql stable set search_path = ''
as $$
  select jsonb_build_object(
    'id', p_chat.id, 'language', p_chat.language, 'status', p_chat.status,
    'visitor_public_id', p_chat.visitor_public_id, 'volunteer_public_id', p_chat.volunteer_public_id,
    'created_at', p_chat.created_at, 'started_at', p_chat.started_at,
    'ended_at', p_chat.ended_at, 'ended_by', p_chat.ended_by
  );
$$;

create function private.message_payload(p_message public.messages)
returns jsonb language sql stable set search_path = ''
as $$
  select jsonb_build_object(
    'id', p_message.id, 'sender_role', p_message.sender_role,
    'sender_public_id', p_message.sender_public_id,
    'content', p_message.content, 'created_at', p_message.created_at
  );
$$;

create function private.enforce_message_integrity()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  chat public.conversations;
begin
  -- Match account deletion's profile-before-conversation lock order.
  perform 1 from public.profiles where id = auth.uid() for key share;
  if not found then raise exception 'Conversation unavailable' using errcode = '42501'; end if;
  select * into chat from public.conversations
  where id = new.conversation_id and auth.uid() in (visitor_id, volunteer_id)
  for update;
  if not found then raise exception 'Conversation unavailable' using errcode = '42501'; end if;
  if chat.status <> 'active' then raise exception 'Conversation is closed to messages'; end if;

  new.sender_id := auth.uid();
  if new.sender_id = chat.visitor_id then
    new.sender_role := 'visitor';
    new.sender_public_id := chat.visitor_public_id;
  else
    new.sender_role := 'volunteer';
    new.sender_public_id := chat.volunteer_public_id;
  end if;
  new.created_at := clock_timestamp();
  return new;
end;
$$;

create trigger human_connection_message_integrity
before insert on public.messages for each row execute function private.enforce_message_integrity();

create function private.broadcast_message_insert()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  perform realtime.send(jsonb_build_object('message_id', new.id),
    'new_message', 'conversation:' || new.conversation_id::text, true);
  return new;
end;
$$;

create trigger human_connection_message_broadcast
after insert on public.messages for each row execute function private.broadcast_message_insert();

create function private.broadcast_conversation_change()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  perform realtime.send(jsonb_build_object('conversation_id', new.id),
    'conversation_changed', 'conversation:' || new.id::text, true);
  return new;
end;
$$;

create trigger human_connection_status_broadcast
after update of status on public.conversations for each row
when (old.status is distinct from new.status)
execute function private.broadcast_conversation_change();

create function private.can_access_conversation_topic(p_topic text)
returns boolean language plpgsql stable security definer set search_path = ''
as $$
begin
  if p_topic is null or p_topic !~ '^conversation:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;
  return exists (
    select 1 from public.conversations
    where id = substring(p_topic from 14)::uuid
      and auth.uid() in (visitor_id, volunteer_id)
  );
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_class
    where oid = 'realtime.messages'::regclass and relrowsecurity
  ) then
    raise exception 'Realtime authorization requires RLS on realtime.messages';
  end if;
end;
$$;

create policy human_connection_broadcast_receive on realtime.messages
for select to authenticated
using (extension = 'broadcast' and topic = (select realtime.topic())
  and (select private.can_access_conversation_topic(realtime.topic())));

-- Protect chat topics even if other features add broader Realtime policies.
create policy human_connection_broadcast_receive_guard on realtime.messages
as restrictive for select to authenticated
using ((coalesce(topic, '') not like 'conversation:%'
    and coalesce((select realtime.topic()), '') not like 'conversation:%')
  or (extension = 'broadcast' and topic = (select realtime.topic())
    and (select private.can_access_conversation_topic(realtime.topic()))));

create policy human_connection_broadcast_anon_guard on realtime.messages
as restrictive for select to anon
using (coalesce(topic, '') not like 'conversation:%'
  and coalesce((select realtime.topic()), '') not like 'conversation:%');

create policy human_connection_broadcast_insert_guard on realtime.messages
as restrictive for insert to anon, authenticated
with check (coalesce(realtime.topic(), '') not like 'conversation:%'
  and coalesce(topic, '') not like 'conversation:%');

create function public.get_my_profile()
returns jsonb language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object('public_id', public_id, 'role', role, 'created_at', created_at)
  from public.profiles where id = auth.uid();
$$;

create function public.request_conversation(p_language text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  visitor public.profiles;
  candidate record;
  assigned_id uuid;
  assigned_public_id text;
  chat public.conversations;
begin
  if p_language is null or p_language not in ('en', 'ur') then
    raise exception 'Unsupported language';
  end if;
  select * into visitor from public.profiles where id = auth.uid() and role = 'visitor' for update;
  if not found then raise exception 'Access denied' using errcode = '42501'; end if;
  update public.conversations
  set status = 'ended', ended_at = clock_timestamp(), ended_by = 'system'
  where visitor_id = visitor.id and status = 'waiting'
    and created_at <= clock_timestamp() - interval '60 minutes';
  if exists (select 1 from public.conversations
    where visitor_id = visitor.id and status in ('waiting', 'active')) then
    raise exception 'An open conversation already exists';
  end if;

  for candidate in
    select v.id, v.max_active_conversations, p.public_id
    from public.volunteers v join public.profiles p on p.id = v.id
    where p.role = 'volunteer' and v.is_available and p_language = any(v.supported_languages)
    order by v.id
    for key share of p skip locked
    for update of v skip locked
  loop
    if (select count(*) from public.conversations where volunteer_id = candidate.id and status = 'active')
      < candidate.max_active_conversations then
      assigned_id := candidate.id;
      assigned_public_id := candidate.public_id;
      exit;
    end if;
  end loop;

  if assigned_id is null then
    insert into public.conversations (language, visitor_id, visitor_public_id)
    values (p_language, visitor.id, visitor.public_id) returning * into chat;
  else
    -- Write the locked capacity row so an older repeatable-read snapshot
    -- cannot assign based on a count that predates this transaction.
    update public.volunteers set assignment_revision = assignment_revision + 1
    where id = assigned_id;
    insert into public.conversations
      (language, status, visitor_id, visitor_public_id, volunteer_id, volunteer_public_id, started_at)
    values (p_language, 'active', visitor.id, visitor.public_id, assigned_id, assigned_public_id, clock_timestamp())
    returning * into chat;
  end if;
  return private.conversation_payload(chat);
end;
$$;

create function public.get_conversation(p_conversation_id uuid)
returns jsonb language sql stable security definer set search_path = ''
as $$
  select private.conversation_payload(c) from public.conversations c
  where c.id = p_conversation_id and auth.uid() in (c.visitor_id, c.volunteer_id);
$$;

create function public.get_my_conversations()
returns setof jsonb language sql stable security definer set search_path = ''
as $$
  select private.conversation_payload(c) from public.conversations c
  where auth.uid() in (c.visitor_id, c.volunteer_id)
  order by c.created_at desc, c.id desc;
$$;

create function public.get_messages(
  p_conversation_id uuid, p_before timestamptz default null, p_limit integer default 50,
  p_before_id uuid default null
)
returns setof jsonb language sql stable security definer set search_path = ''
as $$
  select private.message_payload(m)
  from public.messages m join public.conversations c on c.id = m.conversation_id
  where c.id = p_conversation_id and auth.uid() in (c.visitor_id, c.volunteer_id)
    and (p_before is null or m.created_at < p_before
      or (m.created_at = p_before and m.id < p_before_id))
  order by m.created_at desc, m.id desc
  limit greatest(1, least(coalesce(p_limit, 50), 100));
$$;

create function public.send_message(p_conversation_id uuid, p_content text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  message public.messages;
begin
  insert into public.messages (conversation_id, content)
  values (p_conversation_id, p_content) returning * into message;
  return private.message_payload(message);
end;
$$;

create function public.end_conversation(p_conversation_id uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  chat public.conversations;
begin
  select * into chat from public.conversations
  where id = p_conversation_id and auth.uid() in (visitor_id, volunteer_id)
  for update;
  if not found then raise exception 'Conversation unavailable' using errcode = '42501'; end if;
  if chat.status in ('waiting', 'active') then
    update public.conversations
    set status = 'ended', ended_at = clock_timestamp(),
        ended_by = case when auth.uid() = chat.visitor_id then 'visitor' else 'volunteer' end
    where id = chat.id returning * into chat;
  end if;
  return private.conversation_payload(chat);
end;
$$;

create function public.get_volunteer_queue()
returns setof jsonb language plpgsql stable security definer set search_path = ''
as $$
begin
  perform private.require_role('volunteer');
  return query
    select jsonb_build_object('id', c.id, 'language', c.language, 'created_at', c.created_at)
    from public.conversations c join public.volunteers v on v.id = auth.uid()
    where v.is_available and c.status = 'waiting' and c.language = any(v.supported_languages)
      and c.created_at > statement_timestamp() - interval '60 minutes'
      and (select count(*) from public.conversations a where a.volunteer_id = v.id and a.status = 'active')
        < v.max_active_conversations
    order by c.created_at, c.id limit 100;
end;
$$;

create function public.claim_conversation(p_conversation_id uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  settings public.volunteers;
  chat public.conversations;
  assignee_public_id text;
begin
  select public_id into assignee_public_id from public.profiles
  where id = auth.uid() and role = 'volunteer' for key share;
  if not found then raise exception 'Access denied' using errcode = '42501'; end if;
  select * into settings from public.volunteers where id = auth.uid() and is_available for update;
  if not found then raise exception 'Volunteer is unavailable'; end if;
  if (select count(*) from public.conversations where volunteer_id = settings.id and status = 'active')
    >= settings.max_active_conversations then
    raise exception 'Volunteer capacity reached';
  end if;
  update public.conversations c
  set status = 'active', volunteer_id = settings.id,
      volunteer_public_id = assignee_public_id,
      started_at = clock_timestamp()
  where c.id = p_conversation_id and c.status = 'waiting'
    and c.created_at > clock_timestamp() - interval '60 minutes'
    and c.language = any(settings.supported_languages)
  returning * into chat;
  if not found then raise exception 'Conversation unavailable'; end if;
  update public.volunteers set assignment_revision = assignment_revision + 1
  where id = settings.id;
  return private.conversation_payload(chat);
end;
$$;

create function public.get_my_volunteer_settings()
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
begin
  perform private.require_role('volunteer');
  return (select jsonb_build_object('supported_languages', supported_languages,
    'is_available', is_available, 'max_active_conversations', max_active_conversations)
    from public.volunteers where id = auth.uid());
end;
$$;

create function public.update_volunteer_settings(p_is_available boolean, p_supported_languages text[])
returns jsonb language plpgsql security definer set search_path = ''
as $$
begin
  perform private.require_role('volunteer');
  update public.volunteers set is_available = p_is_available,
    supported_languages = p_supported_languages, updated_at = clock_timestamp()
  where id = auth.uid();
  if not found then raise exception 'Volunteer settings unavailable'; end if;
  return public.get_my_volunteer_settings();
end;
$$;

create function public.submit_safeguarding_report(
  p_conversation_id uuid, p_reason public.report_reason, p_notes text default null
)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  chat public.conversations;
  reporter_is_visitor boolean;
  report_id uuid;
begin
  perform 1 from public.profiles where id = auth.uid() for key share;
  if not found then raise exception 'Conversation unavailable' using errcode = '42501'; end if;
  select * into chat from public.conversations
  where id = p_conversation_id and auth.uid() in (visitor_id, volunteer_id)
  for update;
  if not found then raise exception 'Conversation unavailable' using errcode = '42501'; end if;
  reporter_is_visitor := auth.uid() is not distinct from chat.visitor_id;
  insert into public.reports
    (conversation_id, reporter_id, reporter_role, reporter_public_id, reported_public_id,
     conversation_language, reason, notes)
  values (chat.id, auth.uid(),
    (case when reporter_is_visitor then 'visitor' else 'volunteer' end)::public.message_sender_role,
    case when reporter_is_visitor then chat.visitor_public_id else chat.volunteer_public_id end,
    case when reporter_is_visitor then chat.volunteer_public_id else chat.visitor_public_id end,
    chat.language, p_reason, p_notes)
  returning id into report_id;
  if p_reason in ('crisis_emergency', 'harassment') and chat.status <> 'flagged' then
    update public.conversations set status = 'flagged', flagged_at = clock_timestamp(),
      ended_at = coalesce(chat.ended_at, clock_timestamp()), ended_by = coalesce(chat.ended_by, 'system')
    where id = chat.id;
  end if;
  return report_id;
end;
$$;

create function public.admin_list_reports(
  p_status public.report_status default null, p_limit integer default 50,
  p_before timestamptz default null, p_before_id uuid default null
)
returns setof jsonb language plpgsql stable security definer set search_path = ''
as $$
begin
  perform private.require_role('admin');
  return query select jsonb_build_object(
    'id', r.id, 'conversation_id', r.conversation_id, 'language', r.conversation_language,
    'reporter_role', r.reporter_role, 'reporter_public_id', r.reporter_public_id,
    'reported_public_id', r.reported_public_id, 'reason', r.reason, 'notes', r.notes,
    'status', r.status, 'admin_notes', r.admin_notes,
    'created_at', r.created_at, 'reviewed_at', r.reviewed_at)
  from public.reports r
  where (p_status is null or r.status = p_status)
    and (p_before is null or r.created_at < p_before
      or (r.created_at = p_before and r.id < p_before_id))
  order by r.created_at desc, r.id desc
  limit greatest(1, least(coalesce(p_limit, 50), 100));
end;
$$;

create function public.admin_review_report(
  p_report_id uuid, p_status public.report_status, p_admin_notes text default null
)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  perform private.require_role('admin');
  if p_status is null or p_status = 'pending' then raise exception 'Invalid review status'; end if;
  update public.reports set status = p_status, admin_notes = p_admin_notes,
    reviewed_at = clock_timestamp(), reviewed_by = auth.uid()
  where id = p_report_id;
  if not found then raise exception 'Report unavailable'; end if;
end;
$$;

create function public.admin_promote_volunteer(
  p_public_id text, p_languages text[] default array['en'], p_max_chats integer default 2
)
returns text language plpgsql security definer set search_path = ''
as $$
declare
  target_id uuid;
  volunteer_public_id text;
begin
  perform private.require_role('admin');
  select id into target_id from public.profiles where public_id = p_public_id and role = 'visitor' for update;
  if not found then raise exception 'Eligible visitor unavailable'; end if;
  if exists (select 1 from public.conversations where visitor_id = target_id and status in ('waiting', 'active')) then
    raise exception 'Visitor has an open conversation';
  end if;
  for attempt in 1..10 loop
    volunteer_public_id := private.generate_public_id('volunteer');
    begin
      update public.profiles set role = 'volunteer', public_id = volunteer_public_id where id = target_id;
      insert into public.volunteers (id, supported_languages, max_active_conversations)
      values (target_id, p_languages, p_max_chats);
      return volunteer_public_id;
    exception when unique_violation then
      if attempt = 10 then raise; end if;
    end;
  end loop;
end;
$$;

create function public.purge_expired_data()
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  cutoff timestamptz := clock_timestamp();
  stale_waiting integer;
  purged_messages integer;
  purged_conversations integer;
  purged_reports integer;
  purged_logs integer;
  result jsonb;
begin
  if not pg_try_advisory_xact_lock(42086, 1) then
    return jsonb_build_object('status', 'skipped', 'reason', 'cleanup_in_progress');
  end if;

  update public.conversations set status = 'ended', ended_at = cutoff, ended_by = 'system'
  where status = 'waiting' and created_at <= cutoff - interval '60 minutes';
  get diagnostics stale_waiting = row_count;

  -- Lock eligible conversations before deleting messages so a concurrent flag
  -- either applies its longer retention tier first or waits for cleanup.
  with expired as materialized (
    select id from public.conversations
    where (status = 'ended' and ended_at <= cutoff - interval '14 days')
       or (status = 'flagged' and flagged_at <= cutoff - interval '90 days')
    for update
  )
  delete from public.messages m using expired e where m.conversation_id = e.id;
  get diagnostics purged_messages = row_count;

  delete from public.conversations
  where (status = 'ended' and ended_at <= cutoff - interval '30 days')
     or (status = 'flagged' and flagged_at <= cutoff - interval '180 days');
  get diagnostics purged_conversations = row_count;

  delete from public.reports where created_at <= cutoff - interval '365 days';
  get diagnostics purged_reports = row_count;
  delete from public.cleanup_logs where executed_at <= cutoff - interval '365 days';
  get diagnostics purged_logs = row_count;

  result := jsonb_build_object('status', 'success', 'closed_waiting', stale_waiting,
    'purged_messages', purged_messages, 'purged_conversations', purged_conversations,
    'purged_reports', purged_reports, 'purged_logs', purged_logs);
  insert into public.cleanup_logs (status, details) values ('success', result);
  return result;
exception when others then
  -- PL/pgSQL rolls back the cleanup block before recording this failure.
  result := jsonb_build_object('status', 'failure', 'sqlstate', sqlstate);
  insert into public.cleanup_logs (status, details) values ('failure', result);
  return result;
end;
$$;

revoke execute on all functions in schema private from public, anon, authenticated, service_role;
grant execute on function private.can_access_conversation_topic(text) to authenticated;

revoke execute on function
  public.get_my_profile(), public.request_conversation(text), public.get_conversation(uuid),
  public.get_my_conversations(), public.get_messages(uuid, timestamptz, integer, uuid),
  public.send_message(uuid, text), public.end_conversation(uuid), public.get_volunteer_queue(),
  public.claim_conversation(uuid), public.get_my_volunteer_settings(),
  public.update_volunteer_settings(boolean, text[]),
  public.submit_safeguarding_report(uuid, public.report_reason, text),
  public.admin_list_reports(public.report_status, integer, timestamptz, uuid),
  public.admin_review_report(uuid, public.report_status, text),
  public.admin_promote_volunteer(text, text[], integer), public.purge_expired_data()
  from public, anon, authenticated, service_role;

grant execute on function
  public.get_my_profile(), public.request_conversation(text), public.get_conversation(uuid),
  public.get_my_conversations(), public.get_messages(uuid, timestamptz, integer, uuid),
  public.send_message(uuid, text), public.end_conversation(uuid), public.get_volunteer_queue(),
  public.claim_conversation(uuid), public.get_my_volunteer_settings(),
  public.update_volunteer_settings(boolean, text[]),
  public.submit_safeguarding_report(uuid, public.report_reason, text),
  public.admin_list_reports(public.report_status, integer, timestamptz, uuid),
  public.admin_review_report(uuid, public.report_status, text),
  public.admin_promote_volunteer(text, text[], integer)
  to authenticated;

grant execute on function public.purge_expired_data() to service_role;

commit;
