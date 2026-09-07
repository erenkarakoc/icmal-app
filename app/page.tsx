'use client';

import Link from 'next/link';
import { AccountProjectsSection } from '@features/projects/components/account-projects-section';
import { LocalProjectsSection } from '@features/projects/components/local-projects-section';
import {
  FileText,
  Calculator,
  Target,
  Search,
  TrendingUp,
  Percent,
  ArrowRight,
} from 'lucide-react';

const features = [
  {
    title: 'EKAP Editör',
    description: 'EKAP dosyalarını görüntüle ve düzenle',
    href: '/editor',
    icon: FileText,
  },
  {
    title: 'Yaklaşık Maliyet',
    description: 'Yaklaşık maliyet hesaplama',
    href: '/yaklasik-maliyet',
    icon: Calculator,
  },
  {
    title: 'Sınır Değer',
    description: 'Aşırı düşük teklif sınır değer hesaplama',
    href: '/sinir-deger',
    icon: Target,
  },
  {
    title: 'Birim Fiyat',
    description: 'Birim fiyat analizi görüntüle',
    href: '/birim-fiyat',
    icon: Search,
  },
  {
    title: 'Fiyat Farkı',
    description: 'Fiyat farkı hesaplama',
    href: '/fiyat-farki',
    icon: TrendingUp,
  },
  {
    title: 'Maliyet Sihirbazı',
    description: 'Pursantajdan yaklaşık maliyet hesaplama',
    href: '/maliyet-sihirbazi',
    icon: Percent,
  },
];

export default function HomePage() {
  return (
    <div className="flex flex-1 flex-col overflow-auto">
      <div className="flex flex-1 flex-col items-center justify-center p-6">
        <div className="w-full max-w-2xl">
          <h1 className="display-heading mb-1 text-xl">Hoş Geldiniz</h1>
          <p className="text-muted-foreground mb-6 text-sm">
            Bir araç seçin veya klavye kısayollarını kullanın.
          </p>

          <div className="grid gap-2 sm:grid-cols-2">
            {features.map((feature) => (
              <Link
                key={feature.href}
                href={feature.href}
                className="hover:bg-muted/50 group flex items-center gap-3 rounded-md border p-3 transition-colors"
              >
                <div className="bg-muted text-foreground flex size-8 shrink-0 items-center justify-center rounded-md">
                  <feature.icon className="size-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <span className="text-sm font-medium">{feature.title}</span>
                  <p className="text-muted-foreground truncate text-xs">{feature.description}</p>
                </div>
                <ArrowRight className="text-muted-foreground size-3.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
              </Link>
            ))}
          </div>

          <AccountProjectsSection />
          <LocalProjectsSection />
        </div>
      </div>
    </div>
  );
}
