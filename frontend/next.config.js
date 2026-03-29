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
    return [
      {
        source: '/api/v1/:path*',
        destination: 'http://127.0.0.1:8000/api/v1/:path*', // Proxy to Backend
      },
       {
        source: '/docs',
        destination: 'http://127.0.0.1:8000/docs', // Proxy Swagger
      },
      {
        source: '/openapi.json',
        destination: 'http://127.0.0.1:8000/openapi.json',
      },
    ]
  },
}

module.exports = nextConfig
