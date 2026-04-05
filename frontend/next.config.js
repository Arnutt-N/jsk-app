/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'profile.line-scdn.net' },
      { protocol: 'https', hostname: 'sprofile.line-scdn.net' },
    ],
  },
  turbopack: {
    root: __dirname,
  },
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
  },
  async rewrites() {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000/api/v1';
    const backendBase = apiUrl.replace(/\/api\/v1\/?$/, '');
    return [
      {
        source: '/api/v1/:path*',
        destination: `${backendBase}/api/v1/:path*`, // Proxy to Backend
      },
       {
        source: '/docs',
        destination: `${backendBase}/docs`, // Proxy Swagger
      },
      {
        source: '/openapi.json',
        destination: `${backendBase}/openapi.json`,
      },
    ]
  },
}

module.exports = nextConfig
