export type FriendRequestStatus =
  'pending' | 'accepted' | 'rejected' | 'cancelled'
export type MessageType =
  'text' | 'image' | 'video' | 'voice' | 'document' | 'link' | 'location'
export type RetentionMode =
  | '24_hours'
  | '12_hours'
  | '3_hours'
  | 'instant_after_view'
  | '5_minutes_after_view'
  | 'never'
  | 'custom'

export interface Profile {
  id: string
  username: string
  display_name: string
  avatar_url: string | null
  bio: string | null
  created_at: string
  updated_at: string
}

export interface FriendRequest {
  id: string
  sender_id: string
  receiver_id: string
  status: FriendRequestStatus
  created_at: string
  responded_at: string | null
}

export interface Friendship {
  id: string
  user_low_id: string
  user_high_id: string
  created_at: string
}

export interface Conversation {
  id: string
  type: 'direct'
  user_low_id: string
  user_high_id: string
  retention_mode: RetentionMode
  retention_seconds: number | null
  created_by: string
  created_at: string
  updated_at: string
}

export interface Attachment {
  id: string
  message_id: string
  bucket: 'chat-media' | 'chat-documents'
  storage_key: string
  url: string
  original_name: string
  mime_type: string
  size_bytes: number
  duration_seconds: number | null
  width: number | null
  height: number | null
  created_at: string
}

export interface MessageReceipt {
  message_id: string
  user_id: string
  viewed_at: string
}

export interface Message {
  id: string
  conversation_id: string
  sender_id: string
  message_type: MessageType
  text_content: string | null
  link_url: string | null
  latitude: number | null
  longitude: number | null
  location_label: string | null
  retention_mode: RetentionMode
  retention_seconds: number | null
  is_system: boolean
  created_at: string
  expires_at: string | null
  deleted_at: string | null
  message_attachments?: Attachment[]
  message_receipts?: MessageReceipt[]
  delivery?: 'pending' | 'sent' | 'failed'
}

export interface PendingAttachment {
  file: File
  kind: Extract<MessageType, 'image' | 'video' | 'voice' | 'document'>
  previewUrl: string | null
  durationSeconds?: number
}
