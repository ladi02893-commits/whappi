import { createAdminClient } from 'npm:@insforge/sdk'

type CleanupItem = {
  out_queue_id: string
  out_message_id: string
  out_attachment_id: string | null
  out_bucket: string | null
  out_storage_key: string | null
}

const jsonHeaders = { 'content-type': 'application/json; charset=utf-8' }

export default async function cleanupExpired(
  request: Request,
): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204 })
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: jsonHeaders,
    })
  }

  const expectedSecret = Deno.env.get('WHAPPI_CLEANUP_SECRET')
  const suppliedSecret = request.headers.get('x-whappi-cleanup')
  if (!expectedSecret || suppliedSecret !== expectedSecret) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: jsonHeaders,
    })
  }

  const baseUrl = Deno.env.get('INSFORGE_BASE_URL')
  const apiKey = Deno.env.get('API_KEY')
  if (!baseUrl || !apiKey) {
    console.error('cleanup configuration missing')
    return new Response(
      JSON.stringify({ error: 'Cleanup service is not configured' }),
      {
        status: 503,
        headers: jsonHeaders,
      },
    )
  }

  const admin = createAdminClient({ baseUrl, apiKey })
  const { data, error } = await admin.database.rpc('prepare_expired_cleanup', {
    p_batch_size: 100,
  })
  if (error) {
    console.error('cleanup claim failed', { code: error.error })
    return new Response(
      JSON.stringify({ error: 'Unable to claim cleanup work' }),
      {
        status: 500,
        headers: jsonHeaders,
      },
    )
  }

  const items = (data ?? []) as CleanupItem[]
  let completed = 0
  let failed = 0

  for (const item of items) {
    let success = true
    let failureReason: string | null = null

    if (item.out_bucket && item.out_storage_key) {
      const { error: removeError } = await admin.storage
        .from(item.out_bucket)
        .remove(item.out_storage_key)
      if (removeError) {
        success = false
        failureReason = removeError.message || 'Storage deletion failed'
      }
    }

    const { error: ackError } = await admin.database.rpc(
      'complete_expired_cleanup',
      {
        p_queue_id: item.out_queue_id,
        p_success: success,
        p_error: failureReason,
      },
    )

    if (ackError || !success) {
      failed += 1
      console.error('cleanup item failed', {
        queueId: item.out_queue_id,
        stage: ackError ? 'acknowledge' : 'storage',
      })
    } else {
      completed += 1
    }
  }

  return new Response(
    JSON.stringify({ claimed: items.length, completed, failed }),
    {
      status: failed > 0 ? 207 : 200,
      headers: jsonHeaders,
    },
  )
}
