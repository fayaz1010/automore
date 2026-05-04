/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  outputFileTracingIncludes: {
    '/reviews/[slug]': ['./content/reviews/**/*'],
  },
};

export default nextConfig;
