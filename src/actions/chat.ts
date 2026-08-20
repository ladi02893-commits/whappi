'use server'

import { queryWithAuth } from '@/lib/db'
import {
  Profile,
  FriendRequest,
  Friendship,
  Conversation,
  Message,
} from '@/types/database'

export async function ensureProfile(): Promise<Profile> {
  const result = await queryWithAuth('SELECT * FROM ensure_profile()');
  return result.rows[0] as Profile;
}

export async function updateProfile(id: string, updates: Partial<Profile>): Promise<Profile> {
  const keys = Object.keys(updates);
  if (keys.length === 0) {
    const result = await queryWithAuth(`SELECT * FROM profiles WHERE id = $1`, [id]);
    return result.rows[0] as Profile;
  }
  
  const setClause = keys.map((key, i) => `${key} = $${i + 2}`).join(', ');
  const values = keys.map(key => (updates as any)[key]);
  
  const result = await queryWithAuth(`UPDATE profiles SET ${setClause} WHERE id = $1 RETURNING *`, [id, ...values]);
  return result.rows[0] as Profile;
}

export async function loadSocialState() {
  const [profilesResult, requestsResult, friendshipsResult, conversationsResult] = await Promise.all([
    queryWithAuth('SELECT id, username, display_name, avatar_url, bio, created_at, updated_at FROM profiles LIMIT 250'),
    queryWithAuth('SELECT id, sender_id, receiver_id, status, created_at, responded_at FROM friend_requests ORDER BY created_at DESC LIMIT 250'),
    queryWithAuth('SELECT id, user_low_id, user_high_id, created_at FROM friendships ORDER BY created_at DESC LIMIT 250'),
    queryWithAuth('SELECT id, type, user_low_id, user_high_id, retention_mode, retention_seconds, created_by, created_at, updated_at FROM conversations ORDER BY updated_at DESC LIMIT 150'),
  ]);

  return {
    profiles: profilesResult.rows as Profile[],
    requests: requestsResult.rows as FriendRequest[],
    friendships: friendshipsResult.rows as Friendship[],
    conversations: conversationsResult.rows as Conversation[],
  }
}

export async function searchProfiles(query: string, page: number, pageSize = 20): Promise<Profile[]> {
  const safeQuery = query.trim().slice(0, 80).replace(/[(),%]/g, '');
  const limit = pageSize;
  const offset = page * pageSize;
  
  let sql = 'SELECT id, username, display_name, avatar_url, bio, created_at, updated_at FROM profiles';
  let params: any[] = [];
  
  if (safeQuery) {
    sql += ' WHERE display_name ILIKE $1 OR username ILIKE $1';
    params.push(`%\${safeQuery}%`);
  }
  
  sql += ` ORDER BY display_name LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
  params.push(limit, offset);
  
  const result = await queryWithAuth(sql, params);
  return result.rows as Profile[];
}

export async function sendFriendRequest(receiverId: string) {
  await queryWithAuth('SELECT send_friend_request($1)', [receiverId]);
}

export async function respondToFriendRequest(requestId: string, action: 'accepted' | 'rejected') {
  await queryWithAuth('SELECT respond_friend_request($1, $2)', [requestId, action]);
}

export async function cancelFriendRequest(requestId: string) {
  await queryWithAuth('SELECT cancel_friend_request($1)', [requestId]);
}

export async function removeFriend(friendId: string) {
  await queryWithAuth('SELECT unfriend($1)', [friendId]);
}

export async function startConversation(friendId: string): Promise<Conversation> {
  const result = await queryWithAuth('SELECT * FROM create_or_get_conversation($1)', [friendId]);
  return result.rows[0] as Conversation;
}

export async function setRetentionMode(conversationId: string, seconds: number | null) {
  await queryWithAuth('SELECT set_retention_mode($1, $2)', [conversationId, seconds]);
}

export async function clearChat(conversationId: string) {
  await queryWithAuth('SELECT clear_chat($1)', [conversationId]);
}

export async function loadMessages(conversationId: string, before?: string, pageSize = 20): Promise<Message[]> {
  let sql = `
    SELECT m.*, 
      (SELECT json_agg(row_to_json(ma.*)) FROM message_attachments ma WHERE ma.message_id = m.id) as message_attachments
    FROM messages m 
    WHERE m.conversation_id = $1 
  `;
  const params: any[] = [conversationId];
  
  if (before) {
    sql += ` AND m.created_at < $2 `;
    params.push(before);
  }
  
  sql += ` ORDER BY m.created_at DESC, m.id DESC LIMIT $${params.length + 1}`;
  params.push(pageSize);
  
  const result = await queryWithAuth(sql, params);
  return (result.rows as Message[]).reverse();
}

export async function sendMessageRpc(payload: any): Promise<Message> {
  const result = await queryWithAuth(`
    SELECT * FROM send_message(
      $1::uuid, $2::uuid, $3::text, $4::text, $5::text, $6::double precision, $7::double precision, $8::text, $9::jsonb
    )
  `, [
    payload.conversationId,
    payload.messageId,
    payload.type,
    payload.text ?? null,
    payload.link ?? null,
    payload.latitude ?? null,
    payload.longitude ?? null,
    payload.locationLabel ?? null,
    payload.attachment ? JSON.stringify(payload.attachment) : null
  ]);
  
  return result.rows[0] as Message;
}

export async function loadMessage(messageId: string): Promise<Message | null> {
  const result = await queryWithAuth(`
    SELECT m.*, 
      (SELECT json_agg(row_to_json(ma.*)) FROM message_attachments ma WHERE ma.message_id = m.id) as message_attachments
    FROM messages m 
    WHERE m.id = $1
  `, [messageId]);
  
  return (result.rows[0] as Message) || null;
}

export async function updateMessage(messageId: string, updates: Partial<Message>) {
  const keys = Object.keys(updates);
  if (keys.length === 0) return;
  
  const setClause = keys.map((key, i) => `${key} = $${i + 2}`).join(', ');
  const values = keys.map(key => (updates as any)[key]);
  
  await queryWithAuth(`UPDATE messages SET ${setClause} WHERE id = $1`, [messageId, ...values]);
}

export async function markConversationRead(conversationId: string, lastMessageId: string) {
  await queryWithAuth(`SELECT mark_conversation_read($1, $2)`, [conversationId, lastMessageId]);
}

export async function markMessagesViewed(conversationId: string, messageIds: string[]) {
  if (messageIds.length === 0) return;
  await queryWithAuth('SELECT mark_messages_viewed($1, $2)', [conversationId, messageIds]);
}

export async function changeRetention(conversationId: string, mode: string, customSeconds: number | null) {
  await queryWithAuth('SELECT change_retention($1, $2, $3)', [conversationId, mode, customSeconds]);
}

export async function clearConversation(conversationId: string) {
  await queryWithAuth('SELECT clear_chat($1)', [conversationId]);
}

export async function deleteOwnMessage(messageId: string) {
  await queryWithAuth('SELECT delete_own_message($1)', [messageId]);
}

import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const s3Client = new S3Client({
  region: process.env.S3_REGION || "us-east-1",
  endpoint: process.env.S3_ENDPOINT,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || "",
  },
  forcePathStyle: true,
});

export async function getPresignedUploadUrl(bucket: string, storageKey: string, contentType: string) {
  try {
    const command = new PutObjectCommand({
      Bucket: process.env.S3_BUCKET_NAME || bucket,
      Key: storageKey,
      ContentType: contentType,
    });
    
    const signedUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
    return signedUrl;
  } catch (error) {
    console.error("Error generating presigned URL:", error);
    return null;
  }
}

export async function deleteS3Object(bucket: string, storageKey: string) {
  try {
    const command = new DeleteObjectCommand({
      Bucket: process.env.S3_BUCKET_NAME || bucket,
      Key: storageKey,
    });
    await s3Client.send(command);
  } catch (error) {
    console.error("Error deleting S3 object:", error);
  }
}

