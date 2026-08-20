ALTER TABLE public.messages DROP CONSTRAINT messages_payload;

ALTER TABLE public.messages ADD CONSTRAINT messages_payload CHECK (
  (
    deleted_at IS NOT NULL
    AND text_content IS NULL
    AND link_url IS NULL
    AND latitude IS NULL
    AND longitude IS NULL
    AND location_label IS NULL
  )
  OR
  (
    deleted_at IS NULL
    AND (
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
  )
);

COMMENT ON CONSTRAINT messages_payload ON public.messages IS
  'Live rows validate payload by message type; expired rows must be irreversibly scrubbed.';
