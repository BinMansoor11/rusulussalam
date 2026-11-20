begin;

create table private.conversation_read_positions (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  reader_id uuid not null references public.profiles(id) on delete cascade,
  message_at timestamptz not null,
  message_id uuid not null,
  primary key (conversation_id, reader_id)
);

alter table private.conversation_read_positions enable row level security;
revoke all on private.conversation_read_positions from public, anon, authenticated, service_role;

create function public.get_unread_conversation_counts()
returns table (conversation_id uuid, unread_count bigint)
language sql stable security definer set search_path = ''
as $$
  select c.id, count(*)
  from public.conversations c
  join public.messages m on m.conversation_id = c.id
  left join private.conversation_read_positions r on r.conversation_id = c.id and r.reader_id = auth.uid()
  where c.status = 'active' and auth.uid() in (c.visitor_id, c.volunteer_id)
    and m.sender_role = case when c.visitor_id = auth.uid()
      then 'volunteer'::public.message_sender_role else 'visitor'::public.message_sender_role end
    and (r.reader_id is null or (m.created_at, m.id) > (r.message_at, r.message_id))
  group by c.id;
$$;

create function public.mark_conversation_read(p_conversation_id uuid, p_message_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  reader uuid := auth.uid();
begin
  perform 1 from public.conversations
  where id = p_conversation_id and status = 'active' and reader in (visitor_id, volunteer_id)
  for share;
  if not found then raise exception 'Conversation unavailable' using errcode = '42501'; end if;

  insert into private.conversation_read_positions as position (conversation_id, reader_id, message_at, message_id)
  select p_conversation_id, reader, created_at, id
  from public.messages where conversation_id = p_conversation_id and id = p_message_id
  on conflict (conversation_id, reader_id) do update
  set message_at = excluded.message_at, message_id = excluded.message_id
  where (position.message_at, position.message_id) < (excluded.message_at, excluded.message_id);
end;
$$;

revoke all on function public.get_unread_conversation_counts(), public.mark_conversation_read(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.get_unread_conversation_counts(), public.mark_conversation_read(uuid, uuid)
  to authenticated;

commit;
