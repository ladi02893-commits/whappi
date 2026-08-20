import { createClient } from '@insforge/sdk'

const run = process.env.RUN_INSFORGE_INTEGRATION === 'true'
const baseUrl = process.env.NEXT_PUBLIC_INSFORGE_URL
const anonKey = process.env.NEXT_PUBLIC_INSFORGE_ANON_KEY
const integration = run && baseUrl && anonKey ? describe : describe.skip

integration('WHAPPI three-user RLS integration', () => {
  const clients = ['a', 'b', 'c'].map(() =>
    createClient({ baseUrl: baseUrl!, anonKey: anonKey! }),
  )
  const ids: string[] = []
  let conversationId = ''
  const stamp = `${Date.now()}-${Math.random().toString(16).slice(2)}`

  beforeAll(async () => {
    for (const [index, client] of clients.entries()) {
      const { data, error } = await client.auth.signUp({
        email: `whappi-rls-${stamp}-${index}@example.com`,
        password: `Wha!${stamp}xY9`,
        name: `RLS User ${index}`,
        autoConfirm: true,
      })
      if (error || !data?.user)
        throw new Error(
          error?.message ??
            `Could not create integration user (${JSON.stringify(data)})`,
        )
      ids.push(data.user.id)
      const ensured = await client.database.rpc('ensure_profile')
      if (ensured.error) throw new Error(ensured.error.message)
    }
    const request = await clients[0]!.database.rpc('send_friend_request', {
      p_receiver_id: ids[1],
    })
    if (request.error) throw new Error(request.error.message)
    const pending = await clients[1]!.database
      .from('friend_requests')
      .select('id')
      .eq('sender_id', ids[0])
      .single()
    if (pending.error) throw new Error(pending.error.message)
    const accepted = await clients[1]!.database.rpc('respond_friend_request', {
      p_request_id: pending.data.id,
      p_action: 'accepted',
    })
    if (accepted.error) throw new Error(accepted.error.message)
    const conversation = await clients[0]!.database
      .rpc('create_or_get_conversation', { p_friend_id: ids[1] })
      .single()
    if (conversation.error) throw new Error(conversation.error.message)
    conversationId = (conversation.data as { id: string }).id
  })

  it('prevents a third user from reading a private conversation', async () => {
    const result = await clients[2]!.database
      .from('conversations')
      .select('id')
      .eq('id', conversationId)
    expect(result.error).toBeNull()
    expect(result.data).toEqual([])
  })

  it('prevents a non-friend from sending a message', async () => {
    const result = await clients[2]!.database.rpc('send_message', {
      p_conversation_id: conversationId,
      p_message_id: crypto.randomUUID(),
      p_message_type: 'text',
      p_text_content: 'intrusion',
    })
    expect(result.error).not.toBeNull()
  })

  it('prevents accepting a request addressed to another user', async () => {
    await clients[2]!.database.rpc('send_friend_request', {
      p_receiver_id: ids[1],
    })
    const request = await clients[2]!.database
      .from('friend_requests')
      .select('id')
      .eq('receiver_id', ids[1])
      .eq('status', 'pending')
      .single()
    const result = await clients[0]!.database.rpc('respond_friend_request', {
      p_request_id: request.data!.id,
      p_action: 'accepted',
    })
    expect(result.error).not.toBeNull()
  })

  it('prevents attachment access outside the conversation', async () => {
    const messageId = crypto.randomUUID()
    const key = `conversations/${conversationId}/${messageId}/${crypto.randomUUID()}.txt`
    const upload = await clients[0]!.storage
      .from('chat-documents')
      .upload(key, new Blob(['private'], { type: 'text/plain' }))
    expect(upload.error).toBeNull()
    const sent = await clients[0]!.database.rpc('send_message', {
      p_conversation_id: conversationId,
      p_message_id: messageId,
      p_message_type: 'document',
      p_attachment: {
        bucket: 'chat-documents',
        storage_key: upload.data!.key,
        url: upload.data!.url,
        original_name: 'private.txt',
        mime_type: 'text/plain',
        size_bytes: 7,
      },
    })
    expect(sent.error).toBeNull()
    const denied = await clients[2]!.storage
      .from('chat-documents')
      .download(key)
    expect(denied.error).not.toBeNull()
  })

  it('prevents altering another user receipt', async () => {
    const result = await clients[0]!.database
      .from('message_receipts')
      .update({ viewed_at: new Date().toISOString() })
      .eq('user_id', ids[1])
    expect(result.error).not.toBeNull()
  })

  it('lets only the sender delete a message and hides it from both users', async () => {
    const messageId = crypto.randomUUID()
    const sent = await clients[0]!.database.rpc('send_message', {
      p_conversation_id: conversationId,
      p_message_id: messageId,
      p_message_type: 'text',
      p_text_content: 'sender-owned message',
    })
    expect(sent.error).toBeNull()

    const denied = await clients[1]!.database.rpc('delete_own_message', {
      p_message_id: messageId,
    })
    expect(denied.error).not.toBeNull()

    const deleted = await clients[0]!.database.rpc('delete_own_message', {
      p_message_id: messageId,
    })
    expect(deleted.error).toBeNull()

    for (const participant of clients.slice(0, 2)) {
      const hidden = await participant.database
        .from('messages')
        .select('id')
        .eq('id', messageId)
      expect(hidden.error).toBeNull()
      expect(hidden.data).toEqual([])
    }
  })

  it('hides an instant-after-view message immediately and does not create duplicate conversations', async () => {
    await clients[0]!.database.rpc('change_retention', {
      p_conversation_id: conversationId,
      p_mode: 'instant_after_view',
      p_custom_seconds: null,
    })
    const messageId = crypto.randomUUID()
    await clients[0]!.database.rpc('send_message', {
      p_conversation_id: conversationId,
      p_message_id: messageId,
      p_message_type: 'text',
      p_text_content: 'ephemeral',
    })
    const viewed = await clients[1]!.database.rpc('mark_messages_viewed', {
      p_conversation_id: conversationId,
      p_message_ids: [messageId],
    })
    expect(viewed.error).toBeNull()
    const hidden = await clients[0]!.database
      .from('messages')
      .select('id')
      .eq('id', messageId)
    expect(hidden.data).toEqual([])
    const again = await clients[0]!.database
      .rpc('create_or_get_conversation', { p_friend_id: ids[1] })
      .single()
    expect((again.data as { id: string }).id).toBe(conversationId)
  })

  it('deletes an expired attachment from private storage through the scheduled cleanup worker', async () => {
    const messageId = crypto.randomUUID()
    const key = `conversations/${conversationId}/${messageId}/${crypto.randomUUID()}.txt`
    const upload = await clients[0]!.storage
      .from('chat-documents')
      .upload(key, new Blob(['expires'], { type: 'text/plain' }))
    expect(upload.error).toBeNull()

    const sent = await clients[0]!.database.rpc('send_message', {
      p_conversation_id: conversationId,
      p_message_id: messageId,
      p_message_type: 'document',
      p_attachment: {
        bucket: 'chat-documents',
        storage_key: upload.data!.key,
        url: upload.data!.url,
        original_name: 'expires.txt',
        mime_type: 'text/plain',
        size_bytes: 7,
      },
    })
    expect(sent.error).toBeNull()

    const available = await clients[0]!.storage
      .from('chat-documents')
      .download(key)
    expect(available.error).toBeNull()

    const viewed = await clients[1]!.database.rpc('mark_messages_viewed', {
      p_conversation_id: conversationId,
      p_message_ids: [messageId],
    })
    expect(viewed.error).toBeNull()

    const deadline = Date.now() + 90_000
    let deleted = false
    while (Date.now() < deadline) {
      const download = await clients[0]!.storage
        .from('chat-documents')
        .download(key)
      if (download.error) {
        deleted = true
        break
      }
      await new Promise((resolve) => setTimeout(resolve, 3_000))
    }

    expect(deleted).toBe(true)
  }, 110_000)
})
