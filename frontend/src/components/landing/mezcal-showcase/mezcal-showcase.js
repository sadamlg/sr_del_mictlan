import Image from 'next/image';
import Link from 'next/link';
import ProductInsights from './product-insights';
import { mediaObjectUrl } from '../../../lib/media-url';
import AddToCartButton from '../../cart/add-to-cart-button.js';

const priceFormatter = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const SHOWCASE_GRID_CLASSES = 'mt-14 grid gap-x-8 gap-y-16 sm:grid-cols-2 lg:mt-6 lg:grid-cols-3 lg:gap-x-10 [@media(min-width:80rem)_and_(min-height:54rem)]:flex-1 [@media(min-width:80rem)_and_(min-height:54rem)]:items-end';

function MezcalCard({ product, className = '' }) {
  const [name, descriptor] = product.name.split(' · ', 2);

  return (
    <article className={`relative mx-auto flex w-full max-w-[340px] flex-col items-center text-center text-mictlan-bone lg:max-w-[360px] ${className}`}>
      <div className="group/visual relative aspect-[4/5] w-full overflow-hidden outline-none focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-mictlan-teal lg:w-[min(100%,clamp(15rem,calc(90dvh_-_23rem),20.4rem))]" tabIndex={0} aria-label={`${product.name}. Enfoca para ver una segunda fotografía`}>
        <Image
          src={product.image.url}
          alt={product.image.alt}
          width={1122}
          height={1402}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          sizes="(min-width: 1024px) 360px, (min-width: 640px) 45vw, min(100vw, 340px)"
          className="absolute inset-0 h-full w-full object-contain"
        />
        <Image
          src={product.lifestyleImage.url}
          alt=""
          aria-hidden="true"
          width={1122}
          height={1402}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          sizes="(min-width: 1024px) 360px, (min-width: 640px) 45vw, min(100vw, 340px)"
          className="absolute inset-0 h-full w-full object-cover opacity-0 transition-opacity duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none group-hover/visual:opacity-100 group-focus/visual:opacity-100"
        />
      </div>

      <div className="relative isolate mt-5 flex w-full flex-col items-center before:pointer-events-none before:absolute before:inset-x-10 before:top-0 before:-bottom-4 before:-z-10 before:bg-[linear-gradient(180deg,transparent_0%,color-mix(in_srgb,var(--mictlan-night)_76%,transparent)_20%,var(--mictlan-night)_48%,var(--mictlan-night)_100%)] lg:mt-2">
        <h3 className="flex min-h-11 flex-col items-center justify-center text-mictlan-bone" aria-label={product.name}>
          <span className="font-display text-xl leading-6">{name}</span>
          {descriptor && <span className="font-ui text-sm font-semibold uppercase leading-5 tracking-[0.08em] text-mictlan-bone/95">{descriptor}</span>}
        </h3>
        <p className="mt-1 font-serif text-lg font-medium italic leading-7 text-mictlan-cream">{product.labels[1]}</p>
        <ProductInsights product={product} />
        <p className="mt-4 font-ui text-lg font-medium tabular-nums text-mictlan-gold lg:mt-2">MXN {priceFormatter.format(product.price.amount / 100)}</p>
        <AddToCartButton product={product} />
      </div>
    </article>
  );
}

export function MezcalShowcaseSection({ children, mediaBaseUrl }) {
  return (
    <section id="coleccion" className="relative isolate scroll-mt-24 overflow-hidden bg-mictlan-night px-6 pb-20 pt-24 text-mictlan-bone sm:px-10 lg:min-h-dvh lg:px-14 lg:py-5 [@media(min-width:80rem)_and_(min-height:54rem)]:h-dvh [@media(min-width:80rem)_and_(min-height:54rem)]:py-12" aria-labelledby="mezcal-showcase-title">
      <picture className="absolute inset-0 -z-20">
        <source media="(max-width: 640px)" type="image/webp" srcSet={mediaObjectUrl(mediaBaseUrl, 'images/mezcal-showcase-background-mobile.webp')} />
        <source media="(max-width: 640px)" srcSet={mediaObjectUrl(mediaBaseUrl, 'images/mezcal-showcase-background-mobile.png')} />
        <img src={mediaObjectUrl(mediaBaseUrl, 'images/mezcal-showcase-background.png')} alt="" width="1672" height="941" decoding="async" fetchPriority="high" className="absolute inset-0 h-full w-full object-cover" />
      </picture>
      <div className="absolute inset-0 -z-10 bg-mictlan-ink/80 max-sm:bg-mictlan-ink/55" aria-hidden="true" />
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-[5] h-32 bg-[linear-gradient(to_bottom,var(--mictlan-night),transparent)] sm:h-48 lg:h-56" aria-hidden="true" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 -z-[5] h-36 bg-[linear-gradient(to_bottom,transparent,var(--mictlan-night))]" aria-hidden="true" />
      <div className="mx-auto max-w-[1440px] lg:flex lg:flex-col [@media(min-width:80rem)_and_(min-height:54rem)]:h-full">
        <header className="text-center">
          <h2 id="mezcal-showcase-title" className="font-display text-[clamp(2rem,5vw,2.3rem)] font-medium uppercase leading-[1.12] text-mictlan-teal-bright lg:text-[clamp(2.3rem,2.8vw,2.75rem)]">Totonalhuan</h2>
          <p className="mx-auto mt-2 max-w-none font-serif text-base font-extralight uppercase leading-normal tracking-[0.1em] text-mictlan-bone sm:whitespace-nowrap">Destilados que cruzan el umbral del tiempo</p>
        </header>
        {children}
      </div>
    </section>
  );
}

export function MezcalShowcaseSkeleton() {
  return (
    <div className={SHOWCASE_GRID_CLASSES} role="status" aria-busy="true" aria-label="Cargando la colección">
      <span className="sr-only">Cargando la colección…</span>
      {Array.from({ length: 3 }, (_, index) => (
        <article key={index} aria-hidden="true" className="relative mx-auto flex w-full max-w-[340px] flex-col items-center">
          <div className="aspect-[4/5] w-full bg-mictlan-ink/35" />
          <div className="relative isolate mt-5 flex w-full flex-col items-center before:pointer-events-none before:absolute before:inset-x-10 before:top-0 before:-bottom-4 before:-z-10 before:bg-[linear-gradient(180deg,transparent_0%,color-mix(in_srgb,var(--mictlan-night)_76%,transparent)_20%,var(--mictlan-night)_48%,var(--mictlan-night)_100%)] lg:mt-2">
            <div className="h-11 w-44" />
            <div className="mt-1 h-7 w-32" />
            <div className="relative z-20 mt-4 flex min-h-11 items-center justify-center gap-1.5 sm:gap-2">
              <span className="size-11 rounded-full border border-mictlan-bone/15" />
              <span className="size-11 rounded-full border border-mictlan-bone/15" />
              <span className="size-11 rounded-full border border-mictlan-bone/15" />
            </div>
            <div className="mt-4 h-7 w-24" />
            <div className="mt-4 h-11 w-full" />
          </div>
        </article>
      ))}
    </div>
  );
}

export default function MezcalShowcase({ products }) {
  if (products === null) {
    return (
      <div className="mx-auto mt-16 max-w-lg text-center" role="status">
        <p className="font-display text-xl">No pudimos cargar la colección.</p>
        <Link href="/" className="mt-5 inline-flex min-h-11 items-center text-sm text-mictlan-teal underline underline-offset-4 hover:text-mictlan-teal-bright">Reintentar</Link>
      </div>
    );
  }

  if (products.length === 0) {
    return <p className="mx-auto mt-16 max-w-lg text-center leading-7 text-mictlan-bone/80">La colección está tomando forma. Pronto podrás descubrir nuestros destilados.</p>;
  }

  return (
    <div className={SHOWCASE_GRID_CLASSES}>
      {products.map((product, index) => {
        const isUnpairedTabletCard = products.length % 2 === 1 && index === products.length - 1;
        return <MezcalCard key={product.slug} product={product} className={isUnpairedTabletCard ? 'sm:col-span-2 lg:col-span-1' : undefined} />;
      })}
    </div>
  );
}
