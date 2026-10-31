/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Vercel sets outputFileTracingRoot to the REPO root (/vercel/path0) because
  // this project's rootDirectory is `frontend`, while turbopack.root below is
  // __dirname. Next warns they must match, then uses the tracing root — which
  // leaves Turbopack resolving its own internals relative to the wrong base.
  // When the font modules come from build cache that goes unnoticed, but once
  // they are rebuilt the alias fails:
  //   Module not found: Can't resolve '@vercel/turbopack-next/internal/font/google/font'
  //   Error: Turbopack build failed with 9 errors
  // Pinning both to the same directory keeps the bases consistent.
  outputFileTracingRoot: __dirname,
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
  // Security headers. Deliberately NO X-Frame-Options / frame-ancestors:
  // LIFF pages MUST stay frameable inside the LINE client. The CSP is
  // report-only (observes, never blocks); unsafe-inline/eval match the
  // Next.js runtime's needs.
  async headers() {
    return [{
      source: '/:path*',
      headers: [
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        { key: 'Strict-Transport-Security', value: 'max-age=31536000' },
        { key: 'Content-Security-Policy-Report-Only', value: "default-src 'self'; img-src 'self' https: data:; script-src 'self' 'unsafe-inline' 'unsafe-eval' https:; style-src 'self' 'unsafe-inline' https:; connect-src 'self' https:;" },
      ],
    }];
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
