import { ExternalLink, MessageCircle } from 'lucide-react';

const whatsappUrl = 'https://wa.me/5217299271093';

export default function LandingWhatsAppCta() {
  return (
    <section
      className="flex min-h-[272px] items-center bg-mictlan-night md:min-h-[248px]"
      aria-labelledby="rapid-purchase-title"
    >
      <div className="mx-auto flex w-full max-w-[1440px] flex-col items-start gap-4 px-6 py-5 sm:gap-5 sm:px-10 sm:py-8 md:flex-row md:items-center md:justify-between md:gap-8 lg:px-14">
        <div className="max-w-3xl">
          <h2 id="rapid-purchase-title" className="font-display text-lg font-normal leading-tight text-mictlan-red-hover sm:text-xl lg:text-2xl">
            ¿Necesitas una compra rápida o urgente?
          </h2>
          <p className="mt-2 max-w-[60ch] text-base leading-6 text-mictlan-sage sm:text-lg">
            Escríbenos por WhatsApp; con gusto te atenderemos lo antes posible.
          </p>
        </div>
        <a
          className="inline-flex min-h-12 shrink-0 items-center justify-center gap-2.5 rounded-full border border-mictlan-teal/45 bg-mictlan-teal-deep/35 px-5 py-3 font-ui text-sm font-semibold tracking-[0.06em] text-mictlan-bone no-underline transition-[background-color,border-color,color] duration-200 hover:border-mictlan-teal hover:bg-mictlan-teal/15 hover:text-mictlan-teal focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-mictlan-teal motion-reduce:transition-none sm:text-base"
          href={whatsappUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Contactar por WhatsApp al +52 1 729 927 1093. Se abre en una pestaña nueva."
        >
          <MessageCircle className="size-[18px]" strokeWidth={1.8} aria-hidden="true" />
          Contactar por WhatsApp
          <ExternalLink className="size-3.5" strokeWidth={1.8} aria-hidden="true" />
        </a>
      </div>
    </section>
  );
}
