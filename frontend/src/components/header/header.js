'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import HeaderActions from './header-actions';
import MobileMenu, { MobileMenuToggle } from './mobile-menu';
import {
  getActiveNavigationItemId,
  getNavigationItemIdForHash,
  getSectionAtReferenceLine,
  navigationItems,
} from './navigation';
import { mediaObjectUrl } from '../../lib/media-url';
import {
  lockBodyScroll,
  shouldDisplayHeader,
  shouldHideHeaderOnScroll,
} from './behavior';
import { useDesktopViewport } from '../../hooks/use-desktop-viewport';

export default function SiteHeader({ mediaBaseUrl }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = useCallback(() => setMenuOpen(false), []);
  const isDesktop = useDesktopViewport(closeMenu);
  const [visibility, setVisibility] = useState({ pathname, visible: true });
  const [activeSectionId, setActiveSectionId] = useState(null);
  const [selectedNavigationItemId, setSelectedNavigationItemId] = useState(null);
  const [brandImageReady, setBrandImageReady] = useState(false);
  const headerRef = useRef(null);
  const brandImageRef = useRef(null);
  const selectedNavigationItemRef = useRef(null);
  const lastScrollY = useRef(0);
  const navigationScroll = useRef(true);
  const headerVisible = visibility.pathname !== pathname || visibility.visible;
  const headerShouldDisplay = shouldDisplayHeader(headerVisible, menuOpen);
  const activeNavigationItemId = pathname === '/'
    ? getActiveNavigationItemId(activeSectionId, selectedNavigationItemId)
    : null;
  const toggleMenu = () => {
    setVisibility({ pathname, visible: true });
    setMenuOpen((open) => !open);
  };
  const selectNavigationItem = useCallback((itemId, event) => {
    if (
      event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey ||
      event.shiftKey || event.altKey
    ) return;
    const selectedItemId = navigationItems.some(({ id, activeOnClick }) => id === itemId && activeOnClick)
      ? itemId
      : null;
    selectedNavigationItemRef.current = selectedItemId;
    setSelectedNavigationItemId(selectedItemId);
  }, []);

  useEffect(() => {
    if (brandImageRef.current?.complete) setBrandImageReady(true);
  }, []);

  useEffect(() => {
    if (pathname !== '/') return undefined;

    let frame = 0;
    const sectionIds = [...new Set(navigationItems.map(({ sectionId }) => sectionId).filter(Boolean))];
    const main = document.querySelector('main');
    const observedElements = new Set();
    let resizeObserver = null;

    const observeElement = (element) => {
      if (!element || observedElements.has(element)) return;
      resizeObserver?.observe(element);
      observedElements.add(element);
    };

    const observeSections = () => sectionIds.forEach((id) => observeElement(document.getElementById(id)));

    const updateActiveSection = () => {
      frame = 0;
      observeSections();
      const scrollY = window.scrollY;
      const referenceLine = scrollY + (headerRef.current?.offsetHeight ?? 0) + 1;
      const bounds = sectionIds
        .map((id) => document.getElementById(id))
        .filter(Boolean)
        .map((section) => {
          const rect = section.getBoundingClientRect();
          return { id: section.id, top: rect.top + scrollY, bottom: rect.bottom + scrollY };
        });
      const nextSectionId = getSectionAtReferenceLine(bounds, referenceLine);
      setActiveSectionId((current) => current === nextSectionId ? current : nextSectionId);
    };

    const scheduleUpdate = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(updateActiveSection);
    };

    resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(scheduleUpdate);
    observeElement(headerRef.current);
    observeElement(main);
    observeSections();

    const mutationObserver = main && typeof MutationObserver !== 'undefined'
      ? new MutationObserver(() => {
        observeSections();
        scheduleUpdate();
      })
      : null;
    mutationObserver?.observe(main, { childList: true, subtree: true });

    scheduleUpdate();
    window.addEventListener('scroll', scheduleUpdate, { passive: true });
    window.addEventListener('resize', scheduleUpdate);
    window.addEventListener('hashchange', scheduleUpdate);
    window.addEventListener('popstate', scheduleUpdate);

    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      resizeObserver?.disconnect();
      mutationObserver?.disconnect();
      window.removeEventListener('scroll', scheduleUpdate);
      window.removeEventListener('resize', scheduleUpdate);
      window.removeEventListener('hashchange', scheduleUpdate);
      window.removeEventListener('popstate', scheduleUpdate);
    };
  }, [pathname]);

  useEffect(() => {
    navigationScroll.current = true;
    lastScrollY.current = window.scrollY;
    let initialLocationFrame = window.requestAnimationFrame(() => {
      initialLocationFrame = 0;
      const itemId = window.location.pathname === '/' ? getNavigationItemIdForHash(window.location.hash) : null;
      selectedNavigationItemRef.current = itemId;
      setSelectedNavigationItemId(itemId);
    });

    const syncSelectionForLocation = () => {
      const selectedItem = navigationItems.find(({ id }) => id === selectedNavigationItemRef.current);
      const selectedHash = selectedItem && new URL(selectedItem.href, window.location.href).hash;
      const itemId = selectedItem?.activeOnClick && selectedHash === window.location.hash
        ? selectedItem.id
        : window.location.pathname === '/' ? getNavigationItemIdForHash(window.location.hash) : null;
      selectedNavigationItemRef.current = itemId;
      setSelectedNavigationItemId((current) => current === itemId ? current : itemId);
    };

    const showForNavigation = () => {
      navigationScroll.current = true;
      lastScrollY.current = window.scrollY;
      setVisibility((current) => current.pathname === pathname && current.visible
        ? current
        : { pathname, visible: true });
    };

    const handleNavigationClick = (event) => {
      if (
        event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey ||
        !(event.target instanceof Element)
      ) return;

      const link = event.target.closest('a[href]');
      if (!link) return;
      let destination;
      try {
        destination = new URL(link.href);
      } catch {
        return;
      }
      if (destination.origin !== window.location.origin) return;
      const isNavigationItem = navigationItems.some(({ id }) => id === link.dataset.navigationItem);
      if (!isNavigationItem) {
        selectedNavigationItemRef.current = null;
        setSelectedNavigationItemId(null);
      }
      if (
        destination.pathname === window.location.pathname &&
        destination.search === window.location.search &&
        !destination.hash
      ) return;
      showForNavigation();
    };

    const handleHashChange = () => {
      syncSelectionForLocation();
      showForNavigation();
    };

    const handleHistoryNavigation = () => {
      syncSelectionForLocation();
      showForNavigation();
    };

    const resumeScrollTracking = () => {
      navigationScroll.current = false;
      selectedNavigationItemRef.current = null;
      setSelectedNavigationItemId(null);
    };

    const handleScrollbarPointerDown = (event) => {
      const root = document.documentElement;
      const nearVerticalScrollbar = root.scrollHeight > root.clientHeight && event.clientX >= window.innerWidth - 16;
      const nearHorizontalScrollbar = root.scrollWidth > root.clientWidth && event.clientY >= window.innerHeight - 16;
      if (nearVerticalScrollbar || nearHorizontalScrollbar) resumeScrollTracking();
    };

    const handleScrollKey = (event) => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      if (!['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End', ' '].includes(event.key)) return;
      if (event.target instanceof HTMLElement && (
        event.target.isContentEditable || event.target.closest('input, textarea, select, [contenteditable="true"]')
      )) return;
      resumeScrollTracking();
    };

    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      if (!navigationScroll.current) {
        selectedNavigationItemRef.current = null;
        setSelectedNavigationItemId(null);
        const visible = !shouldHideHeaderOnScroll(currentScrollY, lastScrollY.current);
        setVisibility((current) => current.pathname === pathname && current.visible === visible
          ? current
          : { pathname, visible });
      }
      lastScrollY.current = currentScrollY;
    };

    document.addEventListener('click', handleNavigationClick, true);
    document.addEventListener('pointerdown', handleScrollbarPointerDown, true);
    window.addEventListener('popstate', handleHistoryNavigation);
    window.addEventListener('hashchange', handleHashChange);
    window.addEventListener('wheel', resumeScrollTracking, { passive: true });
    window.addEventListener('touchmove', resumeScrollTracking, { passive: true });
    window.addEventListener('keydown', handleScrollKey);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      if (initialLocationFrame) window.cancelAnimationFrame(initialLocationFrame);
      document.removeEventListener('click', handleNavigationClick, true);
      document.removeEventListener('pointerdown', handleScrollbarPointerDown, true);
      window.removeEventListener('popstate', handleHistoryNavigation);
      window.removeEventListener('hashchange', handleHashChange);
      window.removeEventListener('wheel', resumeScrollTracking);
      window.removeEventListener('touchmove', resumeScrollTracking);
      window.removeEventListener('keydown', handleScrollKey);
      window.removeEventListener('scroll', handleScroll);
    };
  }, [pathname]);

  useEffect(() => {
    if (isDesktop || !menuOpen) return undefined;
    return lockBodyScroll(document.body);
  }, [menuOpen, isDesktop]);

  useEffect(() => {
    if (isDesktop || !menuOpen) return undefined;

    const closeOnEscape = (event) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      closeMenu();
      document.getElementById('mobile-menu-toggle')?.focus();
    };

    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [menuOpen, closeMenu, isDesktop]);

  return (
    <>
      <MobileMenu
        isOpen={menuOpen}
        onClose={closeMenu}
        onNavigationSelect={selectNavigationItem}
        activeNavigationItemId={activeNavigationItemId}
      />
      <header
        ref={headerRef}
        className={`fixed inset-x-0 top-0 z-50 w-full bg-mictlan-carbon py-6 font-display text-mictlan-bone transition-[translate] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] lg:pt-4 lg:pb-6${headerShouldDisplay ? ' translate-y-0 delay-0' : ' -translate-y-full delay-100'}`}
      >
        <div className="mx-auto flex w-full max-w-[1280px] items-center justify-between px-4 min-[768px]:px-10 min-[768px]:max-[1023px]:px-[30px]">
          <div className="flex-1 lg:hidden">
            <MobileMenuToggle
              isOpen={menuOpen}
              onToggle={toggleMenu}
            />
          </div>
          <Link
            href="/"
            className={`order-2 flex items-center lg:order-1 ${brandImageReady ? 'motion-safe:animate-[blurredFadeIn_0.9s_ease-in-out_both]' : 'motion-safe:opacity-0'}`}
            onClick={closeMenu}
            aria-label="Señor del Mictlán, inicio"
          >
            <Image
              ref={brandImageRef}
              src={mediaObjectUrl(mediaBaseUrl, 'images/brand/senor-del-mictlan-brand.png')}
              alt="Señor del Mictlán"
              className="block h-20 w-auto max-w-full lg:h-auto lg:w-[140px]"
              width={1774}
              height={887}
              sizes="(min-width: 1024px) 140px, 160px"
              priority
              onLoad={() => setBrandImageReady(true)}
              onError={() => setBrandImageReady(true)}
            />
          </Link>
          <nav className="hidden text-lg leading-7 text-mictlan-sand lg:order-2 lg:flex" aria-label="Navegación principal">
            <ul className="m-0 flex list-none items-center gap-[80px] p-0 uppercase tracking-[0.025em] min-[1280px]:gap-[96px]">
              {navigationItems.map(({ href, id, label }) => {
                const isCurrent = activeNavigationItemId === id;
                return (
                  <li
                    className={`border-b-2 transition-[color,border-color] duration-150 ease-out ${isCurrent ? 'border-b-mictlan-teal text-mictlan-mint' : 'border-b-transparent'}`}
                    key={id}
                  >
                    <Link
                      className="text-inherit no-underline transition-colors duration-150 ease-out hover:text-mictlan-teal focus-visible:text-mictlan-mint focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-mictlan-teal"
                      href={href}
                      data-navigation-item={id}
                      onClick={(event) => selectNavigationItem(id, event)}
                      aria-current={isCurrent ? 'location' : undefined}
                    >
                      {label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
          <HeaderActions />
        </div>
      </header>
    </>
  );
}
