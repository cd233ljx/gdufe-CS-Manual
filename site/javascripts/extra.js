/* ========================================
   GDUFE CS Manual - 额外交互脚本
   ======================================== */

// DOM 加载完成后执行
document.addEventListener('DOMContentLoaded', function() {
  // 初始化所有功能
  initSmoothScroll();
  initCodeBlockEnhancement();
  initTableEnhancement();
  initExternalLinks();
  initBackToTopAnimation();
  initReadingProgress();
  initCopyFeedback();
});

/**
 * 平滑滚动
 */
function initSmoothScroll() {
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function(e) {
      const targetId = this.getAttribute('href');
      if (targetId === '#') return;
      
      const targetElement = document.querySelector(targetId);
      if (targetElement) {
        e.preventDefault();
        targetElement.scrollIntoView({
          behavior: 'smooth',
          block: 'start'
        });
        
        // 更新 URL 但不跳转
        history.pushState(null, null, targetId);
      }
    });
  });
}

/**
 * 代码块增强
 */
function initCodeBlockEnhancement() {
  document.querySelectorAll('.highlight').forEach(block => {
    // 添加语言标签
    const codeElement = block.querySelector('code');
    if (codeElement) {
      const langClass = Array.from(codeElement.classList).find(c => c.startsWith('language-'));
      if (langClass) {
        const lang = langClass.replace('language-', '');
        const langLabel = document.createElement('span');
        langLabel.className = 'code-lang-label';
        langLabel.textContent = lang;
        langLabel.style.cssText = `
          position: absolute;
          top: 0;
          right: 3rem;
          padding: 0.25rem 0.75rem;
          background: var(--gdufe-primary);
          color: white;
          font-size: 0.75rem;
          font-weight: 600;
          text-transform: uppercase;
          border-radius: 0 0 0 4px;
        `;
        block.style.position = 'relative';
        block.appendChild(langLabel);
      }
    }
  });
}

/**
 * 表格增强 - 添加响应式包装
 */
function initTableEnhancement() {
  document.querySelectorAll('.md-typeset table').forEach(table => {
    if (!table.parentElement.classList.contains('table-wrapper')) {
      const wrapper = document.createElement('div');
      wrapper.className = 'table-wrapper';
      wrapper.style.cssText = 'overflow-x: auto; margin: 1rem 0;';
      table.parentNode.insertBefore(wrapper, table);
      wrapper.appendChild(table);
    }
  });
}

/**
 * 外部链接处理
 */
function initExternalLinks() {
  document.querySelectorAll('.md-content a[href^="http"]').forEach(link => {
    if (!link.href.includes(window.location.hostname)) {
      link.setAttribute('target', '_blank');
      link.setAttribute('rel', 'noopener noreferrer');
      
      // 添加外部链接图标
      if (!link.querySelector('.external-link-icon')) {
        const icon = document.createElement('span');
        icon.className = 'external-link-icon';
        icon.innerHTML = ' ↗';
        icon.style.cssText = 'font-size: 0.75em; opacity: 0.6;';
        link.appendChild(icon);
      }
    }
  });
}

/**
 * 返回顶部按钮动画
 */
function initBackToTopAnimation() {
  const backToTop = document.querySelector('.md-top');
  if (backToTop) {
    let lastScrollY = window.scrollY;
    
    window.addEventListener('scroll', () => {
      const currentScrollY = window.scrollY;
      
      if (currentScrollY > 300) {
        backToTop.style.opacity = '1';
        backToTop.style.visibility = 'visible';
      } else {
        backToTop.style.opacity = '0';
        backToTop.style.visibility = 'hidden';
      }
      
      lastScrollY = currentScrollY;
    }, { passive: true });
  }
}

/**
 * 阅读进度指示器
 */
function initReadingProgress() {
  // 创建进度条
  const progressBar = document.createElement('div');
  progressBar.id = 'reading-progress';
  progressBar.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 0%;
    height: 3px;
    background: linear-gradient(90deg, var(--gdufe-accent), var(--gdufe-accent-light));
    z-index: 1000;
    transition: width 0.1s ease;
  `;
  document.body.appendChild(progressBar);
  
  window.addEventListener('scroll', () => {
    const scrollTop = window.scrollY;
    const docHeight = document.documentElement.scrollHeight - window.innerHeight;
    const progress = (scrollTop / docHeight) * 100;
    progressBar.style.width = progress + '%';
  }, { passive: true });
}

/**
 * 复制按钮反馈
 */
function initCopyFeedback() {
  document.querySelectorAll('.md-clipboard').forEach(button => {
    button.addEventListener('click', function() {
      const originalTitle = this.getAttribute('title');
      
      // 显示成功反馈
      this.setAttribute('title', '已复制!');
      this.style.color = 'var(--gdufe-success)';
      
      // 创建提示
      const toast = document.createElement('div');
      toast.textContent = '代码已复制到剪贴板';
      toast.style.cssText = `
        position: fixed;
        bottom: 2rem;
        left: 50%;
        transform: translateX(-50%);
        padding: 0.75rem 1.5rem;
        background: var(--gdufe-text);
        color: white;
        border-radius: 8px;
        font-size: 0.875rem;
        z-index: 1000;
        animation: fadeInUp 0.3s ease;
      `;
      document.body.appendChild(toast);
      
      // 恢复原状
      setTimeout(() => {
        this.setAttribute('title', originalTitle);
        this.style.color = '';
        toast.remove();
      }, 2000);
    });
  });
}

/**
 * 图片点击放大
 */
function initImageLightbox() {
  document.querySelectorAll('.md-content img').forEach(img => {
    img.style.cursor = 'zoom-in';
    img.addEventListener('click', function() {
      // 创建遮罩层
      const overlay = document.createElement('div');
      overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.9);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
        cursor: zoom-out;
        animation: fadeIn 0.3s ease;
      `;
      
      // 创建放大图片
      const enlargedImg = document.createElement('img');
      enlargedImg.src = this.src;
      enlargedImg.style.cssText = `
        max-width: 90%;
        max-height: 90%;
        object-fit: contain;
        animation: zoomIn 0.3s ease;
      `;
      
      overlay.appendChild(enlargedImg);
      document.body.appendChild(overlay);
      
      // 点击关闭
      overlay.addEventListener('click', () => {
        overlay.style.animation = 'fadeOut 0.3s ease';
        setTimeout(() => overlay.remove(), 300);
      });
    });
  });
}

// 添加 CSS 动画
const style = document.createElement('style');
style.textContent = `
  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }
  
  @keyframes fadeOut {
    from { opacity: 1; }
    to { opacity: 0; }
  }
  
  @keyframes zoomIn {
    from { transform: scale(0.8); opacity: 0; }
    to { transform: scale(1); opacity: 1; }
  }
`;
document.head.appendChild(style);

// 初始化图片放大功能
if (document.querySelector('.md-content img')) {
  initImageLightbox();
}