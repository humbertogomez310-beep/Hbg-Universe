CREATE TABLE IF NOT EXISTS hbg_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username text NOT NULL UNIQUE,
  role text NOT NULL,
  credential_hash text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS hbg_sessions (
  token_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES hbg_users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS hbg_development_sessions (
  token_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES hbg_users(id) ON DELETE CASCADE,
  purpose text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  ended_at timestamptz
);

CREATE TABLE IF NOT EXISTS hbg_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid REFERENCES hbg_users(id) ON DELETE SET NULL,
  action text NOT NULL,
  resource text NOT NULL,
  result text NOT NULL,
  error_code text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS hbg_terminador_authorizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES hbg_users(id) ON DELETE CASCADE,
  session_token_hash text NOT NULL,
  development_session_token_hash text NOT NULL,
  operation text NOT NULL,
  resource text NOT NULL,
  application_id text NOT NULL,
  workspace text NOT NULL,
  parameters jsonb NOT NULL,
  requested_permissions jsonb NOT NULL,
  content_hash text,
  proposal_hash text NOT NULL,
  reason text NOT NULL,
  state text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  approved_at timestamptz,
  approved_by_user_id uuid REFERENCES hbg_users(id) ON DELETE SET NULL,
  approval_session_token_hash text,
  denied_at timestamptz,
  revoked_at timestamptz,
  consumed_at timestamptz
);

CREATE TABLE IF NOT EXISTS hbg_permission_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES hbg_users(id) ON DELETE CASCADE,
  granted_by_user_id uuid NOT NULL REFERENCES hbg_users(id) ON DELETE CASCADE,
  development_session_token_hash text NOT NULL
    REFERENCES hbg_development_sessions(token_hash) ON DELETE CASCADE,
  permission text NOT NULL,
  resource_path text NOT NULL,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  CONSTRAINT hbg_permission_grants_permission_check
    CHECK (permission = 'universe.code.modify'),
  CONSTRAINT hbg_permission_grants_expiry_check
    CHECK (expires_at > created_at),
  CONSTRAINT hbg_permission_grants_resource_path_check
    CHECK (
      resource_path <> ''
      AND left(resource_path, 1) <> '/'
      AND right(resource_path, 1) <> '/'
      AND position(chr(92) in resource_path) = 0
      AND position('/../' in '/' || resource_path || '/') = 0
      AND position('/./' in '/' || resource_path || '/') = 0
      AND position('//' in resource_path) = 0
      AND position('*' in resource_path) = 0
      AND position('?' in resource_path) = 0
    )
);

CREATE INDEX IF NOT EXISTS hbg_permission_grants_lookup_idx
  ON hbg_permission_grants (
    owner_user_id,
    permission,
    resource_path,
    development_session_token_hash,
    revoked_at,
    expires_at
  );

CREATE TABLE IF NOT EXISTS hbg_applications (
  id text PRIMARY KEY,
  name text NOT NULL,
  version text NOT NULL,
  status text NOT NULL,
  capabilities jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
