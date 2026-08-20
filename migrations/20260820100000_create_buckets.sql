INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES 
  ('chat-media', 'chat-media', false, 52428800, null),
  ('chat-documents', 'chat-documents', false, 52428800, null)
ON CONFLICT (id) DO NOTHING;
