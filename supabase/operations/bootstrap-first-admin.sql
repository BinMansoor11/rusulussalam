\set ON_ERROR_STOP on

begin;

select set_config('hc.bootstrap.email', :'admin_email', true) as input_email,
       set_config('hc.bootstrap.public_id', :'admin_public_id', true) as input_public_id
\gset

lock table public.profiles in share row exclusive mode;

do $$
declare
  target uuid;
begin
  if exists (select 1 from public.profiles where role = 'admin') then
    raise exception 'An administrator already exists';
  end if;

  select p.id into target
  from public.profiles p
  join auth.users u on u.id = p.id
  where p.role = 'visitor'
    and p.public_id = current_setting('hc.bootstrap.public_id')
    and lower(u.email) = lower(current_setting('hc.bootstrap.email'))
    and u.email_confirmed_at is not null
  for update of p, u;

  if target is null then
    raise exception 'The verified email and visitor public ID did not match an eligible account';
  end if;
  if exists (select 1 from public.conversations where visitor_id = target and status in ('waiting', 'active')) then
    raise exception 'End the visitor account''s open conversation first';
  end if;

  update public.profiles
  set role = 'admin', public_id = private.generate_public_id('admin')
  where id = target and role = 'visitor';
  if not found then raise exception 'Bootstrap did not update the intended account'; end if;
end;
$$;

select public_id as administrator_public_id from public.profiles where role = 'admin';
commit;
