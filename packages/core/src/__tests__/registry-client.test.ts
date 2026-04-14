import { RegistryClient } from '../parsers/registry-client';

function mockResponse(status: number, body: string, headers?: Record<string, string>): Response {
  return new Response(body, {
    status,
    headers: headers ?? { 'content-type': 'application/json' },
  });
}

describe('RegistryClient', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('returns npm metadata on 200', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      mockResponse(
        200,
        JSON.stringify({
          name: 'left-pad',
          description: 'pad',
          time: { created: '2015-10-26T01:25:45.025Z' },
          'dist-tags': { latest: '1.3.0' },
          license: 'WTFPL',
        })
      )
    ) as unknown as typeof fetch;

    const c = new RegistryClient({ cacheTtlMs: 60_000, maxRetries: 0 });
    const info = await c.getNpmPackage('left-pad');
    expect(info.exists).toBe(true);
    expect(info.latestVersion).toBe('1.3.0');
    expect(info.created).toContain('2015');
  });

  it('marks npm package missing on 404', async () => {
    global.fetch = jest.fn().mockResolvedValue(mockResponse(404, '')) as unknown as typeof fetch;
    const c = new RegistryClient({ maxRetries: 0 });
    const info = await c.getNpmPackage('definitely-missing-pkg-xyz-12345');
    expect(info.exists).toBe(false);
  });

  it('uses cache on second npm request', async () => {
    const fn = jest.fn().mockResolvedValue(
      mockResponse(
        200,
        JSON.stringify({
          name: 'once',
          time: { created: '2020-01-01T00:00:00.000Z' },
          'dist-tags': { latest: '1.0.0' },
        })
      )
    );
    global.fetch = fn as unknown as typeof fetch;

    const c = new RegistryClient({ cacheTtlMs: 300_000, maxRetries: 0 });
    await c.getNpmPackage('once');
    await c.getNpmPackage('once');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('returns PyPI metadata on 200', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      mockResponse(
        200,
        JSON.stringify({
          info: { name: 'requests', summary: 'HTTP', version: '2.31.0' },
          urls: [{ upload_time: '2023-05-03T00:00:00Z' }],
        })
      )
    ) as unknown as typeof fetch;

    const c = new RegistryClient({ maxRetries: 0 });
    const info = await c.getPypiPackage('requests');
    expect(info.exists).toBe(true);
    expect(info.latestVersion).toBe('2.31.0');
  });

  it('retries on 429 then succeeds', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const seq = [
        mockResponse(429, 'slow down', { 'retry-after': '0' }),
        mockResponse(
          200,
          JSON.stringify({
            name: 'retry-pkg',
            time: { created: '2020-01-01T00:00:00.000Z' },
            'dist-tags': { latest: '1.0.0' },
          })
        ),
      ];
      let i = 0;
      global.fetch = jest.fn().mockImplementation(() => {
        const r = seq[Math.min(i, seq.length - 1)];
        i++;
        return Promise.resolve(r);
      }) as unknown as typeof fetch;

      const c = new RegistryClient({ maxRetries: 4, initialBackoffMs: 1 });
      const info = await c.getNpmPackage('retry-pkg');
      expect(info.exists).toBe(true);
      expect(global.fetch).toHaveBeenCalledTimes(2);
    } finally {
      warn.mockRestore();
    }
  });
});
