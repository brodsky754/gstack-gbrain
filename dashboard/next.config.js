/** @type {import('next').NextConfig} */
const nextConfig = {
  // The dashboard is local-only. No remote images, no telemetry.
  reactStrictMode: true,
  experimental: {
    instrumentationHook: true, // for session-poller boot in instrumentation.ts
  },
  // gbrain CLI is shelled out from server actions; explicitly mark it server-only
  // so Next doesn't try to bundle it.
  serverExternalPackages: ['node:child_process', 'node:fs'],
};

module.exports = nextConfig;
