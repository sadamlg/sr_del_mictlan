import FacebookMark from './facebook-mark';

const FACEBOOK_URL = 'https://www.facebook.com/people/Se%C3%B1or-del-Mictl%C3%A1n/61568382681761/';

export default function FacebookLink({ className = '' }) {
  return (
    <a
      href={FACEBOOK_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Facebook, abre en una pestaña nueva"
      title="Facebook"
      className={className}
    >
      <FacebookMark />
    </a>
  );
}
