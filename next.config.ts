import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  experimental: {
    // Proje kaydetme `.icmal` baytlarini Server Action ile gonderir. Varsayilan
    // 1 MB sinirinin altinda kalirdi; dosya siniri icmal-file.ts'te 8 MiB
    // (MAX_PROJECT_BYTES) oldugu icin ustune az bir pay birakiliyor. Daha
    // yukari cikarmak sunucuyu gereksiz yere buyuk govdelere acar.
    serverActions: { bodySizeLimit: '9mb' },
  },
};

export default nextConfig;
