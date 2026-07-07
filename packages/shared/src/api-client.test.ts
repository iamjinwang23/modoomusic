import { describe, it, expect, vi } from 'vitest'
import { createApiClient } from './api-client'

describe('api-client', () => {
  it('토큰이 있으면 Authorization 헤더 첨부', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) })
    const api = createApiClient({ baseUrl: 'https://x', getToken: async () => 'TKN', fetchImpl: fetchMock as unknown as typeof fetch })
    await api.get('/api/ping')
    const init = fetchMock.mock.calls[0][1]
    expect(init.headers.Authorization).toBe('Bearer TKN')
  })
  it('토큰 없으면 Authorization 헤더 없음', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) })
    const api = createApiClient({ baseUrl: 'https://x', getToken: async () => null, fetchImpl: fetchMock as unknown as typeof fetch })
    await api.get('/api/ping')
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBeUndefined()
  })
  it('비-2xx면 error 코드로 throw', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 403, json: async () => ({ error: 'forbidden' }) })
    const api = createApiClient({ baseUrl: 'https://x', getToken: async () => null, fetchImpl: fetchMock as unknown as typeof fetch })
    await expect(api.get('/api/x')).rejects.toMatchObject({ error: 'forbidden', status: 403 })
  })
})
