CREATE OR REPLACE FUNCTION public.can_access_storage_object(
  p_bucket text,
  p_storage_key text,
  p_user_id uuid
)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.message_attachments AS attachment
    JOIN public.messages AS message ON message.id = attachment.message_id
    JOIN public.conversation_members AS member
      ON member.conversation_id = message.conversation_id
     AND member.user_id = p_user_id
    WHERE attachment.bucket = p_bucket
      AND attachment.storage_key = p_storage_key
      AND message.deleted_at IS NULL
      AND (message.expires_at IS NULL OR message.expires_at > clock_timestamp())
      AND (member.cleared_at IS NULL OR message.created_at > member.cleared_at)
  );
$$;

CREATE OR REPLACE FUNCTION public.delete_own_message(p_message_id uuid)
RETURNS timestamptz
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_message public.messages;
  v_deleted_at timestamptz := clock_timestamp();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_message
  FROM public.messages
  WHERE id = p_message_id
  FOR UPDATE;

  IF NOT FOUND
     OR v_message.sender_id <> v_uid
     OR v_message.is_system
     OR v_message.deleted_at IS NOT NULL
     OR (v_message.expires_at IS NOT NULL AND v_message.expires_at <= v_deleted_at)
  THEN
    RAISE EXCEPTION 'Message not found or cannot be deleted' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.expiration_cleanup_queue (
    message_id,
    attachment_id,
    bucket,
    storage_key
  )
  SELECT
    v_message.id,
    attachment.id,
    attachment.bucket,
    attachment.storage_key
  FROM public.message_attachments AS attachment
  WHERE attachment.message_id = v_message.id
  ON CONFLICT ON CONSTRAINT cleanup_unique_attachment DO NOTHING;

  UPDATE public.messages
  SET deleted_at = v_deleted_at,
      text_content = NULL,
      link_url = NULL,
      latitude = NULL,
      longitude = NULL,
      location_label = NULL
  WHERE id = v_message.id;

  RETURN v_deleted_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_message_change()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_event text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_event := 'new_message';
  ELSIF NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN
    v_event := CASE
      WHEN NEW.expires_at IS NOT NULL AND NEW.expires_at <= NEW.deleted_at
        THEN 'message_expired'
      ELSE 'message_deleted'
    END;
  ELSIF NEW.expires_at IS DISTINCT FROM OLD.expires_at THEN
    v_event := 'message_expiry_changed';
  ELSE
    RETURN NEW;
  END IF;

  PERFORM realtime.publish(
    'conversation:' || NEW.conversation_id::text,
    v_event,
    jsonb_build_object(
      'id', NEW.id,
      'conversation_id', NEW.conversation_id,
      'sender_id', NEW.sender_id,
      'message_type', NEW.message_type,
      'created_at', NEW.created_at,
      'expires_at', NEW.expires_at,
      'deleted_at', NEW.deleted_at
    )
  );
  RETURN NEW;
END;
$$;

ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS whappi_storage_member_select ON storage.objects;
CREATE POLICY whappi_storage_member_select
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket IN ('chat-media', 'chat-documents')
  AND public.can_access_storage_object(
    bucket,
    key,
    (SELECT auth.uid())
  )
);

REVOKE ALL ON FUNCTION public.can_access_storage_object(text, text, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_access_storage_object(text, text, uuid)
  TO authenticated;

REVOKE ALL ON FUNCTION public.delete_own_message(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_own_message(uuid)
  TO authenticated;

COMMENT ON FUNCTION public.delete_own_message(uuid) IS
  'Lets an authenticated sender irreversibly scrub one live non-system message; attachment storage cleanup is queued for the privileged worker.';
