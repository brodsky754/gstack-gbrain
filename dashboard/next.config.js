/** @type {import('next').NextConfig} */
const nextConfig = {
  // The dashboard is local-only. No remote images, no telemetry.
  reactStrictMode: true,
  experimental: {
    instrumentationHook: true, // for session-poller boot in instrumentation.ts
  },
  // instrumentation.ts dynamically imports lib/gbrain-client + lib/session-poller +
  // lib/ship-this, all of which pull in Node built-ins (child_process, fs, os).
  // Next.js compiles instrumentation.ts for BOTH the Node and Edge runtimes by
  // default. The runtime-guard inside register() handles the runtime, but
  // webpack still statically analyzes the dynamic imports during compile and
  // fails for Edge (no Node built-ins). Stubbing the modules to `false` for
  // Edge tells webpack to ship an empty module instead of trying to resolve
  // them — the runtime-guard makes sure the empty module is never executed.
  webpack: (config, { nextRuntime }) => {
    if (nextRuntime === 'edge') {
      config.resolve = config.resolve || {};
      config.resolve.fallback = {
        ...config.resolve.fallback,
        child_process: false,
        fs: false,
        'fs/promises': false,
        os: false,
        path: false,
      };
    }
    return config;
  },
};

module.exports = nextConfig;
