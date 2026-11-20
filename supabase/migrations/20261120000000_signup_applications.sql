begin;

create type public.volunteer_application_status as enum ('pending', 'approved', 'rejected');

alter table public.profiles
  add column full_name text check (char_length(full_name) between 1 and 120),
  add column conversation_language text check (conversation_language in ('en', 'ur', 'ar', 'ps', 'sd')),
  add column application_status public.volunteer_application_status;

update public.profiles set application_status = 'approved' where role = 'volunteer';

alter table public.volunteers drop constraint if exists volunteers_check;
alter table public.volunteers drop constraint if exists volunteers_supported_languages_check;
alter table public.volunteers add constraint volunteers_supported_languages_check check (
  array_ndims(supported_languages) = 1 and array_lower(supported_languages, 1) = 1
  and cardinality(supported_languages) between 1 and 2
  and supported_languages <@ array['en', 'ur', 'ar', 'ps', 'sd']
  and (cardinality(supported_languages) = 1 or supported_languages[1] <> supported_languages[2])
);

create or replace function private.handle_new_user()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  signup jsonb := new.raw_user_meta_data;
  signup_role public.user_role := 'visitor';
  signup_name text;
  signup_language text;
  signup_status public.volunteer_application_status;
begin
  if signup ? 'signup_role' then
    signup_name := nullif(btrim(signup->>'full_name'), '');
    signup_language := signup->>'conversation_language';
    if signup_name is null or signup_name !~ '[^[:space:]]' or char_length(signup_name) > 120
      or signup_language is null or signup_language not in ('en', 'ur', 'ar', 'ps', 'sd')
      or signup->>'signup_role' is null or signup->>'signup_role' not in ('visitor', 'volunteer') then
      raise exception 'Invalid signup profile';
    end if;
    signup_role := (signup->>'signup_role')::public.user_role;
    if signup_role = 'volunteer' then signup_status := 'pending'; end if;
  end if;

  for attempt in 1..10 loop
    insert into public.profiles (id, public_id, role, full_name, conversation_language, application_status)
    values (new.id, private.generate_public_id(signup_role), signup_role, signup_name, signup_language, signup_status)
    on conflict (public_id) do nothing;
    if found then return new; end if;
  end loop;
  raise exception 'Could not allocate a public ID';
end;
$$;

create or replace function private.require_role(p_role public.user_role)
returns void language plpgsql stable security definer set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.profiles where id = auth.uid() and role = p_role
      and (p_role <> 'volunteer' or coalesce(application_status, 'approved') = 'approved')
  ) then
    raise exception 'Access denied' using errcode = '42501';
  end if;
end;
$$;

create or replace function public.get_my_profile()
returns jsonb language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object('public_id', public_id, 'role', role, 'created_at', created_at,
    'conversation_language', conversation_language, 'application_status', application_status)
  from public.profiles where id = auth.uid();
$$;

create function public.admin_review_volunteer(p_id uuid, p_status public.volunteer_application_status)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  applicant public.profiles;
begin
  perform private.require_role('admin');
  select * into applicant from public.profiles where id = p_id and role = 'volunteer' for update;
  if not found or applicant.application_status is null or p_status is null or not (
    (applicant.application_status = 'pending' and p_status in ('approved', 'rejected'))
    or (applicant.application_status = 'rejected' and p_status = 'pending')
  ) then
    raise exception 'Application is no longer available for this decision';
  end if;

  if p_status = 'approved' then
    if not exists (select 1 from auth.users where id = p_id and email_confirmed_at is not null) then
      raise exception 'Applicant email is unverified';
    end if;
    insert into public.volunteers (id, supported_languages, is_available)
    values (p_id, array[applicant.conversation_language], true);
  end if;
  update public.profiles set application_status = p_status where id = p_id;
end;
$$;

revoke all on function public.admin_review_volunteer(uuid, public.volunteer_application_status)
  from public, anon, authenticated, service_role;
grant execute on function public.admin_review_volunteer(uuid, public.volunteer_application_status) to authenticated;

commit;
