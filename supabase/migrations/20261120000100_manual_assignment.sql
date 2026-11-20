begin;

alter table public.conversations drop constraint conversations_language_check;
alter table public.conversations add check (language in ('en', 'ur', 'ar', 'ps', 'sd'));
alter table public.reports drop constraint reports_conversation_language_check;
alter table public.reports add check (conversation_language in ('en', 'ur', 'ar', 'ps', 'sd'));
alter table public.conversations add column admin_removed_role public.message_sender_role;

create function public.set_initial_conversation_language(p_language text)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  perform private.require_role('visitor');
  if p_language is null or p_language not in ('en', 'ur', 'ar', 'ps', 'sd') then
    raise exception 'Unsupported language';
  end if;
  update public.profiles set conversation_language = p_language
  where id = auth.uid() and conversation_language is null;
  if not found then raise exception 'Conversation language is already set'; end if;
end;
$$;

drop function public.request_conversation(text);
create function public.request_conversation()
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  visitor public.profiles;
  chat public.conversations;
begin
  perform private.require_role('visitor');
  select * into visitor from public.profiles where id = auth.uid() for update;
  select * into chat from public.conversations
  where visitor_id = visitor.id and status in ('waiting', 'active');
  if found then return private.conversation_payload(chat); end if;
  if visitor.conversation_language is null then raise exception 'Set conversation language first'; end if;
  insert into public.conversations (visitor_id, visitor_public_id, language)
  values (visitor.id, visitor.public_id, visitor.conversation_language) returning * into chat;
  return private.conversation_payload(chat);
end;
$$;

drop function public.claim_conversation(uuid);
drop function public.get_volunteer_queue();

create function public.admin_assign_conversation(p_conversation_id uuid, p_volunteer_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  settings public.volunteers;
  chat public.conversations;
  selected_public_id text;
begin
  perform private.require_role('admin');
  select public_id into selected_public_id from public.profiles
  where id = p_volunteer_id and role = 'volunteer' and coalesce(application_status, 'approved') = 'approved'
  for key share;
  if not found then raise exception 'Volunteer unavailable'; end if;
  select * into settings from public.volunteers where id = p_volunteer_id for update;
  if not found or not settings.is_available then raise exception 'Volunteer unavailable'; end if;

  select * into chat from public.conversations where id = p_conversation_id and status = 'waiting'
    and created_at > clock_timestamp() - interval '1 hour' for update;
  if not found then raise exception 'Request is no longer waiting'; end if;
  if not (chat.language = any(settings.supported_languages)) then raise exception 'Language mismatch'; end if;
  if (select count(*) from public.conversations where volunteer_id = p_volunteer_id and status = 'active')
    >= settings.max_active_conversations then raise exception 'Volunteer capacity reached'; end if;

  update public.conversations set volunteer_id = p_volunteer_id,
    volunteer_public_id = selected_public_id,
    status = 'active', started_at = clock_timestamp() where id = chat.id;
  update public.volunteers set assignment_revision = assignment_revision + 1 where id = p_volunteer_id;
end;
$$;

create function public.admin_remove_participant(p_conversation_id uuid, p_role public.message_sender_role)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  chat public.conversations;
begin
  perform private.require_role('admin');
  if p_role is null then raise exception 'Choose a participant'; end if;
  perform 1 from public.profiles where id = (
    select visitor_id from public.conversations where id = p_conversation_id
  ) for update;
  if not found then raise exception 'Visitor unavailable'; end if;
  update public.conversations set status = 'ended', ended_at = clock_timestamp(), ended_by = 'system',
    admin_removed_role = p_role,
    visitor_id = case when p_role = 'visitor' then null else visitor_id end,
    volunteer_id = case when p_role = 'volunteer' then null else volunteer_id end
  where id = p_conversation_id and status = 'active' returning * into chat;
  if not found then raise exception 'Conversation is no longer active'; end if;
  if p_role = 'volunteer' then
    insert into public.conversations (visitor_id, visitor_public_id, language)
    values (chat.visitor_id, chat.visitor_public_id, chat.language);
  end if;
end;
$$;

revoke all on function public.request_conversation(), public.set_initial_conversation_language(text),
  public.admin_assign_conversation(uuid, uuid), public.admin_remove_participant(uuid, public.message_sender_role)
  from public, anon, authenticated, service_role;
grant execute on function public.request_conversation(), public.set_initial_conversation_language(text),
  public.admin_assign_conversation(uuid, uuid), public.admin_remove_participant(uuid, public.message_sender_role)
  to authenticated;

commit;
