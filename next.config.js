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

