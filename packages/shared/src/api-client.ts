import type { ApiErrorCode } from './errors'

export interface ApiClientOpts {
  baseUrl: string
  getToken: () => Promise<string | null>
  fetchImpl?: typeof fetch
}
export interface ApiError { error: ApiErrorCode | string; status: number }

// 웹/앱 공용 typed fetch — Bearer 토큰 자동 첨부, 비-2xx면 { error, status } throw.
export function createApiClient(opts: ApiClientOpts) {
  const doFetch = opts.fetchImpl ?? fetch
  async function req(method: string, path: string, body?: unknown) {
    const token = await opts.getToken()
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (token) headers.Authorization = `Bearer ${token}`
    const res = await doFetch(`${opts.baseUrl}${path}`, {
      method, headers, body: body === undefined ? undefined : JSON.stringify(body),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) throw { error: json.error ?? 'internal', status: res.status } as ApiError
    return json
  }
  return {
    get: (p: string) => req('GET', p),
    post: (p: string, body?: unknown) => req('POST', p, body),
    patch: (p: string, body?: unknown) => req('PATCH', p, body),
    del: (p: string) => req('DELETE', p),
  }
}
