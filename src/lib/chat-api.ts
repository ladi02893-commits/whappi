import { z } from 'zod'
import { getInsForgeBrowserClient } from '@/lib/insforge/client'
import {
  httpUrlSchema,
  randomStorageName,
  validateFile,
  type FileKind,
} from '@/lib/validation'
import type {
  Attachment,
  Conversation,
  FriendRequest,
  Friendship,
  Message,
  MessageType,
  PendingAttachment,
  Profile,
  RetentionMode,
} from '@/types/database'

const client = () => getInsForgeBrowserClient()
const recordIdSchema = z.string().uuid()

function throwIfError(
  error: { message?: string } | null,
  fallback: string,
): void {
  if (error) throw new Error(error.message || fallback)
}

export async function loadSocialState() {
  const [
    profilesResult,
    requestsResult,
    friendshipsResult,
    conversationsResult,
  ] = await Promise.all([
    client()
      .database.from('profiles')
      .select(
        'id, username, display_name, avatar_url, bio, created_at, updated_at',
      )
      .limit(250),
    client()
      .database.from('friend_requests')
      .select('id, sender_id, receiver_id, status, created_at, responded_at')
      .order('created_at', { ascending: false })
      .limit(250),
    client()
      .database.from('friendships')
      .select('id, user_low_id, user_high_id, created_at')
      .order('created_at', { ascending: false })
      .limit(250),
    client()
      .database.from('conversations')
      .select(
        'id, type, user_low_id, user_high_id, retention_mode, retention_seconds, created_by, created_at, updated_at',
      )
      .order('updated_at', { ascending: false })
      .limit(150),
  ])
  throwIfError(profilesResult.error, 'Could not load profiles')
  throwIfError(requestsResult.error, 'Could not load friend requests')
  throwIfError(friendshipsResult.error, 'Could not load friends')
  throwIfError(conversationsResult.error, 'Could not load conversations')
  return {
    profiles: (profilesResult.data ?? []) as Profile[],
    requests: (requestsResult.data ?? []) as FriendRequest[],
    friendships: (friendshipsResult.data ?? []) as Friendship[],
    conversations: (conversationsResult.data ?? []) as Conversation[],
  }
}

export async function searchProfiles(
  query: string,
  page: number,
  pageSize = 20,
): Promise<Profile[]> {
  const safeQuery = query
    .trim()
    .slice(0, 80)
    .replace(/[(),%]/g, '')
  let builder = client()
    .database.from('profiles')
    .select(
      'id, username, display_name, avatar_url, bio, created_at, updated_at',
    )
    .order('display_name')
    .range(page * pageSize, page * pageSize + pageSize - 1)
  if (safeQuery)
    builder = builder.or(
      `display_name.ilike.%${safeQuery}%,username.ilike.%${safeQuery}%`,
    )
  const { data, error } = await builder
  throwIfError(error, 'Could not search people')
  return (data ?? []) as Profile[]
}

export async function sendFriendRequest(receiverId: string) {
  const { error } = await client().database.rpc('send_friend_request', {
    p_receiver_id: receiverId,
  })
  throwIfError(error, 'Could not send friend request')
}

export async function respondToFriendRequest(
  requestId: string,
  action: 'accepted' | 'rejected',
) {
  const { error } = await client().database.rpc('respond_friend_request', {
    p_request_id: requestId,
    p_action: action,
  })
  throwIfError(error, 'Could not update friend request')
}

export async function cancelFriendRequest(requestId: string) {
  const { error } = await client().database.rpc('cancel_friend_request', {
    p_request_id: requestId,
  })
  throwIfError(error, 'Could not cancel friend request')
}

export async function removeFriend(friendId: string) {
  const { error } = await client().database.rpc('unfriend', {
    p_friend_id: friendId,
  })
  throwIfError(error, 'Could not remove friend')
}

export async function startConversation(
  friendId: string,
): Promise<Conversation> {
  const { data, error } = await client()
    .database.rpc('create_or_get_conversation', { p_friend_id: friendId })
    .single()
  throwIfError(error, 'Could not start conversation')
  return data as Conversation
}

const messageColumns = `id, conversation_id, sender_id, message_type, text_content, link_url, latitude, longitude, location_label, retention_mode, retention_seconds, is_system, created_at, expires_at, deleted_at, message_attachments(id, message_id, bucket, storage_key, url, original_name, mime_type, size_bytes, duration_seconds, width, height, created_at), message_receipts(message_id, user_id, viewed_at)`

export async function loadMessages(
  conversationId: string,
  before?: string,
  pageSize = 40,
): Promise<Message[]> {
  let builder = client()
    .database.from('messages')
    .select(messageColumns)
    .eq('conversation_id', conversationId)
  if (before) builder = builder.lt('created_at', before)
  const { data, error } = await builder
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(pageSize)
  throwIfError(error, 'Could not load messages')
  return ((data ?? []) as unknown as Message[]).reverse()
}

export async function loadMessage(messageId: string): Promise<Message | null> {
  const { data, error } = await client()
    .database.from('messages')
    .select(messageColumns)
    .eq('id', messageId)
    .maybeSingle()
  throwIfError(error, 'Could not load message')
  return data as unknown as Message | null
}

type SendPayload = {
  conversationId: string
  messageId: string
  type: MessageType
  text?: string | null
  link?: string | null
  latitude?: number | null
  longitude?: number | null
  locationLabel?: string | null
  attachment?: Omit<Attachment, 'id' | 'message_id' | 'created_at'> | null
}

export async function sendMessage(payload: SendPayload): Promise<Message> {
  const { data, error } = await client()
    .database.rpc('send_message', {
      p_conversation_id: payload.conversationId,
      p_message_id: payload.messageId,
      p_message_type: payload.type,
      p_text_content: payload.text ?? null,
      p_link_url: payload.link ?? null,
      p_latitude: payload.latitude ?? null,
      p_longitude: payload.longitude ?? null,
      p_location_label: payload.locationLabel ?? null,
      p_attachment: payload.attachment ?? null,
    })
    .single()
  throwIfError(error, 'Message could not be sent')
  return {
    ...(data as Message),
    message_attachments: payload.attachment
      ? [
          {
            ...payload.attachment,
            id: crypto.randomUUID(),
            message_id: payload.messageId,
            created_at: new Date().toISOString(),
          },
        ]
      : [],
  }
}

export async function uploadAttachment(
  conversationId: string,
  messageId: string,
  attachment: PendingAttachment,
  onProgress: (progress: number) => void,
): Promise<Omit<Attachment, 'id' | 'message_id' | 'created_at'>> {
  const kind = attachment.kind as FileKind
  const validation = validateFile(attachment.file, kind)
  if (!validation.valid) throw new Error(validation.message)
  const bucket = kind === 'document' ? 'chat-documents' : 'chat-media'
  const storageKey = `conversations/${conversationId}/${messageId}/${randomStorageName(attachment.file)}`
  onProgress(12)
  const { data, error } = await client()
    .storage.from(bucket)
    .upload(storageKey, attachment.file)
  throwIfError(error, 'Upload failed')
  if (!data) throw new Error('Upload returned no file metadata')
  onProgress(78)
  return {
    bucket,
    storage_key: data.key,
    url: data.url,
    original_name:
      attachment.file.name ||
      (kind === 'voice' ? 'voice-note.webm' : 'attachment'),
    mime_type: attachment.file.type,
    size_bytes: attachment.file.size,
    duration_seconds: attachment.durationSeconds ?? null,
    width: null,
    height: null,
  }
}

export async function removeOrphanAttachment(
  bucket: string,
  storageKey: string,
): Promise<void> {
  await client().storage.from(bucket).remove(storageKey)
}

export async function downloadAttachment(
  attachment: Attachment,
): Promise<Blob> {
  const { data, error } = await client()
    .storage.from(attachment.bucket)
    .download(attachment.storage_key)
  throwIfError(error, 'Download failed')
  if (!data) throw new Error('Download returned no data')
  return data
}

export async function markViewed(conversationId: string, ids: string[]) {
  if (!ids.length) return
  const { error } = await client().database.rpc('mark_messages_viewed', {
    p_conversation_id: conversationId,
    p_message_ids: ids,
  })
  throwIfError(error, 'Could not update read receipts')
}

export async function updateRetention(
  conversationId: string,
  mode: RetentionMode,
  customSeconds: number | null,
) {
  const { error } = await client().database.rpc('change_retention', {
    p_conversation_id: conversationId,
    p_mode: mode,
    p_custom_seconds: customSeconds,
  })
  throwIfError(error, 'Could not update disappearing messages')
}

export async function clearConversation(conversationId: string) {
  const validConversationId = recordIdSchema.parse(conversationId)
  const { error } = await client().database.rpc('clear_chat', {
    p_conversation_id: validConversationId,
  })
  throwIfError(error, 'Could not clear chat')
}

export async function deleteOwnMessage(messageId: string) {
  const validMessageId = recordIdSchema.parse(messageId)
  const { error } = await client().database.rpc('delete_own_message', {
    p_message_id: validMessageId,
  })
  throwIfError(error, 'Message could not be deleted')
}

export function classifyText(
  text: string,
): { type: 'link'; link: string } | { type: 'text'; text: string } {
  const trimmed = text.trim()
  const link = httpUrlSchema.safeParse(trimmed)
  return link.success
    ? { type: 'link', link: link.data }
    : { type: 'text', text: trimmed }
}
