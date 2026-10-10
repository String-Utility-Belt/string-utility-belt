import React, { Suspense, lazy, useEffect, useState } from 'react'
import { Keyboard, Search } from 'lucide-react'
import { getRoute, isInAppPath, isPlainLeftClick, navigateToPath, onRouteChange, type Route, type SitePageSlug } from '@/lib/router'
import { ToolProvider } from './ToolContext'
import ToolPage from './tool/ToolPage'
import SharedPipeline from './share/SharedPipeline'
import ThemeToggle from './theme/ThemeToggle'
import CommandPalette from './commands/CommandPalette'
import ShortcutsHelp from './commands/ShortcutsHelp'
import { EVENT_OPEN_PALETTE, EVENT_OPEN_SHORTCUTS } from './commands/commands'
import UpdateBanner from './pwa/UpdateBanner'
import InstallButton from './pwa/InstallButton'
import IntegrationsNav from './integrations/IntegrationsNav'
import { useShareTarget } from './pwa/useShareTarget'
import { useT } from './i18n/useT'
import { useDocumentMeta } from './pages/useDocumentMeta'
import { useNoindex } from './pages/useNoindex'
import { pageTitle } from './pages/seo'
import { PresetPage, PresetsIndexPage } from './pages/presets/routes'
import PagePromo from './sponsors/PagePromo'
import type { PromoPage } from './sponsors/promos'
import { GITHUB_SPONSORS_URL } from '@/app/support'

// Only the tool ships in the entry chunk; every other route is fetched on first visit.
const BlogIndex = lazy(() => import('@/components/BlogIndex'))
const BlogPost = lazy(() => import('@/components/BlogPost'))
const UtilitiesIndexPage = lazy(() => import('./pages/UtilitiesIndexPage'))
const UtilityDocPage = lazy(() => import('./pages/UtilityDocPage'))
const EmbedPage = lazy(() => import('./pages/EmbedPage'))
const ChangelogPage = lazy(() => import('./pages/ChangelogPage'))
const SitePage = lazy(() => import('./pages/SitePage'))
const HomeDirectory = lazy(() => import('./pages/HomeDirectory'))
const Docs = lazy(() => import('@/components/Docs'))
// PresetPage / PresetsIndexPage (./pages/presets/routes) are preloadable: main.tsx fetches
// them before mounting, so a pre-rendered preset page never flashes "Loading…"

const PageLoading = () => <div className="muted" role="status">Loading…</div>

// Real paths, not `#/` routes: search engines drop the fragment, so only path links
// reach the pre-rendered pages. `useInAppLinks` keeps clicks inside the running app.
const NAV = [
  { href: '/', key: 'nav.tool', routes: ['home', 'pipeline', 'notFound'] },
  { href: '/docs/', key: 'nav.docs', routes: ['docs'] },
  { href: '/utilities/', key: 'nav.utilities', routes: ['utilities', 'utility'] },
  { href: '/presets/', key: 'nav.presets', routes: ['presets', 'preset'] },
  { href: '/blog/', key: 'nav.blog', routes: ['blogIndex', 'blogPost'] },
  { href: '/changelog/', key: 'nav.changelog', routes: ['changelog'] },
] as const satisfies ReadonlyArray<{ href: string; key: string; routes: ReadonlyArray<Route['name']> }>

const FOOTER_LINKS = [
  { href: '/utilities/', key: 'footer.utilities' },
  { href: '/presets/', key: 'nav.presets' },
  { href: '/blog/', key: 'nav.blog' },
  { href: '/changelog/', key: 'nav.changelog' },
  { href: '/integrations/', key: 'footer.integrations' },
  { href: '/about/', key: 'footer.about' },
  { href: '/privacy/', key: 'footer.privacy' },
  { href: '/contact/', key: 'footer.contact' },
  { href: '/advertise/', key: 'footer.advertise' },
] as const

/** Site links on every page: the about, privacy and contact pages visitors look for, and the GitHub Sponsors page. */
export function Footer() {
  const { t } = useT()
  return (
    <footer className="border-t">
      <div className="max-w-[1440px] mx-auto px-4 sm:px-6 py-5 flex flex-wrap items-center justify-between gap-3 text-[12.5px] text-muted">
        <nav aria-label={t('footer.label')} className="flex flex-wrap gap-x-[18px] gap-y-1.5">
          {FOOTER_LINKS.map(l => <a key={l.href} href={l.href} className="text-muted hover:text-fg">{t(l.key)}</a>)}
          <a href={GITHUB_SPONSORS_URL} target="_blank" rel="noopener" className="text-muted hover:text-fg"
            aria-label={`${t('footer.sponsor')} ${t('footer.newTab')}`}>{t('footer.sponsor')}</a>
        </nav>
        <p className="m-0 font-mono text-[11px]">© {new Date().getFullYear()} String Utility Belt · MIT</p>
      </div>
    </footer>
  )
}

/**
 * Plain clicks on links to the app's own pages (`isInAppPath`) navigate in place,
 * like the hash links they replace; modified clicks and other targets behave normally.
 */
function useInAppLinks() {
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const anchor = (e.target as Element | null)?.closest?.('a[href]')
      const href = anchor?.getAttribute('href')
      if (!anchor || !href || anchor.hasAttribute('download') || !isInAppPath(href) || !isPlainLeftClick(e, anchor)) return
      e.preventDefault()
      navigateToPath(href)
    }
    // on document, after React's own handlers: a link that already handled its click
    // (defaultPrevented) is left alone
    document.addEventListener('click', onClick)
    return () => document.removeEventListener('click', onClick)
  }, [])
}

/** The site's mark: "sub" in a keycap, then the name. */
function Logo() {
  return (
    <a href="/" className="flex items-center gap-2.5 shrink-0 hover:text-fg">
      <span aria-hidden="true" className="font-mono text-[11px] font-medium leading-none px-1.5 pt-[5px] pb-1 border border-fg border-b-2 rounded-[4px]">sub</span>
      <span className="text-[15px] font-semibold tracking-[-0.01em]">String Utility Belt</span>
    </a>
  )
}

/** `current` (the active route's name) marks its nav link with `aria-current="page"`. */
export function Header({ children, current }: { children?: React.ReactNode; current?: Route['name'] }) {
  const { t } = useT()
  return (
    <header className="sticky top-0 z-30 bg-[rgb(var(--c-header)/.92)] backdrop-blur-sm border-b">
      {/* phones: logo and actions on one row, the nav scrolling sideways on its own row below */}
      <div className="max-w-[1440px] mx-auto px-4 sm:px-6 min-h-14 flex flex-wrap items-center gap-x-3 sm:gap-x-6">
        <Logo />
        <nav className="flex items-stretch gap-4 sm:gap-5 h-11 sm:h-14 text-[13.5px] font-medium overflow-x-auto max-sm:order-last max-sm:w-full max-sm:-mx-4 max-sm:px-4 max-sm:border-t [scrollbar-width:none]" aria-label="main">
          {NAV.map(n => {
            const active = !!current && (n.routes as ReadonlyArray<string>).includes(current)
            return (
              <a key={n.href} href={n.href} aria-current={active ? 'page' : undefined}
                className={`flex items-center pt-0.5 -mb-px border-b-2 whitespace-nowrap ${active ? 'border-acc text-fg' : 'border-transparent text-muted hover:text-fg'}`}>{t(n.key)}</a>
            )
          })}
        </nav>
        <div className="flex-1 min-w-0" />
        {children}
      </div>
    </header>
  )
}

function isFramed(): boolean {
  try { return window.self !== window.top } catch { return true } // cross-origin parent: definitely framed
}

function FramedNotice() {
  return (
    <main className="min-h-screen grid place-content-center p-6 text-center gap-3 text-fg">
      <p>String Utility Belt can't be used inside another page.</p>
      <p><a className="btn" href={location.href} target="_blank" rel="noopener noreferrer">Open it in a new tab</a></p>
    </main>
  )
}

/** Above the tool for an address that is not a page. */
function NotFoundNotice() {
  useDocumentMeta(pageTitle('Page not found'))
  // without this, search engines would index every mistyped URL as a copy of the home page
  useNoindex()
  return (
    <p role="status" className="card p-4 text-sm">
      <strong>Page not found.</strong> There is nothing at this address, so here is the pipeline tool instead —
      or <a className="underline underline-offset-2" href="/utilities/">browse all utilities</a>.
    </p>
  )
}

/** Opens the command palette; the visible counterpart of Ctrl+K. */
function PaletteButton() {
  return (
    <button type="button" aria-label="Open command palette (Ctrl+K)"
      onClick={() => window.dispatchEvent(new CustomEvent(EVENT_OPEN_PALETTE))}
      className="flex items-center justify-center sm:justify-start gap-2.5 size-8 sm:size-auto sm:flex-[0_1_240px] sm:min-w-[120px] sm:h-8 sm:pl-2.5 sm:pr-1.5 my-3 border rounded-md bg-surface-2 text-muted text-[13px] text-left hover:border-line-2">
      <Search size={15} aria-hidden="true" />
      <span className="hidden sm:block flex-1 truncate">Search or run a command</span>
      <kbd className="kbd hidden md:inline">Ctrl K</kbd>
    </button>
  )
}

/** The "?" shortcut's visible counterpart. */
function ShortcutsButton() {
  return (
    <button type="button" className="icon-btn max-sm:hidden" aria-label="Keyboard shortcuts (?)" title="Keyboard shortcuts (?)"
      onClick={() => window.dispatchEvent(new CustomEvent(EVENT_OPEN_SHORTCUTS))}>
      <Keyboard size={16} aria-hidden="true" />
    </button>
  )
}

/** Which page a route is for the extra promo slots, or none: the tool, shared pipelines and embeds carry no promotion. */
function promoPageOf(route: Route): PromoPage | undefined {
  switch (route.name) {
    case 'utility': return { kind: 'utility', id: route.params.id }
    case 'preset': return { kind: 'preset', slug: route.params.slug }
    case 'blogPost': return { kind: 'blog', slug: route.params.slug }
    case 'home': case 'pipeline': case 'notFound': case 'embed': return undefined
    default: return { kind: 'index' }
  }
}

export default function AppShell() {
  const [route, setRoute] = useState<Route>(getRoute())
  useEffect(() => onRouteChange(setRoute), [])
  useInAppLinks()
  // text shared into the installed app from the OS share sheet (?text= / ?url=)
  const sharedInput = useShareTarget()

  // embeds render without the site chrome so they fit an iframe
  if (route.name === 'embed') return <Suspense fallback={<PageLoading />}><EmbedPage payload={route.params.payload} /></Suspense>
  // Everything except the embed refuses to run framed by another page: the full app
  // has destructive actions (clear, delete from library) a framing site could trick
  // a user into clicking. A script check is enough — without scripts nothing renders.
  if (isFramed()) return <FramedNotice />

  const promoPage = promoPageOf(route)
  const isTool = route.name === 'home' || route.name === 'notFound' || route.name === 'pipeline'

  return (
    <div className="relative min-h-screen flex flex-col text-fg">
      {/* focus, don't navigate: with hash routing, href="#main" would route to an unknown page */}
      <a href="#main" className="sr-only-focusable absolute left-2 top-2 z-50 btn"
        onClick={e => { e.preventDefault(); document.getElementById('main')?.focus() }}>Skip to content</a>
      <UpdateBanner />
      <Header current={route.name}>
        <PaletteButton />
        {/* nothing in it installs on a phone, like the promos it is hidden there */}
        <div className="max-sm:hidden"><IntegrationsNav /></div>
        <div className="flex items-center gap-1 shrink-0">
          <InstallButton />
          <ShortcutsButton />
          <ThemeToggle />
        </div>
      </Header>
      {promoPage && <PagePromo page={promoPage} slot="strip" />}
      <main id="main" tabIndex={-1} className={`flex-1 w-full mx-auto px-4 sm:px-6 min-w-0 outline-hidden ${isTool
        ? 'max-w-[1440px] pt-7 pb-[72px] grid gap-7'
        : 'max-w-[1200px] pt-10 pb-20'}`}>
        <Suspense fallback={<PageLoading />}>
          {route.name === 'blogIndex' && <BlogIndex />}
          {route.name === 'blogPost' && <BlogPost slug={route.params.slug} />}
          {route.name === 'utilities' && <UtilitiesIndexPage />}
          {route.name === 'utility' && <UtilityDocPage id={route.params.id} />}
          {route.name === 'presets' && <PresetsIndexPage />}
          {route.name === 'preset' && <PresetPage key={route.params.slug} slug={route.params.slug} />}
          {route.name === 'changelog' && <ChangelogPage />}
          {route.name === 'page' && <SitePage slug={route.params.slug as SitePageSlug} />}
          {route.name === 'docs' && <Docs />}
        </Suspense>
        {route.name === 'pipeline' && <SharedPipeline payload={route.params.payload} />}
        {(route.name === 'home' || route.name === 'notFound') && (
          <>
            <ToolProvider initialInput={sharedInput}>
              <ToolPage banner={route.name === 'notFound' ? <NotFoundNotice /> : undefined} />
            </ToolProvider>
            <Suspense fallback={null}><HomeDirectory /></Suspense>
          </>
        )}
      </main>
      <Footer />
      <CommandPalette />
      <ShortcutsHelp />
    </div>
  )
}
