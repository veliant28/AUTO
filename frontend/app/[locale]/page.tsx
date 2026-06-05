import Link from 'next/link';
import { Search, Car, Package, Truck, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import HeroSearchForm from '@/components/features/HeroSearchForm';

const features = [
  { icon: Car, title: '235 000+ запчастей', desc: 'Огромный каталог оригинальных и аналоговых деталей' },
  { icon: Search, title: 'Мгновенный поиск', desc: 'Находите запчасти по артикулу или каталогу TecDoc' },
  { icon: Truck, title: 'Быстрая доставка', desc: 'Доставка по всей РФ от 1 дня. Самовывоз из 200+ пунктов' },
  { icon: Shield, title: 'Гарантия качества', desc: 'Только проверенные поставщики с гарантией до 2 лет' },
];

export default function HomePage() {
  return (
    <div className="min-h-[calc(100vh-4rem)]">
      <section className="relative bg-gradient-to-br from-primary/5 via-background to-primary/10 py-20 md:py-32">
        <div className="container mx-auto px-4 text-center space-y-8">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-primary/10 rounded-full text-sm font-medium text-primary">
            <Package className="w-4 h-4" />
            Интернет-магазин автозапчастей
          </div>
          <h1 className="text-4xl md:text-6xl font-bold tracking-tight">
            Все запчасти <br />
            <span className="text-primary">в одном месте</span>
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto">
            Оригинальные детали и качественные аналоги от ведущих производителей.
            Мгновенный подбор по марке авто и артикулу.
          </p>

          <HeroSearchForm />

          <div className="flex flex-wrap justify-center gap-4 pt-4">
            <Link href="/catalog">
              <Button size="lg" className="gap-2">
                <Car className="w-5 h-5" />
                Подобрать по авто
              </Button>
            </Link>
          </div>
        </div>
      </section>

      <section className="py-16 md:py-24">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-4">Почему выбирают нас</h2>
            <p className="text-muted-foreground max-w-lg mx-auto">Мы объединили проверенных поставщиков и современные технологии для быстрого поиска</p>
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
            <h2 className="text-3xl font-bold">Работаете с автосервисом?</h2>
            <p className="text-muted-foreground">
              Зарегистрируйтесь, чтобы получить доступ к приоритетной поддержке и быстрому оформлению заказов для вашего бизнеса.
            </p>
            <Link href="/auth/register">
              <Button size="lg" variant="outline" className="mt-4">Зарегистрироваться</Button>
            </Link>
          </div>
        </div>
      </section>

      <section className="py-16">
        <div className="container mx-auto px-4 text-center">
          <p className="text-sm text-muted-foreground">Не нашли запчасть? Свяжитесь с нами — мы поможем!</p>
        </div>
      </section>
    </div>
  );
}
