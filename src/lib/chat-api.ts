import { z } from 'zod'
import {
  httpUrlSchema,
  randomStorageName,
  validateFile,
  type FileKind,
} from '@/lib/validation'
import { generateId } from '@/lib/utils'
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

import * as chatActions from '@/actions/chat'

const recordIdSchema = z.string().uuid()

export async function loadSocialState() {
  return chatActions.loadSocialState();
}

export async function searchProfiles(
  query: string,
  page: number,
  pageSize = 20,
): Promise<Profile[]> {
  return chatActions.searchProfiles(query, page, pageSize);
}

export async function sendFriendRequest(receiverId: string) {
  return chatActions.sendFriendRequest(receiverId);
}

export async function respondToFriendRequest(
  requestId: string,
  action: 'accepted' | 'rejected',
) {
  return chatActions.respondToFriendRequest(requestId, action);
}

export async function cancelFriendRequest(requestId: string) {
  return chatActions.cancelFriendRequest(requestId);
}

export async function removeFriend(friendId: string) {
  return chatActions.removeFriend(friendId);
}

export async function startConversation(
  friendId: string,
): Promise<Conversation> {
  return chatActions.startConversation(friendId);
}

export async function loadMessages(
  conversationId: string,
  before?: string,
  pageSize = 50,
): Promise<Message[]> {
  return chatActions.loadMessages(conversationId, before, pageSize);
}

export async function loadMessage(messageId: string): Promise<Message | null> {
  return chatActions.loadMessage(messageId);
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
  return chatActions.sendMessageRpc(payload);
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
  
  const uploadUrl = await chatActions.getPresignedUploadUrl(bucket, storageKey, attachment.file.type);
  if (!uploadUrl) throw new Error('Could not get upload url');
  
  await new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("PUT", uploadUrl, true);
      xhr.setRequestHeader("Content-Type", attachment.file.type);
      xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
              const p = Math.round((e.loaded / e.total) * 100);
              onProgress(Math.min(p, 90));
          }
      };
      xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
              resolve(null);
          } else {
              reject(new Error("Upload failed"));
          }
      };
      xhr.onerror = () => reject(new Error("Upload failed"));
      xhr.send(attachment.file);
  });
  
  const url = `https://${process.env.NEXT_PUBLIC_S3_BUCKET_NAME || bucket}.s3.amazonaws.com/${storageKey}`;
  
  onProgress(100)
  return {
    bucket,
    storage_key: storageKey,
    url,
    original_name: attachment.file.name || (kind === 'voice' ? 'voice-note.webm' : 'attachment'),
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
  await chatActions.deleteS3Object(bucket, storageKey);
}

export async function downloadAttachment(
  attachment: Attachment,
): Promise<Blob> {
  const res = await fetch(attachment.url);
  if (!res.ok) throw new Error('Download failed');
  return res.blob();
}

export async function markViewed(conversationId: string, ids: string[]) {
  return chatActions.markMessagesViewed(conversationId, ids);
}

export async function updateRetention(
  conversationId: string,
  mode: RetentionMode,
  customSeconds: number | null,
) {
  return chatActions.changeRetention(conversationId, mode, customSeconds);
}

export async function clearConversation(conversationId: string) {
  const validConversationId = recordIdSchema.parse(conversationId)
  return chatActions.clearConversation(validConversationId);
}

export async function deleteOwnMessage(messageId: string) {
  const validMessageId = recordIdSchema.parse(messageId)
  return chatActions.deleteOwnMessage(validMessageId);
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
