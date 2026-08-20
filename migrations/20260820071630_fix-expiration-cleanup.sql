DROP FUNCTION public.prepare_expired_cleanup(integer);

CREATE OR REPLACE FUNCTION public.prepare_expired_cleanup(p_batch_size integer DEFAULT 100)
RETURNS TABLE (
  out_queue_id uuid,
  out_message_id uuid,
  out_attachment_id uuid,
  out_bucket text,
  out_storage_key text
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  p_batch_size := LEAST(GREATEST(p_batch_size, 1), 500);
  RETURN QUERY
  WITH expired AS (
    SELECT message.id
    FROM public.messages AS message
    WHERE message.deleted_at IS NULL
      AND message.expires_at IS NOT NULL
      AND message.expires_at <= clock_timestamp()
    ORDER BY message.expires_at, message.id
    FOR UPDATE SKIP LOCKED
    LIMIT p_batch_size
  ), queued AS (
    INSERT INTO public.expiration_cleanup_queue AS cleanup (message_id, attachment_id, bucket, storage_key)
    SELECT expired.id, attachment.id, attachment.bucket, attachment.storage_key
    FROM expired
    LEFT JOIN public.message_attachments AS attachment ON attachment.message_id = expired.id
    ON CONFLICT ON CONSTRAINT cleanup_unique_attachment DO NOTHING
    RETURNING cleanup.id
  ), scrubbed AS (
    UPDATE public.messages AS message
    SET deleted_at = clock_timestamp(),
        text_content = NULL,
        link_url = NULL,
        latitude = NULL,
        longitude = NULL,
        location_label = NULL
    WHERE message.id IN (SELECT expired.id FROM expired)
    RETURNING message.id
  ), claims AS (
    UPDATE public.expiration_cleanup_queue AS cleanup
    SET status = 'processing',
        attempts = cleanup.attempts + 1,
        next_attempt_at = clock_timestamp() + interval '5 minutes'
    WHERE cleanup.id IN (
      SELECT ready.id
      FROM public.expiration_cleanup_queue AS ready
      WHERE ready.status IN ('pending', 'processing')
        AND ready.next_attempt_at <= clock_timestamp()
      ORDER BY ready.created_at
      FOR UPDATE SKIP LOCKED
      LIMIT p_batch_size
    )
    RETURNING cleanup.id, cleanup.message_id, cleanup.attachment_id, cleanup.bucket, cleanup.storage_key
  )
  SELECT claims.id, claims.message_id, claims.attachment_id, claims.bucket, claims.storage_key
  FROM claims;
END;
$$;

REVOKE ALL ON FUNCTION public.prepare_expired_cleanup(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_expired_cleanup(integer) TO project_admin;
