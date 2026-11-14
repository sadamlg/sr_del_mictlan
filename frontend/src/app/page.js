import { Suspense } from 'react';
import { cacheLife, io } from 'next/cache';
import SiteHeader from '../components/header/header';
import AgeGate from '../components/age-gate/age-gate';
import LandingHero from '../components/landing/landing-hero';
import MezcalShowcase from '../components/landing/mezcal-showcase/mezcal-showcase';
import LandingWhatsAppCta from '../components/landing/landing-whatsapp-cta';
import LandingRitual from '../components/landing/landing-ritual';
import LandingFaq from '../components/landing/faq/landing-faq';
import LandingVisitorCounter from '../components/landing/landing-visitor-counter';
import LandingFooter from '../components/landing/landing-footer';

async function getCachedCatalog(apiUrl) {
  'use cache';
  if (!apiUrl) { cacheLife('seconds'); return null; }
  try {
    const response = await fetch(`${apiUrl.replace(/\/$/, '')}/api/catalog/products`, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) { cacheLife('seconds'); return null; }
    const body = await response.json();
    if (!Array.isArray(body.products)) { cacheLife('seconds'); return null; }
    cacheLife('days');
    return body.products;
  } catch (error) {
    console.error('[catalog] failed to load', error instanceof Error ? error.name : 'UnknownError');
    cacheLife('seconds');
    return null;
  }
}

async function CatalogContent({ mediaBaseUrl }) {
  return <MezcalShowcase products={await getCachedCatalog(process.env.INTERNAL_API_URL)} mediaBaseUrl={mediaBaseUrl} />;
}

async function CurrentYear() {
  await io();
  return new Date().getFullYear();
}

export default function Home() {
  const mediaBaseUrl = process.env.MEDIA_BASE_URL || '';
  return (
    <AgeGate mediaBaseUrl={mediaBaseUrl}>
      <div className="bg-mictlan-background text-mictlan-ivory">
        <SiteHeader mediaBaseUrl={mediaBaseUrl} />
        <main>
          <LandingHero mediaBaseUrl={mediaBaseUrl} />
          <Suspense fallback={<section className="bg-mictlan-night px-6 py-24 text-center text-mictlan-bone" role="status">Cargando la colección…</section>}><CatalogContent mediaBaseUrl={mediaBaseUrl} /></Suspense>
          <LandingWhatsAppCta />
          <LandingRitual />
          <LandingFaq mediaBaseUrl={mediaBaseUrl} />
          <LandingVisitorCounter />
        </main>
        <LandingFooter mediaBaseUrl={mediaBaseUrl} year={<Suspense fallback="…"><CurrentYear /></Suspense>} />
      </div>
    </AgeGate>
  );
}
