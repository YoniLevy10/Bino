-- Ensure OpsBrain demo mailbox (email + password) exists and is linked.
-- Safe to re-run. Prefer this in Supabase SQL editor when service-role .env is unavailable.
--
-- Credentials (override by editing the literals below):
--   email:    savion@bamakor.com
--   password: savion2026!
--   client:   07773bb3-4969-4bce-8ce2-faab3b26383c

DO $$
DECLARE
  new_user_id uuid := gen_random_uuid();
  org_id uuid;
  demo_email text := 'savion@bamakor.com';
  demo_password text := 'savion2026!';
  demo_client uuid := '07773bb3-4969-4bce-8ce2-faab3b26383c';
BEGIN
  SELECT id INTO org_id
  FROM public.organizations
  WHERE client_id = demo_client
  LIMIT 1;

  IF org_id IS NULL THEN
    RAISE EXCEPTION 'OpsBrain organization not found for client %', demo_client;
  END IF;

  IF EXISTS (SELECT 1 FROM auth.users WHERE lower(email) = demo_email) THEN
    SELECT id INTO new_user_id FROM auth.users WHERE lower(email) = demo_email;
    UPDATE auth.users
    SET encrypted_password = crypt(demo_password, gen_salt('bf')),
        email_confirmed_at = COALESCE(email_confirmed_at, now()),
        updated_at = now(),
        raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) ||
          jsonb_build_object(
            'demo', true,
            'client_id', demo_client::text,
            'organization_id', org_id::text
          )
    WHERE id = new_user_id;

    -- Ensure email identity exists (needed for password grant).
    IF NOT EXISTS (
      SELECT 1 FROM auth.identities
      WHERE user_id = new_user_id AND provider = 'email'
    ) THEN
      INSERT INTO auth.identities (
        id, user_id, identity_data, provider, provider_id,
        last_sign_in_at, created_at, updated_at
      ) VALUES (
        gen_random_uuid(),
        new_user_id,
        jsonb_build_object(
          'sub', new_user_id::text,
          'email', demo_email,
          'email_verified', true,
          'phone_verified', false
        ),
        'email',
        new_user_id::text,
        now(), now(), now()
      );
    END IF;
  ELSE
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change,
      email_change_token_current, reauthentication_token, is_sso_user, is_anonymous
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      new_user_id,
      'authenticated',
      'authenticated',
      demo_email,
      crypt(demo_password, gen_salt('bf')),
      now(),
      jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
      jsonb_build_object(
        'demo', true,
        'client_id', demo_client::text,
        'organization_id', org_id::text
      ),
      now(), now(),
      '', '', '', '', '', '',
      false, false
    );

    INSERT INTO auth.identities (
      id, user_id, identity_data, provider, provider_id,
      last_sign_in_at, created_at, updated_at
    ) VALUES (
      gen_random_uuid(),
      new_user_id,
      jsonb_build_object(
        'sub', new_user_id::text,
        'email', demo_email,
        'email_verified', true,
        'phone_verified', false
      ),
      'email',
      new_user_id::text,
      now(), now(), now()
    );
  END IF;

  DELETE FROM public.organization_users
  WHERE user_id = new_user_id AND organization_id <> org_id;

  INSERT INTO public.organization_users (organization_id, user_id, role)
  VALUES (org_id, new_user_id, 'admin')
  ON CONFLICT (organization_id, user_id) DO UPDATE SET role = EXCLUDED.role;
END $$;

SELECT u.id, u.email, u.email_confirmed_at IS NOT NULL AS confirmed, ou.role, o.name AS org_name
FROM auth.users u
JOIN public.organization_users ou ON ou.user_id = u.id
JOIN public.organizations o ON o.id = ou.organization_id
WHERE lower(u.email) = 'savion@bamakor.com';
