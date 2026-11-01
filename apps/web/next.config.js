/*
 * Environment, loaded before anything reads it.
 *
 * Next only reads .env files from its own project root, which is this
 * directory. The repository keeps them one level up, at the workspace root,
 * because the data service and the scripts in scripts/ read the same two
 * files — DATABASE_URL, CREDENTIAL_ENCRYPTION_KEY and the provider keys are
 * shared, and three copies of a secret is three things to rotate.
 *
 * This has to happen here rather than anywhere inside the app, because
 * NEXT_PUBLIC_STORAGE_MODE is inlined into the client bundle at build time:
 * Navbar, SetupCheck and middleware all read it. A variable that arrives after
 * the build has started is a variable that reads as undefined in the browser,
 * which looks like a storage-mode bug rather than a missing file.
 *
 * next.config.js runs in Node before the build or the dev server starts, so
 * this is early enough. Loaded in Next's own precedence order: .env.local
 * wins over .env, and dotenv does not overwrite what is already set, so a real
 * environment variable still beats both.
 */
const path = require('path');

const repoRoot = path.resolve(__dirname, '..', '..');
for (const file of ['.env.local', '.env']) {
  require('dotenv').config({ path: path.join(repoRoot, file) });
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Workspace packages ship TypeScript source rather than a build, so Next
  // compiles them with the app. That keeps HMR working across a package
  // boundary and saves a build step there is nothing to cache.
  transpilePackages: ['@stockviewer/shared', '@stockviewer/db'],
  webpack: (config, { isServer }) => {
    // Fix for lightweight-charts and other libraries
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
      };
    }
    
    // Fix for __webpack_require__.n is not a function error
    config.module = {
      ...config.module,
      rules: [
        ...config.module.rules,
        {
          test: /\.m?js$/,
          resolve: {
            fullySpecified: false,
          },
        },
      ],
    };
    
    return config;
  },
}

module.exports = nextConfig

