begin;

create function public.admin_conversation_history(p_offset integer, p_conversation_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare
  history jsonb;
  selected jsonb;
begin
  perform private.require_role('admin');
  select coalesce(jsonb_agg(row order by row.ended_at desc, row.id desc), '[]'::jsonb) into history
  from (
    select c.id, c.visitor_public_id, c.volunteer_public_id, c.language, c.status,
      c.started_at, c.ended_at, c.admin_removed_role,
      (select r.status from public.reports r where r.conversation_id = c.id
       order by r.created_at desc, r.id desc limit 1) as report_status
    from public.conversations c
    where c.status in ('ended', 'flagged')
    order by c.ended_at desc, c.id desc
    limit 26 offset greatest(coalesce(p_offset, 0), 0)
  ) row;

  if p_conversation_id is not null then
    select jsonb_build_object('id', c.id, 'expired', expiry.at <= now(), 'messages',
      case when expiry.at > now() then coalesce((
        select jsonb_agg(private.message_payload(m) order by m.created_at, m.id)
        from public.messages m where m.conversation_id = c.id
      ), '[]'::jsonb) else '[]'::jsonb end)
    into selected
    from public.conversations c
    cross join lateral (select case when c.status = 'flagged' then c.flagged_at + interval '90 days'
      else c.ended_at + interval '14 days' end as at) expiry
    where c.id = p_conversation_id and c.status in ('ended', 'flagged');
  end if;

  return jsonb_build_object('conversations', history, 'transcript', selected);
end;
$$;

revoke all on function public.admin_conversation_history(integer, uuid) from public, anon, authenticated, service_role;
grant execute on function public.admin_conversation_history(integer, uuid) to authenticated;

commit;
