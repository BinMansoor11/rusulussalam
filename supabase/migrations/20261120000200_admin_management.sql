begin;

drop function public.admin_promote_volunteer(text, text[], integer);

create function public.admin_assignment_dashboard()
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
begin
  perform private.require_role('admin');
  return (
    with accounts as (
      select p.id, p.public_id, p.full_name, u.email, p.role, p.conversation_language,
        p.application_status, u.email_confirmed_at is not null as verified
      from public.profiles p join auth.users u on u.id = p.id where p.role <> 'admin'
    ), open_chats as (
      select id, visitor_id, volunteer_id, visitor_public_id, volunteer_public_id, language, status
      from public.conversations where status = 'active' or (status = 'waiting' and created_at > now() - interval '1 hour')
    ), capacity as (
      select a.*, v.supported_languages, v.max_active_conversations as capacity, count(c.id) as active_count
      from accounts a join public.volunteers v on v.id = a.id
      left join open_chats c on c.volunteer_id = v.id and c.status = 'active'
      where a.role = 'volunteer' and coalesce(a.application_status, 'approved') = 'approved' and v.is_available
      group by a.id, a.public_id, a.full_name, a.email, a.role, a.conversation_language,
        a.application_status, a.verified, v.supported_languages, v.max_active_conversations
      having count(c.id) < v.max_active_conversations
    )
    select jsonb_build_object(
      'users', coalesce((select jsonb_agg(a order by a.public_id) from accounts a), '[]'::jsonb),
      'capacity', coalesce((select jsonb_agg(v order by v.active_count, v.public_id) from capacity v), '[]'::jsonb),
      'conversations', coalesce((select jsonb_agg(c order by c.visitor_public_id) from open_chats c), '[]'::jsonb)
    )
  );
end;
$$;

revoke all on function public.admin_assignment_dashboard() from public, anon, authenticated, service_role;
grant execute on function public.admin_assignment_dashboard() to authenticated;

commit;
