-- WHAPPI core schema, integrity rules, RLS, realtime and private-storage ACLs.
-- Every migration is executed transactionally by InsForge.

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username text NOT NULL,
  display_name text NOT NULL,
  avatar_url text,
  bio text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT profiles_username_format CHECK (username ~ '^[a-z0-9][a-z0-9_.]{2,29}$'),
  CONSTRAINT profiles_display_name_length CHECK (char_length(btrim(display_name)) BETWEEN 1 AND 80),
  CONSTRAINT profiles_bio_length CHECK (bio IS NULL OR char_length(bio) <= 160),
  CONSTRAINT profiles_avatar_url CHECK (avatar_url IS NULL OR avatar_url ~* '^https://')
);

CREATE UNIQUE INDEX profiles_username_ci_unique ON public.profiles (lower(username));
CREATE INDEX profiles_search_idx ON public.profiles (lower(display_name), lower(username));

CREATE TABLE public.friend_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  receiver_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending',
  pair_low_id uuid GENERATED ALWAYS AS (LEAST(sender_id, receiver_id)) STORED,
  pair_high_id uuid GENERATED ALWAYS AS (GREATEST(sender_id, receiver_id)) STORED,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  responded_at timestamptz,
  CONSTRAINT friend_requests_not_self CHECK (sender_id <> receiver_id),
  CONSTRAINT friend_requests_status CHECK (status IN ('pending', 'accepted', 'rejected', 'cancelled')),
  CONSTRAINT friend_requests_response_time CHECK (
    (status = 'pending' AND responded_at IS NULL) OR
    (status <> 'pending' AND responded_at IS NOT NULL)
  )
);

CREATE UNIQUE INDEX friend_requests_one_pending_pair
  ON public.friend_requests (pair_low_id, pair_high_id) WHERE status = 'pending';
CREATE INDEX friend_requests_receiver_pending_idx ON public.friend_requests (receiver_id, created_at DESC) WHERE status = 'pending';
CREATE INDEX friend_requests_sender_pending_idx ON public.friend_requests (sender_id, created_at DESC) WHERE status = 'pending';

CREATE TABLE public.friendships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_low_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  user_high_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT friendships_canonical_pair CHECK (user_low_id < user_high_id),
  CONSTRAINT friendships_unique_pair UNIQUE (user_low_id, user_high_id)
);

CREATE INDEX friendships_high_user_idx ON public.friendships (user_high_id, created_at DESC);
CREATE INDEX friendships_low_user_idx ON public.friendships (user_low_id, created_at DESC);

CREATE TABLE public.conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL DEFAULT 'direct',
  user_low_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  user_high_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  retention_mode text NOT NULL DEFAULT 'never',
  retention_seconds integer,
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT conversations_direct_only CHECK (type = 'direct'),
  CONSTRAINT conversations_canonical_pair CHECK (user_low_id < user_high_id),
  CONSTRAINT conversations_unique_pair UNIQUE (user_low_id, user_high_id),
  CONSTRAINT conversations_creator_member CHECK (created_by IN (user_low_id, user_high_id)),
  CONSTRAINT conversations_retention_mode CHECK (
    retention_mode IN ('24_hours', '12_hours', '3_hours', 'instant_after_view', '5_minutes_after_view', 'never', 'custom')
  ),
  CONSTRAINT conversations_retention_seconds CHECK (
    (retention_mode = 'custom' AND retention_seconds BETWEEN 60 AND 31536000) OR
    (retention_mode <> 'custom' AND retention_seconds IS NULL)
  )
);

CREATE TABLE public.conversation_members (
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  joined_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  cleared_at timestamptz,
  PRIMARY KEY (conversation_id, user_id)
);

CREATE INDEX conversation_members_user_idx ON public.conversation_members (user_id, joined_at DESC);

CREATE TABLE public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  message_type text NOT NULL,
  text_content text,
  link_url text,
  latitude double precision,
  longitude double precision,
  location_label text,
  retention_mode text NOT NULL DEFAULT 'never',
  retention_seconds integer,
  is_system boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz,
  deleted_at timestamptz,
  CONSTRAINT messages_type CHECK (message_type IN ('text', 'image', 'video', 'voice', 'document', 'link', 'location')),
  CONSTRAINT messages_retention_mode CHECK (
    retention_mode IN ('24_hours', '12_hours', '3_hours', 'instant_after_view', '5_minutes_after_view', 'never', 'custom')
  ),
  CONSTRAINT messages_retention_seconds CHECK (
    (retention_mode = 'custom' AND retention_seconds BETWEEN 60 AND 31536000) OR
    (retention_mode <> 'custom' AND retention_seconds IS NULL)
  ),
  CONSTRAINT messages_payload CHECK (
    (message_type = 'text' AND text_content IS NOT NULL AND char_length(btrim(text_content)) BETWEEN 1 AND 4000
      AND link_url IS NULL AND latitude IS NULL AND longitude IS NULL) OR
    (message_type IN ('image', 'video', 'voice', 'document') AND link_url IS NULL AND latitude IS NULL AND longitude IS NULL
      AND (text_content IS NULL OR char_length(text_content) <= 1000)) OR
    (message_type = 'link' AND text_content IS NULL AND link_url ~* '^https?://[^[:space:]]+$'
      AND latitude IS NULL AND longitude IS NULL) OR
    (message_type = 'location' AND text_content IS NULL AND link_url IS NULL
      AND latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180
      AND (location_label IS NULL OR char_length(location_label) <= 120))
  )
);

CREATE INDEX messages_conversation_page_idx ON public.messages (conversation_id, created_at DESC, id DESC);
CREATE INDEX messages_expiry_idx ON public.messages (expires_at, id) WHERE deleted_at IS NULL AND expires_at IS NOT NULL;
CREATE INDEX messages_sender_idx ON public.messages (sender_id, created_at DESC);

CREATE TABLE public.message_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL UNIQUE REFERENCES public.messages(id) ON DELETE CASCADE,
  bucket text NOT NULL,
  storage_key text NOT NULL,
  url text NOT NULL,
  original_name text NOT NULL,
  mime_type text NOT NULL,
  size_bytes bigint NOT NULL,
  duration_seconds numeric(10, 2),
  width integer,
  height integer,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT attachments_bucket CHECK (bucket IN ('chat-media', 'chat-documents')),
  CONSTRAINT attachments_key_safe CHECK (storage_key ~ '^conversations/[0-9a-f-]{36}/[0-9a-f-]{36}/[A-Za-z0-9._-]+$'),
  CONSTRAINT attachments_name_length CHECK (char_length(original_name) BETWEEN 1 AND 255),
  CONSTRAINT attachments_mime_length CHECK (char_length(mime_type) BETWEEN 1 AND 120),
  CONSTRAINT attachments_size CHECK (size_bytes BETWEEN 1 AND 52428800),
  CONSTRAINT attachments_duration CHECK (duration_seconds IS NULL OR duration_seconds BETWEEN 0 AND 3600),
  CONSTRAINT attachments_dimensions CHECK ((width IS NULL OR width > 0) AND (height IS NULL OR height > 0))
);

CREATE UNIQUE INDEX attachments_storage_object_unique ON public.message_attachments (bucket, storage_key);

CREATE TABLE public.message_receipts (
  message_id uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  viewed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (message_id, user_id)
);

CREATE INDEX message_receipts_user_idx ON public.message_receipts (user_id, viewed_at DESC);

CREATE TABLE public.expiration_cleanup_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL,
  attachment_id uuid,
  bucket text,
  storage_key text,
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  last_error text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  completed_at timestamptz,
  CONSTRAINT cleanup_status CHECK (status IN ('pending', 'processing', 'completed')),
  CONSTRAINT cleanup_object_pair CHECK ((bucket IS NULL) = (storage_key IS NULL)),
  CONSTRAINT cleanup_unique_attachment UNIQUE (message_id, attachment_id)
);

CREATE INDEX expiration_cleanup_ready_idx ON public.expiration_cleanup_queue (status, next_attempt_at, created_at);

CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION system.update_updated_at();
CREATE TRIGGER conversations_updated_at BEFORE UPDATE ON public.conversations
  FOR EACH ROW EXECUTE FUNCTION system.update_updated_at();

CREATE OR REPLACE FUNCTION public.try_uuid(p_value text)
RETURNS uuid LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  RETURN p_value::uuid;
EXCEPTION WHEN invalid_text_representation THEN
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.canonical_user_low(p_a uuid, p_b uuid)
RETURNS uuid LANGUAGE sql IMMUTABLE STRICT AS $$ SELECT LEAST(p_a, p_b) $$;

CREATE OR REPLACE FUNCTION public.canonical_user_high(p_a uuid, p_b uuid)
RETURNS uuid LANGUAGE sql IMMUTABLE STRICT AS $$ SELECT GREATEST(p_a, p_b) $$;

CREATE OR REPLACE FUNCTION public.has_active_friendship(p_a uuid, p_b uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.friendships f
    WHERE f.user_low_id = LEAST(p_a, p_b) AND f.user_high_id = GREATEST(p_a, p_b)
  )
$$;

CREATE OR REPLACE FUNCTION public.is_conversation_member(p_conversation_id uuid, p_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.conversation_members cm
    WHERE cm.conversation_id = p_conversation_id AND cm.user_id = p_user_id
  )
$$;

CREATE OR REPLACE FUNCTION public.is_active_conversation_friend(p_conversation_id uuid, p_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.conversations c
    JOIN public.friendships f
      ON f.user_low_id = c.user_low_id AND f.user_high_id = c.user_high_id
    WHERE c.id = p_conversation_id
      AND p_user_id IN (c.user_low_id, c.user_high_id)
  )
$$;

CREATE OR REPLACE FUNCTION public.can_access_message(p_message_id uuid, p_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.messages m
    JOIN public.conversation_members cm
      ON cm.conversation_id = m.conversation_id AND cm.user_id = p_user_id
    WHERE m.id = p_message_id
      AND m.deleted_at IS NULL
      AND (m.expires_at IS NULL OR m.expires_at > clock_timestamp())
      AND (cm.cleared_at IS NULL OR m.created_at > cm.cleared_at)
  )
$$;

CREATE OR REPLACE FUNCTION public.calculate_message_expiry(
  p_mode text,
  p_custom_seconds integer,
  p_created_at timestamptz DEFAULT clock_timestamp()
)
RETURNS timestamptz
LANGUAGE plpgsql IMMUTABLE
AS $$
BEGIN
  RETURN CASE p_mode
    WHEN '24_hours' THEN p_created_at + interval '24 hours'
    WHEN '12_hours' THEN p_created_at + interval '12 hours'
    WHEN '3_hours' THEN p_created_at + interval '3 hours'
    WHEN 'custom' THEN p_created_at + make_interval(secs => p_custom_seconds)
    ELSE NULL
  END;
END;
$$;

CREATE OR REPLACE FUNCTION public.ensure_profile()
RETURNS public.profiles
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_auth_profile jsonb;
  v_display text;
  v_avatar text;
  v_base text;
  v_candidate text;
  v_attempt integer := 0;
  v_profile public.profiles;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501'; END IF;
  SELECT profile INTO v_auth_profile FROM auth.users WHERE id = v_uid;
  v_display := COALESCE(NULLIF(btrim(v_auth_profile->>'name'), ''), 'New WHAPPI user');
  v_avatar := NULLIF(v_auth_profile->>'avatar_url', '');
  v_base := lower(regexp_replace(v_display, '[^a-zA-Z0-9]+', '_', 'g'));
  v_base := trim(both '_' from v_base);
  IF char_length(v_base) < 3 THEN v_base := 'whappi_user'; END IF;
  v_base := left(v_base, 21);
  LOOP
    v_candidate := v_base || CASE WHEN v_attempt = 0 THEN '' ELSE '_' || substr(v_uid::text, 1, 6) || v_attempt::text END;
    BEGIN
      INSERT INTO public.profiles (id, username, display_name, avatar_url)
      VALUES (v_uid, v_candidate, left(v_display, 80), v_avatar)
      ON CONFLICT (id) DO NOTHING;
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      v_attempt := v_attempt + 1;
      IF v_attempt > 20 THEN RAISE; END IF;
    END;
  END LOOP;
  SELECT * INTO v_profile FROM public.profiles WHERE id = v_uid;
  RETURN v_profile;
END;
$$;

CREATE OR REPLACE FUNCTION public.send_friend_request(p_receiver_id uuid)
RETURNS public.friend_requests
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE v_uid uuid := auth.uid(); v_result public.friend_requests;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501'; END IF;
  IF p_receiver_id = v_uid THEN RAISE EXCEPTION 'You cannot send a friend request to yourself' USING ERRCODE = '22023'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_receiver_id) THEN RAISE EXCEPTION 'User not found' USING ERRCODE = 'P0002'; END IF;
  IF public.has_active_friendship(v_uid, p_receiver_id) THEN RAISE EXCEPTION 'You are already friends' USING ERRCODE = '23505'; END IF;
  INSERT INTO public.friend_requests (sender_id, receiver_id)
  VALUES (v_uid, p_receiver_id)
  RETURNING * INTO v_result;
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_friend_request(p_request_id uuid)
RETURNS public.friend_requests
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE v_result public.friend_requests;
BEGIN
  UPDATE public.friend_requests
  SET status = 'cancelled', responded_at = clock_timestamp()
  WHERE id = p_request_id AND sender_id = auth.uid() AND status = 'pending'
  RETURNING * INTO v_result;
  IF v_result.id IS NULL THEN RAISE EXCEPTION 'Pending request not found or not owned by you' USING ERRCODE = '42501'; END IF;
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.respond_friend_request(p_request_id uuid, p_action text)
RETURNS public.friend_requests
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE v_result public.friend_requests;
BEGIN
  IF p_action NOT IN ('accepted', 'rejected') THEN RAISE EXCEPTION 'Invalid request response' USING ERRCODE = '22023'; END IF;
  UPDATE public.friend_requests
  SET status = p_action, responded_at = clock_timestamp()
  WHERE id = p_request_id AND receiver_id = auth.uid() AND status = 'pending'
  RETURNING * INTO v_result;
  IF v_result.id IS NULL THEN RAISE EXCEPTION 'Pending request not addressed to you' USING ERRCODE = '42501'; END IF;
  IF p_action = 'accepted' THEN
    INSERT INTO public.friendships (user_low_id, user_high_id)
    VALUES (LEAST(v_result.sender_id, v_result.receiver_id), GREATEST(v_result.sender_id, v_result.receiver_id))
    ON CONFLICT (user_low_id, user_high_id) DO NOTHING;
  END IF;
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.unfriend(p_friend_id uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE v_count integer;
BEGIN
  DELETE FROM public.friendships
  WHERE user_low_id = LEAST(auth.uid(), p_friend_id) AND user_high_id = GREATEST(auth.uid(), p_friend_id);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count = 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_or_get_conversation(p_friend_id uuid)
RETURNS public.conversations
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE v_uid uuid := auth.uid(); v_conversation public.conversations;
BEGIN
  IF NOT public.has_active_friendship(v_uid, p_friend_id) THEN RAISE EXCEPTION 'Only friends can start a conversation' USING ERRCODE = '42501'; END IF;
  INSERT INTO public.conversations (user_low_id, user_high_id, created_by)
  VALUES (LEAST(v_uid, p_friend_id), GREATEST(v_uid, p_friend_id), v_uid)
  ON CONFLICT (user_low_id, user_high_id) DO UPDATE SET updated_at = public.conversations.updated_at
  RETURNING * INTO v_conversation;
  INSERT INTO public.conversation_members (conversation_id, user_id)
  VALUES (v_conversation.id, v_conversation.user_low_id), (v_conversation.id, v_conversation.user_high_id)
  ON CONFLICT DO NOTHING;
  RETURN v_conversation;
END;
$$;

CREATE OR REPLACE FUNCTION public.send_message(
  p_conversation_id uuid,
  p_message_id uuid,
  p_message_type text,
  p_text_content text DEFAULT NULL,
  p_link_url text DEFAULT NULL,
  p_latitude double precision DEFAULT NULL,
  p_longitude double precision DEFAULT NULL,
  p_location_label text DEFAULT NULL,
  p_attachment jsonb DEFAULT NULL
)
RETURNS public.messages
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_conversation public.conversations;
  v_created timestamptz := clock_timestamp();
  v_message public.messages;
  v_bucket text;
  v_key text;
  v_mime text;
  v_size bigint;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501'; END IF;
  SELECT * INTO v_conversation FROM public.conversations WHERE id = p_conversation_id;
  IF v_conversation.id IS NULL OR NOT public.is_conversation_member(p_conversation_id, v_uid) THEN
    RAISE EXCEPTION 'Conversation not found' USING ERRCODE = '42501';
  END IF;
  IF NOT public.is_active_conversation_friend(p_conversation_id, v_uid) THEN
    RAISE EXCEPTION 'You can only message an active friend' USING ERRCODE = '42501';
  END IF;
  IF p_message_type NOT IN ('text', 'image', 'video', 'voice', 'document', 'link', 'location') THEN
    RAISE EXCEPTION 'Unsupported message type' USING ERRCODE = '22023';
  END IF;
  IF p_message_type IN ('image', 'video', 'voice', 'document') THEN
    IF p_attachment IS NULL THEN RAISE EXCEPTION 'Attachment metadata is required' USING ERRCODE = '22023'; END IF;
    v_bucket := p_attachment->>'bucket';
    v_key := p_attachment->>'storage_key';
    v_mime := lower(p_attachment->>'mime_type');
    v_size := (p_attachment->>'size_bytes')::bigint;
    IF v_key !~ ('^conversations/' || p_conversation_id::text || '/' || p_message_id::text || '/[A-Za-z0-9._-]+$') THEN
      RAISE EXCEPTION 'Invalid storage path' USING ERRCODE = '22023';
    END IF;
    IF p_message_type = 'document' AND v_bucket <> 'chat-documents' THEN RAISE EXCEPTION 'Documents require the private document bucket' USING ERRCODE = '22023'; END IF;
    IF p_message_type <> 'document' AND v_bucket <> 'chat-media' THEN RAISE EXCEPTION 'Media requires the private media bucket' USING ERRCODE = '22023'; END IF;
    IF p_message_type = 'image' AND (v_mime NOT IN ('image/jpeg', 'image/png', 'image/webp', 'image/gif') OR v_size > 15728640) THEN
      RAISE EXCEPTION 'Invalid image type or size' USING ERRCODE = '22023';
    ELSIF p_message_type = 'video' AND (v_mime NOT IN ('video/mp4', 'video/webm', 'video/quicktime') OR v_size > 52428800) THEN
      RAISE EXCEPTION 'Invalid video type or size' USING ERRCODE = '22023';
    ELSIF p_message_type = 'voice' AND (v_mime NOT IN ('audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg') OR v_size > 15728640) THEN
      RAISE EXCEPTION 'Invalid voice-note type or size' USING ERRCODE = '22023';
    ELSIF p_message_type = 'document' AND (v_mime NOT IN (
      'application/pdf', 'text/plain', 'text/csv',
      'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/zip'
    ) OR v_size > 26214400) THEN
      RAISE EXCEPTION 'Invalid document type or size' USING ERRCODE = '22023';
    END IF;
  ELSIF p_attachment IS NOT NULL THEN
    RAISE EXCEPTION 'This message type cannot have an attachment' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.messages (
    id, conversation_id, sender_id, message_type, text_content, link_url,
    latitude, longitude, location_label, retention_mode, retention_seconds,
    created_at, expires_at
  ) VALUES (
    p_message_id, p_conversation_id, v_uid, p_message_type,
    CASE WHEN p_text_content IS NULL THEN NULL ELSE btrim(p_text_content) END,
    p_link_url, p_latitude, p_longitude, p_location_label,
    v_conversation.retention_mode, v_conversation.retention_seconds, v_created,
    public.calculate_message_expiry(v_conversation.retention_mode, v_conversation.retention_seconds, v_created)
  )
  ON CONFLICT (id) DO UPDATE SET id = public.messages.id
  WHERE public.messages.sender_id = v_uid AND public.messages.conversation_id = p_conversation_id
  RETURNING * INTO v_message;

  IF v_message.id IS NULL THEN RAISE EXCEPTION 'Message id is already in use' USING ERRCODE = '23505'; END IF;

  IF p_attachment IS NOT NULL THEN
    INSERT INTO public.message_attachments (
      message_id, bucket, storage_key, url, original_name, mime_type,
      size_bytes, duration_seconds, width, height
    ) VALUES (
      v_message.id, v_bucket, v_key, p_attachment->>'url',
      left(COALESCE(NULLIF(p_attachment->>'original_name', ''), 'attachment'), 255), v_mime, v_size,
      NULLIF(p_attachment->>'duration_seconds', '')::numeric,
      NULLIF(p_attachment->>'width', '')::integer,
      NULLIF(p_attachment->>'height', '')::integer
    ) ON CONFLICT (message_id) DO NOTHING;
  END IF;
  UPDATE public.conversations SET updated_at = v_created WHERE id = p_conversation_id;
  RETURN v_message;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_messages_viewed(p_conversation_id uuid, p_message_ids uuid[])
RETURNS TABLE (message_id uuid, viewed_at timestamptz, expires_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF NOT public.is_conversation_member(p_conversation_id, auth.uid()) THEN
    RAISE EXCEPTION 'Conversation not found' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  WITH first_views AS (
    INSERT INTO public.message_receipts (message_id, user_id, viewed_at)
    SELECT m.id, auth.uid(), clock_timestamp()
    FROM public.messages m
    WHERE m.conversation_id = p_conversation_id
      AND m.id = ANY(p_message_ids)
      AND m.sender_id <> auth.uid()
      AND m.deleted_at IS NULL
      AND (m.expires_at IS NULL OR m.expires_at > clock_timestamp())
    ON CONFLICT (message_id, user_id) DO NOTHING
    RETURNING public.message_receipts.message_id, public.message_receipts.viewed_at
  ), updated AS (
    UPDATE public.messages m
    SET expires_at = CASE
      WHEN m.retention_mode = 'instant_after_view' THEN fv.viewed_at
      WHEN m.retention_mode = '5_minutes_after_view' THEN fv.viewed_at + interval '5 minutes'
      ELSE m.expires_at
    END
    FROM first_views fv
    WHERE m.id = fv.message_id
    RETURNING m.id, fv.viewed_at, m.expires_at
  )
  SELECT updated.id, updated.viewed_at, updated.expires_at FROM updated;
END;
$$;

CREATE OR REPLACE FUNCTION public.change_retention(p_conversation_id uuid, p_mode text, p_custom_seconds integer DEFAULT NULL)
RETURNS public.conversations
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE v_conversation public.conversations; v_label text;
BEGIN
  IF NOT public.is_conversation_member(p_conversation_id, auth.uid()) THEN RAISE EXCEPTION 'Conversation not found' USING ERRCODE = '42501'; END IF;
  IF p_mode NOT IN ('24_hours', '12_hours', '3_hours', 'instant_after_view', '5_minutes_after_view', 'never', 'custom') THEN
    RAISE EXCEPTION 'Invalid retention mode' USING ERRCODE = '22023';
  END IF;
  IF (p_mode = 'custom' AND (p_custom_seconds IS NULL OR p_custom_seconds NOT BETWEEN 60 AND 31536000))
     OR (p_mode <> 'custom' AND p_custom_seconds IS NOT NULL) THEN
    RAISE EXCEPTION 'Custom retention must be between 60 seconds and 365 days' USING ERRCODE = '22023';
  END IF;
  UPDATE public.conversations
  SET retention_mode = p_mode, retention_seconds = p_custom_seconds
  WHERE id = p_conversation_id RETURNING * INTO v_conversation;
  v_label := CASE p_mode
    WHEN '24_hours' THEN '24 hours' WHEN '12_hours' THEN '12 hours' WHEN '3_hours' THEN '3 hours'
    WHEN 'instant_after_view' THEN 'immediately after viewing' WHEN '5_minutes_after_view' THEN '5 minutes after viewing'
    WHEN 'never' THEN 'never' ELSE p_custom_seconds::text || ' seconds' END;
  INSERT INTO public.messages (conversation_id, sender_id, message_type, text_content, retention_mode, is_system)
  VALUES (p_conversation_id, auth.uid(), 'text', 'Disappearing messages set to ' || v_label || '.', 'never', true);
  RETURN v_conversation;
END;
$$;

CREATE OR REPLACE FUNCTION public.clear_chat(p_conversation_id uuid)
RETURNS timestamptz
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE v_cleared_at timestamptz := clock_timestamp();
BEGIN
  UPDATE public.conversation_members SET cleared_at = v_cleared_at
  WHERE conversation_id = p_conversation_id AND user_id = auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'Conversation not found' USING ERRCODE = '42501'; END IF;
  PERFORM realtime.publish('user:' || auth.uid()::text, 'chat_cleared', jsonb_build_object(
    'conversation_id', p_conversation_id, 'cleared_at', v_cleared_at
  ));
  RETURN v_cleared_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.prepare_expired_cleanup(p_batch_size integer DEFAULT 100)
RETURNS TABLE (queue_id uuid, message_id uuid, attachment_id uuid, bucket text, storage_key text)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  p_batch_size := LEAST(GREATEST(p_batch_size, 1), 500);
  WITH expired AS (
    SELECT m.id
    FROM public.messages m
    WHERE m.deleted_at IS NULL AND m.expires_at IS NOT NULL AND m.expires_at <= clock_timestamp()
    ORDER BY m.expires_at, m.id
    FOR UPDATE SKIP LOCKED LIMIT p_batch_size
  ), queued AS (
    INSERT INTO public.expiration_cleanup_queue (message_id, attachment_id, bucket, storage_key)
    SELECT e.id, a.id, a.bucket, a.storage_key
    FROM expired e LEFT JOIN public.message_attachments a ON a.message_id = e.id
    ON CONFLICT (message_id, attachment_id) DO NOTHING
    RETURNING id
  ), scrubbed AS (
    UPDATE public.messages m
    SET deleted_at = clock_timestamp(), text_content = NULL, link_url = NULL,
        latitude = NULL, longitude = NULL, location_label = NULL
    WHERE m.id IN (SELECT id FROM expired)
    RETURNING m.id
  ), claims AS (
    UPDATE public.expiration_cleanup_queue q
    SET status = 'processing', attempts = attempts + 1,
        next_attempt_at = clock_timestamp() + interval '5 minutes'
    WHERE q.id IN (
      SELECT q2.id FROM public.expiration_cleanup_queue q2
      WHERE q2.status IN ('pending', 'processing') AND q2.next_attempt_at <= clock_timestamp()
      ORDER BY q2.created_at FOR UPDATE SKIP LOCKED LIMIT p_batch_size
    )
    RETURNING q.id, q.message_id, q.attachment_id, q.bucket, q.storage_key
  )
  SELECT claims.id, claims.message_id, claims.attachment_id, claims.bucket, claims.storage_key FROM claims;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_expired_cleanup(p_queue_id uuid, p_success boolean, p_error text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE v_attachment_id uuid;
BEGIN
  IF p_success THEN
    UPDATE public.expiration_cleanup_queue SET status = 'completed', completed_at = clock_timestamp(), last_error = NULL
    WHERE id = p_queue_id RETURNING attachment_id INTO v_attachment_id;
    IF v_attachment_id IS NOT NULL THEN DELETE FROM public.message_attachments WHERE id = v_attachment_id; END IF;
  ELSE
    UPDATE public.expiration_cleanup_queue
    SET status = 'pending', last_error = left(COALESCE(p_error, 'Storage deletion failed'), 500),
        next_attempt_at = clock_timestamp() + make_interval(secs => LEAST(3600, 30 * (attempts + 1)))
    WHERE id = p_queue_id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_friend_request_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  PERFORM realtime.publish('user:' || NEW.sender_id::text, 'friend_request_changed',
    jsonb_build_object('id', NEW.id, 'sender_id', NEW.sender_id, 'receiver_id', NEW.receiver_id, 'status', NEW.status));
  PERFORM realtime.publish('user:' || NEW.receiver_id::text, 'friend_request_changed',
    jsonb_build_object('id', NEW.id, 'sender_id', NEW.sender_id, 'receiver_id', NEW.receiver_id, 'status', NEW.status));
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_friendship_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE v_row public.friendships := COALESCE(NEW, OLD); v_event text := CASE WHEN TG_OP = 'DELETE' THEN 'friendship_removed' ELSE 'friendship_added' END;
BEGIN
  PERFORM realtime.publish('user:' || v_row.user_low_id::text, v_event,
    jsonb_build_object('id', v_row.id, 'user_low_id', v_row.user_low_id, 'user_high_id', v_row.user_high_id));
  PERFORM realtime.publish('user:' || v_row.user_high_id::text, v_event,
    jsonb_build_object('id', v_row.id, 'user_low_id', v_row.user_low_id, 'user_high_id', v_row.user_high_id));
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_message_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE v_event text;
BEGIN
  IF TG_OP = 'INSERT' THEN v_event := 'new_message';
  ELSIF NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN v_event := 'message_expired';
  ELSIF NEW.expires_at IS DISTINCT FROM OLD.expires_at THEN v_event := 'message_expiry_changed';
  ELSE RETURN NEW; END IF;
  PERFORM realtime.publish('conversation:' || NEW.conversation_id::text, v_event,
    jsonb_build_object('id', NEW.id, 'conversation_id', NEW.conversation_id, 'sender_id', NEW.sender_id,
      'message_type', NEW.message_type, 'created_at', NEW.created_at, 'expires_at', NEW.expires_at));
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_attachment_ready()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE v_conversation_id uuid;
BEGIN
  SELECT conversation_id INTO v_conversation_id FROM public.messages WHERE id = NEW.message_id;
  PERFORM realtime.publish('conversation:' || v_conversation_id::text, 'upload_completed',
    jsonb_build_object('message_id', NEW.message_id, 'attachment_id', NEW.id));
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_retention_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  PERFORM realtime.publish('conversation:' || NEW.id::text, 'retention_changed',
    jsonb_build_object('conversation_id', NEW.id, 'retention_mode', NEW.retention_mode, 'retention_seconds', NEW.retention_seconds));
  RETURN NEW;
END;
$$;

CREATE TRIGGER friend_requests_realtime AFTER INSERT OR UPDATE ON public.friend_requests
  FOR EACH ROW EXECUTE FUNCTION public.notify_friend_request_change();
CREATE TRIGGER friendships_realtime AFTER INSERT OR DELETE ON public.friendships
  FOR EACH ROW EXECUTE FUNCTION public.notify_friendship_change();
CREATE TRIGGER messages_realtime AFTER INSERT OR UPDATE ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.notify_message_change();
CREATE TRIGGER attachments_realtime AFTER INSERT ON public.message_attachments
  FOR EACH ROW EXECUTE FUNCTION public.notify_attachment_ready();
CREATE TRIGGER retention_realtime AFTER UPDATE ON public.conversations
  FOR EACH ROW WHEN (OLD.retention_mode IS DISTINCT FROM NEW.retention_mode OR OLD.retention_seconds IS DISTINCT FROM NEW.retention_seconds)
  EXECUTE FUNCTION public.notify_retention_change();

INSERT INTO realtime.channels (pattern, description, enabled) VALUES
  ('conversation:%', 'Authorized WHAPPI conversation updates', true),
  ('user:%', 'Private WHAPPI user updates', true)
ON CONFLICT (pattern) DO UPDATE SET description = EXCLUDED.description, enabled = EXCLUDED.enabled;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.friend_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expiration_cleanup_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY profiles_authenticated_read ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY profiles_update_self ON public.profiles FOR UPDATE TO authenticated
  USING (id = (SELECT auth.uid())) WITH CHECK (id = (SELECT auth.uid()));

CREATE POLICY friend_requests_participant_read ON public.friend_requests FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) IN (sender_id, receiver_id));
CREATE POLICY friendships_participant_read ON public.friendships FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) IN (user_low_id, user_high_id));
CREATE POLICY conversations_member_read ON public.conversations FOR SELECT TO authenticated
  USING (public.is_conversation_member(id, (SELECT auth.uid())));
CREATE POLICY conversation_members_member_read ON public.conversation_members FOR SELECT TO authenticated
  USING (public.is_conversation_member(conversation_id, (SELECT auth.uid())));
CREATE POLICY messages_visible_member_read ON public.messages FOR SELECT TO authenticated
  USING (public.can_access_message(id, (SELECT auth.uid())));
CREATE POLICY attachments_visible_member_read ON public.message_attachments FOR SELECT TO authenticated
  USING (public.can_access_message(message_id, (SELECT auth.uid())));
CREATE POLICY receipts_member_read ON public.message_receipts FOR SELECT TO authenticated
  USING (public.can_access_message(message_id, (SELECT auth.uid())));

GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT ON public.profiles, public.friend_requests, public.friendships, public.conversations,
  public.conversation_members, public.messages, public.message_attachments, public.message_receipts TO authenticated;
REVOKE INSERT, DELETE ON public.profiles FROM anon, authenticated;
REVOKE UPDATE ON public.profiles FROM anon, authenticated;
GRANT UPDATE (username, display_name, avatar_url, bio) ON public.profiles TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.friend_requests, public.friendships, public.conversations,
  public.conversation_members, public.messages, public.message_attachments, public.message_receipts,
  public.expiration_cleanup_queue FROM anon, authenticated;
REVOKE SELECT ON public.expiration_cleanup_queue FROM anon, authenticated;

GRANT EXECUTE ON FUNCTION public.ensure_profile() TO authenticated;
GRANT EXECUTE ON FUNCTION public.send_friend_request(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_friend_request(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.respond_friend_request(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unfriend(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_or_get_conversation(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.send_message(uuid, uuid, text, text, text, double precision, double precision, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_messages_viewed(uuid, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.change_retention(uuid, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.clear_chat(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.prepare_expired_cleanup(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_expired_cleanup(uuid, boolean, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_expired_cleanup(integer) TO project_admin;
GRANT EXECUTE ON FUNCTION public.complete_expired_cleanup(uuid, boolean, text) TO project_admin;

ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS storage_objects_owner_select ON storage.objects;
DROP POLICY IF EXISTS storage_objects_owner_insert ON storage.objects;
DROP POLICY IF EXISTS storage_objects_owner_update ON storage.objects;
DROP POLICY IF EXISTS storage_objects_owner_delete ON storage.objects;

CREATE POLICY whappi_storage_member_select ON storage.objects FOR SELECT TO authenticated
USING (
  bucket IN ('chat-media', 'chat-documents')
  AND public.is_conversation_member(public.try_uuid((storage.foldername(key))[2]), (SELECT auth.uid()))
);
CREATE POLICY whappi_storage_member_insert ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket IN ('chat-media', 'chat-documents')
  AND (storage.foldername(key))[1] = 'conversations'
  AND uploaded_by = (SELECT auth.jwt() ->> 'sub')
  AND public.is_conversation_member(public.try_uuid((storage.foldername(key))[2]), (SELECT auth.uid()))
  AND public.is_active_conversation_friend(public.try_uuid((storage.foldername(key))[2]), (SELECT auth.uid()))
);
CREATE POLICY whappi_storage_uploader_delete ON storage.objects FOR DELETE TO authenticated
USING (
  bucket IN ('chat-media', 'chat-documents')
  AND uploaded_by = (SELECT auth.jwt() ->> 'sub')
  AND public.is_conversation_member(public.try_uuid((storage.foldername(key))[2]), (SELECT auth.uid()))
);
GRANT USAGE ON SCHEMA storage TO authenticated;
GRANT SELECT, INSERT, DELETE ON storage.objects TO authenticated;

ALTER TABLE realtime.channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS whappi_channel_subscribe ON realtime.channels;
CREATE POLICY whappi_channel_subscribe ON realtime.channels FOR SELECT TO authenticated
USING (
  (pattern = 'conversation:%' AND public.is_conversation_member(
    public.try_uuid(split_part(realtime.channel_name(), ':', 2)), (SELECT auth.uid())
  ))
  OR
  (pattern = 'user:%' AND split_part(realtime.channel_name(), ':', 2) = (SELECT auth.uid())::text)
);
GRANT SELECT ON realtime.channels TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON realtime.messages FROM authenticated;

COMMENT ON TABLE public.profiles IS 'Public-safe profile data only; auth email and tokens never live here.';
COMMENT ON COLUMN public.conversation_members.cleared_at IS 'Per-user visibility cutoff for Clear chat.';
COMMENT ON COLUMN public.messages.retention_mode IS 'Immutable retention snapshot taken at send time.';
COMMENT ON TABLE public.expiration_cleanup_queue IS 'Privileged idempotent retry queue; never exposed to end users.';
