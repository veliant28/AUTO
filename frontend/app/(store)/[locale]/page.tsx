import Link from 'next/link';
import { Search, Car, Package, Truck, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import HeroSearchForm from '@/components/features/HeroSearchForm';
import VehicleSelectorDialog from '@/components/vehicles/VehicleSelectorDialog';
import { getTranslations } from 'next-intl/server';

export default async function HomePage() {
  const t = await getTranslations('home');

  const features = [
    { icon: Car, title: t('feature_parts'), desc: t('feature_parts_desc') },
    { icon: Search, title: t('feature_search'), desc: t('feature_search_desc') },
    { icon: Truck, title: t('feature_delivery'), desc: t('feature_delivery_desc') },
    { icon: Shield, title: t('feature_quality'), desc: t('feature_quality_desc') },
  ];

  return (
    <div className="min-h-[calc(100vh-4rem)]">
      <section className="relative bg-gradient-to-br from-primary/5 via-background to-primary/10 py-20 md:py-32">
        <div className="container mx-auto px-4 text-center space-y-8">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-primary/10 rounded-full text-sm font-medium text-primary">
            <Package className="w-4 h-4" />
            {t('badge')}
          </div>
          <h1 className="text-4xl md:text-6xl font-bold tracking-tight">
            {t('title_line1')} <br />
            <span className="text-primary">{t('title_line2')}</span>
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto">
            {t('subtitle')}
          </p>

          <HeroSearchForm />

          <div className="flex flex-wrap justify-center gap-4 pt-4">
            <VehicleSelectorDialog>
              <Button size="lg" className="gap-2">
                <Car className="w-5 h-5" />
                {t('cta')}
              </Button>
            </VehicleSelectorDialog>
          </div>
        </div>
      </section>

      <section className="py-16 md:py-24">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-4">{t('why_title')}</h2>
            <p className="text-muted-foreground max-w-lg mx-auto">{t('why_desc')}</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {features.map((f) => (
              <div key={f.title} className="text-center p-6 rounded-xl border bg-card hover:border-primary/50 transition-all hover:shadow-md">
                <div className="bg-primary/10 w-14 h-14 mx-auto rounded-xl flex items-center justify-center mb-4">
                  <f.icon className="w-7 h-7 text-primary" />
                </div>
                <h3 className="font-semibold mb-2">{f.title}</h3>
                <p className="text-sm text-muted-foreground">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 bg-muted/30">
        <div className="container mx-auto px-4 text-center">
          <div className="max-w-lg mx-auto space-y-4">
            <h2 className="text-3xl font-bold">{t('b2b_title')}</h2>
            <p className="text-muted-foreground">{t('b2b_desc')}</p>
            <Link href="/auth/register">
              <Button size="lg" variant="outline" className="mt-4">{t('b2b_cta')}</Button>
            </Link>
          </div>
        </div>
      </section>

      <section className="py-16">
        <div className="container mx-auto px-4 text-center">
          <p className="text-sm text-muted-foreground">{t('not_found_cta')}</p>
        </div>
      </section>
    </div>
  );
}
