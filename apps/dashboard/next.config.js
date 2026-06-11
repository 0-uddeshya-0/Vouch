const securityHeaders = [
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    instrumentationHook: true,
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
  async rewrites() {
    const apiProxy = process.env.API_PROXY_URL;
    if (process.env.NODE_ENV === 'development' && apiProxy) {
      return [
        {
          source: '/api/:path*',
          destination: `${apiProxy.replace(/\/$/, '')}/api/:path*`,
        },
      ];
    }
    return [];
  },
};

module.exports = nextConfig;
