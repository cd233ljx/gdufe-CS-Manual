/* ========================================
   GDUFE CS Manual · Paper & Ink Interactions
   ======================================== */

document.addEventListener('DOMContentLoaded', function () {
  initSmoothScroll();
  initCodeBlockEnhancement();
  initTableEnhancement();
  initExternalLinks();
  initReadingProgress();
  initCopyFeedback();
  initImageLightbox();
});

function initSmoothScroll() {
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
      const targetId = this.getAttribute('href');
      if (targetId === '#') return;
      const target = document.querySelector(targetId);
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        history.pushState(null, null, targetId);
      }
    });
  });
}

function initCodeBlockEnhancement() {
  document.querySelectorAll('.highlight').forEach(block => {
    const code = block.querySelector('code');
    if (!code) return;
    const langClass = Array.from(code.classList).find(c => c.startsWith('language-'));
    if (!langClass) return;
    const lang = langClass.replace('language-', '');
    const label = document.createElement('span');
    label.className = 'code-lang-label';
    label.textContent = lang;
    label.style.cssText = `
      position: absolute;
      top: 0;
      right: 3rem;
      padding: 0.15rem 0.5rem;
      background: var(--gdufe-bg);
      color: var(--gdufe-text-muted);
      font-size: 0.65rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      border-radius: 0 0 var(--radius-xs) var(--radius-xs);
      border: 1px solid var(--gdufe-border);
      border-top: none;
    `;
    block.style.position = 'relative';
    block.appendChild(label);
  });
}

function initTableEnhancement() {
  document.querySelectorAll('.md-typeset table').forEach(table => {
    if (table.parentElement.classList.contains('table-wrapper')) return;
    const wrapper = document.createElement('div');
    wrapper.className = 'table-wrapper';
    wrapper.style.cssText = 'overflow-x: auto; margin: 1rem 0; -webkit-overflow-scrolling: touch;';
    table.parentNode.insertBefore(wrapper, table);
    wrapper.appendChild(table);
  });
}

function initExternalLinks() {
  document.querySelectorAll('.md-content a[href^="http"]').forEach(link => {
    if (link.href.includes(window.location.hostname)) return;
    link.setAttribute('target', '_blank');
    link.setAttribute('rel', 'noopener noreferrer');
    if (link.querySelector('.external-link-icon')) return;
    const icon = document.createElement('span');
    icon.className = 'external-link-icon';
    icon.innerHTML = ' ↗';
    icon.style.cssText = 'font-size: 0.7em; opacity: 0.45;';
    link.appendChild(icon);
  });
}

function initReadingProgress() {
  const bar = document.createElement('div');
  bar.id = 'reading-progress';
  bar.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 0%;
    height: 2px;
    background: var(--gdufe-primary);
    z-index: 1000;
    transition: width 150ms cubic-bezier(0.4, 0, 0.2, 1);
    pointer-events: none;
  `;
  document.body.appendChild(bar);

  window.addEventListener('scroll', () => {
    const scrollTop = window.scrollY;
    const docHeight = document.documentElement.scrollHeight - window.innerHeight;
    if (docHeight <= 0) return;
    bar.style.width = (scrollTop / docHeight * 100) + '%';
  }, { passive: true });
}

function initCopyFeedback() {
  document.querySelectorAll('.md-clipboard').forEach(button => {
    button.addEventListener('click', function () {
      const orig = this.getAttribute('title');
      this.setAttribute('title', '已复制!');
      this.style.color = 'var(--gdufe-primary)';

      const toast = document.createElement('div');
      toast.textContent = '代码已复制到剪贴板';
      toast.style.cssText = `
        position: fixed;
        bottom: 2rem;
        left: 50%;
        transform: translateX(-50%);
        padding: 0.5rem 1rem;
        background: var(--gdufe-text);
        color: var(--gdufe-bg);
        border-radius: var(--radius-sm);
        font-size: 0.8rem;
        font-weight: 500;
        z-index: 1000;
        box-shadow: var(--shadow-md);
      `;
      document.body.appendChild(toast);

      setTimeout(() => {
        this.setAttribute('title', orig);
        this.style.color = '';
        toast.remove();
      }, 1800);
    });
  });
}

function initImageLightbox() {
  const images = document.querySelectorAll('.md-content img');
  if (!images.length) return;

  images.forEach(img => {
    img.style.cursor = 'zoom-in';
    img.addEventListener('click', function () {
      const overlay = document.createElement('div');
      overlay.style.cssText = `
        position: fixed;
        inset: 0;
        background: rgba(42, 38, 34, 0.88);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
        cursor: zoom-out;
        opacity: 0;
        transition: opacity 0.25s ease;
      `;

      const enlarged = document.createElement('img');
      enlarged.src = this.src;
      enlarged.style.cssText = `
        max-width: 90%;
        max-height: 90%;
        object-fit: contain;
        border-radius: var(--radius-sm);
        box-shadow: 0 4px 24px rgba(0,0,0,0.3);
        transform: scale(0.95);
        transition: transform 0.25s ease;
      `;

      overlay.appendChild(enlarged);
      document.body.appendChild(overlay);

      requestAnimationFrame(() => {
        overlay.style.opacity = '1';
        enlarged.style.transform = 'scale(1)';
      });

      overlay.addEventListener('click', () => {
        overlay.style.opacity = '0';
        enlarged.style.transform = 'scale(0.95)';
        setTimeout(() => overlay.remove(), 250);
      });
    });
  });
}
