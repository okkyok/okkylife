import withPlaiceholder from '@plaiceholder/next';

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    appDir: true,
  },

  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'www.notion.so',
      },
      {
        protocol: 'https',
        hostname: 's3-us-west-2.amazonaws.com',
      },
    ],
    // Optimize image handling
    minimumCacheTTL: 60 * 60 * 24 * 7, // 7 days cache for images
  },

  // Static generation optimization
  staticPageGenerationTimeout: 180, // Increase timeout to 3 minutes (default is 60 seconds)
  
  // Optimize memory usage during builds
  onDemandEntries: {
    maxInactiveAge: 60 * 60 * 1000, // 1 hour
    pagesBufferLength: 5,
  },

  // suppress keyv warning
  webpack: (config, { webpack }) => {
    // Add memory optimization for image processing
    config.optimization = {
      ...config.optimization,
      nodeEnv: 'production',
    };
    
    // Suppress keyv warning
    config.plugins.push(
      new webpack.ContextReplacementPlugin(/\/keyv\//, (data) => {
        delete data.dependencies[0].critical;
        return data;
      })
    );

    return config;
  },
};

export default withPlaiceholder(nextConfig)
