import Image from 'next/image';
import { ExternalLink } from 'lucide-react';
import questions from './landing-faq-content';
import { mediaObjectUrl } from '../../../lib/media-url';

export default function LandingFaq({ mediaBaseUrl }) {
  return (
    <section
      id="preguntas"
      className="relative isolate scroll-mt-[200px] bg-[linear-gradient(180deg,#111a14_0%,var(--mictlan-dark-forest)_40%,var(--mictlan-night-green)_100%)] px-6 pb-16 pt-28 text-mictlan-bone sm:px-10 sm:pb-20 sm:pt-36 lg:scroll-mt-[220px] lg:px-14 lg:pt-40"
      aria-labelledby="faq-title"
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 mx-auto max-w-[1512px] px-6 sm:px-10 lg:px-14">
        <Image
          className="h-auto w-[min(31.25rem,calc(100vw-48px))] -translate-y-1/2"
          src={mediaObjectUrl(mediaBaseUrl, 'images/landing/cupreata-label.png')}
          width={2172}
          height={724}
          sizes="(max-width: 548px) calc(100vw - 48px), 500px"
          alt="Mezcal 100% agave cupreata, hecho en México, Etúcuaro, Michoacán"
        />
      </div>
      <div className="mx-auto grid grid-cols-1 max-w-[1400px] gap-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-start lg:gap-16">
        <div className="min-w-0">
          <p className="font-ui text-[10px] font-semibold uppercase tracking-[0.25em] text-mictlan-teal/80 lg:text-xs lg:tracking-[0.2em]">
            Conocimiento y origen
          </p>
          <h2 id="faq-title" className="mt-6 max-w-[18ch] font-display text-[clamp(2rem,3.4vw,2.5rem)] font-normal uppercase leading-[1.3] tracking-[0.06em] lg:text-[clamp(2.5rem,3.2vw,2.875rem)]">
            Antes del primer encuentro.
          </h2>
          <p className="mt-6 max-w-[42ch] text-base font-light leading-[1.75] text-mictlan-muted sm:text-[1.0625rem] lg:text-lg xl:text-[1.1875rem]">
            Conoce el origen, el agave y los detalles disponibles de nuestra colección antes de elegir tu botella.
          </p>
        </div>

        <div className="min-w-0 border-b border-mictlan-teal/20">
          {questions.map(({ id, question, answer, location }) => (
            <details
              className="faq-disclosure group/faq scroll-mt-[128px] border-t border-mictlan-teal/20 py-6 transition-colors duration-200 hover:border-mictlan-teal/45 open:border-t-mictlan-teal/60 lg:scroll-mt-[120px]"
              id={id}
              key={question}
            >
              <summary className="flex min-h-8 cursor-pointer list-none items-center justify-between gap-6 font-display text-base font-normal leading-[1.5] text-mictlan-bone transition-colors duration-200 marker:hidden hover:text-mictlan-teal focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-mictlan-teal group-open/faq:text-mictlan-teal sm:text-xl xl:text-[1.375rem] [&::-webkit-details-marker]:hidden">
                {question}
                <span className="relative block h-6 w-6 shrink-0 text-mictlan-teal/75 transition-colors duration-200 group-hover/faq:text-mictlan-teal group-focus-visible/faq:text-mictlan-teal group-open/faq:text-mictlan-teal" aria-hidden="true">
                  <span className="absolute top-1/2 left-1/2 h-px w-4 -translate-x-1/2 -translate-y-1/2 bg-current" />
                  <span className="absolute top-1/2 left-1/2 h-4 w-px -translate-x-1/2 -translate-y-1/2 bg-current transition-transform duration-300 ease-out group-open/faq:scale-y-0" />
                </span>
              </summary>
              <p className="m-0 max-w-[65ch] pb-1 pt-5 pr-9 text-[0.9375rem] font-light leading-[1.7] text-mictlan-sage sm:text-base lg:text-lg xl:text-[1.1875rem]">
                {typeof answer === 'string' ? answer : (
                  <>
                    {answer.prefix}
                    <a
                      className="inline-flex items-baseline gap-1 whitespace-nowrap font-medium text-mictlan-teal transition-colors hover:text-mictlan-bone focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-mictlan-teal"
                      href={location.facebookUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`${answer.linkLabel} en Facebook, abre en una pestaña nueva`}
                    >
                      <span className="underline decoration-mictlan-teal underline-offset-4">{answer.linkLabel}</span>
                      <ExternalLink className="size-3.5 shrink-0" aria-hidden="true" />
                      <span>,</span>
                    </a>
                    {answer.suffix}
                  </>
                )}
              </p>
              {location && (
                <div className="mt-5 max-w-[65ch]">
                  <div className="mt-4 h-52 overflow-hidden rounded-xl border border-mictlan-teal/25 bg-mictlan-carbon sm:aspect-[16/10] sm:h-auto">
                    <iframe
                      className="h-full w-full [filter:invert(0.9)_hue-rotate(180deg)_brightness(0.85)_saturate(0.85)]"
                      src={location.mapEmbedUrl}
                      title="Mapa de Pulquería Templo Mayor en Calle El Quelite #100"
                      loading="lazy"
                      referrerPolicy="strict-origin-when-cross-origin"
                      allowFullScreen
                    />
                  </div>
                </div>
              )}
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
