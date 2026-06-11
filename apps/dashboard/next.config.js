/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    instrumentationHook: true,
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
