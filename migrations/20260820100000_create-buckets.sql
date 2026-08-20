INSERT INTO storage.buckets (name, public)
VALUES 
  ('chat-media', false),
  ('chat-documents', false)
ON CONFLICT (name) DO NOTHING;
