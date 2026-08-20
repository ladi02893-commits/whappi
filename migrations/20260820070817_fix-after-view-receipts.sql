DROP FUNCTION IF EXISTS public.mark_messages_viewed(uuid, uuid[]);

CREATE OR REPLACE FUNCTION public.mark_messages_viewed(p_conversation_id uuid, p_message_ids uuid[])
RETURNS TABLE (out_message_id uuid, out_viewed_at timestamptz, out_expires_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF NOT public.is_conversation_member(p_conversation_id, auth.uid()) THEN
    RAISE EXCEPTION 'Conversation not found' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  WITH first_views AS (
    INSERT INTO public.message_receipts AS receipt (message_id, user_id, viewed_at)
    SELECT m.id, auth.uid(), clock_timestamp()
    FROM public.messages m
    WHERE m.conversation_id = p_conversation_id
      AND m.id = ANY(p_message_ids)
      AND m.sender_id <> auth.uid()
      AND m.deleted_at IS NULL
      AND (m.expires_at IS NULL OR m.expires_at > clock_timestamp())
    ON CONFLICT ON CONSTRAINT message_receipts_pkey DO NOTHING
    RETURNING receipt.message_id, receipt.viewed_at
  ), updated AS (
    UPDATE public.messages AS message
    SET expires_at = CASE
      WHEN message.retention_mode = 'instant_after_view' THEN first_views.viewed_at
      WHEN message.retention_mode = '5_minutes_after_view' THEN first_views.viewed_at + interval '5 minutes'
      ELSE message.expires_at
    END
    FROM first_views
    WHERE message.id = first_views.message_id
    RETURNING message.id, first_views.viewed_at, message.expires_at
  )
  SELECT updated.id, updated.viewed_at, updated.expires_at FROM updated;
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_messages_viewed(uuid, uuid[]) TO authenticated;
