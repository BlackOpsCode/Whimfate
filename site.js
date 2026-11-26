/* Whimfate shared chrome: adaptive masthead, global atmosphere, and link-first footer. */
(() => {
  const headerMount = document.getElementById('site-header');
  const footerMount = document.getElementById('site-footer');
  const path = window.location.pathname.replace(/\/+$/, '') || '/';

  // One consistent animated background on editorial pages and the homepage. Keep game consoles pure black and distraction-free.
  const isFocusedGame = document.body.classList.contains('page-game-module') || document.body.classList.contains('page-team-splitter');
  if (!isFocusedGame && !document.querySelector('.site-atmosphere')) {
    const atmosphere = document.createElement('div');
    atmosphere.className = 'site-atmosphere';
    atmosphere.setAttribute('aria-hidden', 'true');
    atmosphere.innerHTML = `
      <span class="site-atmosphere-mist site-atmosphere-mist-violet"></span>
      <span class="site-atmosphere-mist site-atmosphere-mist-green"></span>
      <span class="site-atmosphere-stream site-atmosphere-stream-violet"></span>
      <span class="site-atmosphere-stream site-atmosphere-stream-green"></span>
      <img class="site-atmosphere-orb" src="/orb.svg" alt="" fetchpriority="high">
      <span class="site-atmosphere-mist-veil site-atmosphere-mist-veil-violet"></span>
      <span class="site-atmosphere-mist-veil site-atmosphere-mist-veil-green"></span>
      <span class="site-atmosphere-flare"></span>
      <div class="site-atmosphere-particles"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div>`;
    document.body.insertBefore(atmosphere, document.body.firstChild);
  }

  const navItems = [
    { href: '/#games', label: 'Play', match: '/' },
    { href: '/ideas.html#field-notes', label: 'Ideas', match: '/ideas.html' },
    { href: '/our-way.html', label: 'Our way', match: '/our-way.html' },
    { href: '/about.html', label: 'About', match: '/about.html' }
  ];

  if (headerMount) {
    headerMount.innerHTML = `
      <a class="skip-link" href="#main-content">Skip to content</a>
      <header class="site-header">
        <div class="masthead-brand-row">
          <a class="brand" href="/" aria-label="Whimfate home"><span class="brand-word">Whimfate</span></a>
        </div>
        <div class="masthead-nav-row">
          <nav class="primary-nav" id="primary-nav" aria-label="Main navigation">
            ${navItems.map(item => `<a href="${item.href}"${path === item.match ? ' aria-current="page"' : ''}>${item.label}</a>`).join('')}
          </nav>
        </div>
      </header>`;

    const header = headerMount.querySelector('.site-header');
    let lastScrollY = window.scrollY;
    let scrollQueued = false;
    const showHeader = () => header.classList.remove('is-hidden-on-scroll');
    const hideHeader = () => {
      if (!header.matches(':focus-within')) header.classList.add('is-hidden-on-scroll');
    };
    header.addEventListener('focusin', showHeader);
    header.addEventListener('pointerenter', () => {
      if (window.scrollY < 160) showHeader();
    });
    window.addEventListener('scroll', () => {
      if (scrollQueued) return;
      scrollQueued = true;
      window.requestAnimationFrame(() => {
        const currentY = Math.max(0, window.scrollY);
        const delta = currentY - lastScrollY;
        if (currentY < 135) {
          showHeader();
        } else if (delta > 3) {
          hideHeader();
        } else if (delta < -3) {
          showHeader();
        }
        lastScrollY = currentY;
        scrollQueued = false;
      });
    }, { passive: true });
    window.addEventListener('pageshow', showHeader);
  }

  if (footerMount) {
    footerMount.innerHTML = `
      <footer class="site-footer">
        <div class="footer-main shell">
          <a class="footer-wordmark" href="/" aria-label="Whimfate home">Whimfate</a>
          <div class="footer-link-groups">
            <section class="footer-group footer-play-group" aria-labelledby="footer-play-title">
              <h2 id="footer-play-title">Play</h2>
              <div class="footer-play-grid">
                <a href="/team-splitter/">Team Splitter</a>
                <a href="/daily-oracle/">Daily Oracle</a>
                <a href="/coin-flip/">Coin Flip</a>
                <a href="/dice-roll/">Dice Roller</a>
                <a href="/this-or-that/">This or That</a>
                <a href="/random-number-generator/">Random Number</a>
                <a href="/decision-maker/">Decision Wheel</a>
              </div>
            </section>
            <section class="footer-group" aria-labelledby="footer-info-title">
              <h2 id="footer-info-title">Info &amp; legal</h2>
              <div class="footer-link-list">
                <a href="/about.html">About</a>
                <a href="/terms.html">Terms</a>
                <a href="/privacy.html">Privacy</a>
              </div>
            </section>
            <section class="footer-group" aria-labelledby="footer-more-title">
              <h2 id="footer-more-title">More</h2>
              <div class="footer-link-list">
                <a href="/ideas.html#field-notes">Blog</a>
                <a href="/ideas.html">Ideas</a>
                <a href="/our-way.html">Our way</a>
                <a href="/manifesto.html">Manifesto</a>
              </div>
            </section>
          </div>
        </div>
        <div class="footer-bottom shell">
          <span>© <span data-current-year>2026</span> Whimfate</span>
          <span>For the beautifully undecided.</span>
        </div>
      </footer>`;
    const year = footerMount.querySelector('[data-current-year]');
    if (year) year.textContent = new Date().getFullYear();
  }
})();
