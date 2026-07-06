/* ===== 烬海长歌 · Reader App ===== */

const App = {
  manifest: null,
  chapters: {},      // cache: { chapterNum: {n,t,c} }
  currentCh: 1,
  currentView: 'hero',
  settings: {
    fontSize: 18,
    lineHeight: 2.0,
    theme: 'dark'
  },
  readHistory: [],   // chapters read
  bookmarks: [],     // bookmarked chapter numbers
  uiVisible: true,
  batchCache: {},    // cached batch JSONs

  // ===== INIT =====
  async init() {
    await this.loadManifest();
    this.loadSettings();
    this.loadHistory();
    this.loadBookmarks();
    this.applySettings();
    this.initEmbers();
    this.updateHeroMeta();
    this.checkContinueReading();
    
    // Handle URL hash for direct chapter links
    if (location.hash) {
      const m = location.hash.match(/^#ch(\d+)$/);
      if (m) { this.openChapter(parseInt(m[1])); return; }
    }
  },

  async loadManifest() {
    try {
      const res = await fetch('data/manifest.json');
      this.manifest = await res.json();
      this.totalChapters = this.manifest.totalChapters;
    } catch(e) {
      console.error('Failed to load manifest', e);
    }
  },

  updateHeroMeta() {
    const el = document.getElementById('heroChapters');
    if (el && this.manifest) el.textContent = this.manifest.totalChapters + ' 章';
  },

  checkContinueReading() {
    const last = this.readHistory[this.readHistory.length - 1];
    if (last) {
      const btn = document.getElementById('continueBtn');
      btn.style.display = 'inline-block';
      btn.textContent = '继续阅读 · 第' + last + '章';
    }
  },

  // ===== VIEW SWITCHING =====
  showView(name) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById(name + 'View').classList.add('active');
    this.currentView = name;
    if (name !== 'reader') {
      document.getElementById('readerBar')?.classList.remove('hidden');
      document.getElementById('readerNav')?.classList.remove('hidden');
    }
  },

  showHero() {
    this.showView('hero');
    location.hash = '';
  },

  showTOC() {
    this.showView('toc');
    if (!this._tocBuilt) { this.buildTOC(); this._tocBuilt = true; }
  },

  startReading() {
    this.openChapter(1);
  },

  continueReading() {
    const last = this.readHistory[this.readHistory.length - 1];
    this.openChapter(last || 1);
  },

  // ===== CHAPTER DATA LOADING =====
  getBatchId(chNum) {
    return Math.floor((chNum - 1) / 50) + 1;
  },

  async loadBatch(batchId) {
    if (this.batchCache[batchId]) return this.batchCache[batchId];
    try {
      const res = await fetch(`data/ch_${String(batchId).padStart(2,'0')}.json`);
      const data = await res.json();
      // Cache individual chapters
      for (const ch of data) {
        this.chapters[ch.n] = ch;
      }
      this.batchCache[batchId] = data;
      return data;
    } catch(e) {
      console.error('Failed to load batch', batchId, e);
      return null;
    }
  },

  async getChapter(chNum) {
    if (this.chapters[chNum]) return this.chapters[chNum];
    const batchId = this.getBatchId(chNum);
    await this.loadBatch(batchId);
    return this.chapters[chNum];
  },

  // ===== READER =====
  async openChapter(chNum) {
    if (chNum < 1 || chNum > this.totalChapters) return;
    this.showView('reader');
    this.currentCh = chNum;
    
    const inner = document.getElementById('readerInner');
    inner.innerHTML = '<div class="loading">加载中…</div>';
    
    // Scroll to top
    document.getElementById('readerView').scrollTop = 0;
    
    const ch = await this.getChapter(chNum);
    if (!ch) { inner.innerHTML = '<div class="loading">加载失败</div>'; return; }
    
    // Parse title
    const titleParts = ch.t.split(/\s+/);
    let titleHTML = '';
    if (titleParts.length >= 2) {
      titleHTML = `<div class="ch-title">${titleParts[0]}</div><div class="ch-subtitle">${titleParts.slice(1).join(' ')}</div>`;
    } else {
      titleHTML = `<div class="ch-title">${ch.t}</div>`;
    }
    
    // Parse content into paragraphs
    const paragraphs = ch.c.split('\n');
    let contentHTML = '';
    for (const p of paragraphs) {
      const trimmed = p.trim();
      if (trimmed === '') { continue; }
      if (trimmed === '※ ※ ※') {
        contentHTML += '<p class="ch-separator">※ ※ ※</p>';
      } else {
        contentHTML += `<p>${this.escapeHtml(trimmed)}</p>`;
      }
    }
    
    inner.innerHTML = titleHTML + contentHTML;
    
    // Update bar
    document.getElementById('readerChNum').textContent = '第 ' + chNum + ' 章';
    document.getElementById('readerChTitle').textContent = ch.t;
    document.getElementById('chapterProgress').textContent = chNum + ' / ' + this.totalChapters;
    
    // Nav buttons
    document.getElementById('prevBtn').disabled = chNum <= 1;
    document.getElementById('nextBtn').disabled = chNum >= this.totalChapters;
    
    // Bookmark state
    this.updateBookmarkBtn();
    
    // Record history
    this.recordRead(chNum);
    
    // URL hash
    location.hash = 'ch' + chNum;
    
    // Preload adjacent batches
    this.preloadAdjacent(chNum);
    
    // Reset progress bar
    this.updateProgress();
  },

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  },

  preloadAdjacent(chNum) {
    const cur = this.getBatchId(chNum);
    this.loadBatch(cur + 1);
    this.loadBatch(cur - 1);
  },

  prevChapter() {
    if (this.currentCh > 1) this.openChapter(this.currentCh - 1);
  },

  nextChapter() {
    if (this.currentCh < this.totalChapters) this.openChapter(this.currentCh + 1);
  },

  // ===== TOC =====
  buildTOC() {
    const list = document.getElementById('tocList');
    const volumes = this.manifest.volumes || [];
    const volumeChs = new Set(volumes.map(v => v.ch));
    
    let html = '';
    for (let i = 1; i <= this.totalChapters; i++) {
      // Insert volume separator
      const vol = volumes.find(v => v.ch === i);
      if (vol) {
        html += `<div class="toc-volume">${this.escapeHtml(vol.title)}</div>`;
      }
      
      // We don't have all titles loaded yet, so show a placeholder
      // that gets filled when the batch loads
      const isRead = this.readHistory.includes(i);
      const isCurrent = i === this.currentCh;
      html += `<div class="toc-item${isRead?' read':''}${isCurrent?' current':''}" onclick="App.openChapter(${i})" data-ch="${i}">
        <span class="toc-num">${i}</span>
        <span class="toc-title" id="toc-title-${i}">第${i}章</span>
        ${isRead?'<span class="toc-badge">已读</span>':''}
      </div>`;
    }
    list.innerHTML = html;
    
    // Update meta
    document.getElementById('tocMeta').textContent = this.totalChapters + ' 章';
    
    // Lazy-load titles
    this.loadAllTitles();
  },

  async loadAllTitles() {
    // Load all batches to get titles
    const totalBatches = Math.ceil(this.totalChapters / 50);
    for (let b = 1; b <= totalBatches; b++) {
      const data = await this.loadBatch(b);
      if (!data) continue;
      for (const ch of data) {
        const el = document.getElementById('toc-title-' + ch.n);
        if (el) {
          // Show title without chapter number prefix
          const title = ch.t.replace(/^第\s*\d+\s*章\s*/, '');
          el.textContent = title || ch.t;
        }
      }
    }
  },

  searchChapters() {
    const q = document.getElementById('tocSearch').value.trim().toLowerCase();
    const items = document.querySelectorAll('.toc-item');
    items.forEach(item => {
      if (!q) { item.style.display = ''; return; }
      const num = item.dataset.ch;
      const title = (item.querySelector('.toc-title')?.textContent || '').toLowerCase();
      if (title.includes(q) || num.includes(q)) {
        item.style.display = '';
      } else {
        item.style.display = 'none';
      }
    });
  },

  // ===== SETTINGS =====
  toggleSettings() {
    document.getElementById('settingsPanel').classList.toggle('show');
  },

  changeFontSize(delta) {
    this.settings.fontSize = Math.max(14, Math.min(28, this.settings.fontSize + delta));
    this.applySettings();
    this.saveSettings();
  },

  changeLineHeight(delta) {
    this.settings.lineHeight = Math.max(1.4, Math.min(3.0, Math.round((this.settings.lineHeight + delta) * 10) / 10));
    this.applySettings();
    this.saveSettings();
  },

  setTheme(theme) {
    this.settings.theme = theme;
    document.body.className = 'theme-' + theme;
    this.saveSettings();
  },

  applySettings() {
    document.documentElement.style.setProperty('--reader-font-size', this.settings.fontSize + 'px');
    document.documentElement.style.setProperty('--reader-line-height', this.settings.lineHeight);
    document.getElementById('fontSizeLabel').textContent = this.settings.fontSize;
    document.body.className = 'theme-' + this.settings.theme;
  },

  saveSettings() {
    localStorage.setItem('jhcg_settings', JSON.stringify(this.settings));
  },

  loadSettings() {
    const s = localStorage.getItem('jhcg_settings');
    if (s) {
      try { this.settings = { ...this.settings, ...JSON.parse(s) }; } catch(e) {}
    }
  },

  // ===== HISTORY =====
  recordRead(chNum) {
    const idx = this.readHistory.indexOf(chNum);
    if (idx > -1) this.readHistory.splice(idx, 1);
    this.readHistory.push(chNum);
    // Keep last 200
    if (this.readHistory.length > 200) this.readHistory = this.readHistory.slice(-200);
    this.saveHistory();
  },

  saveHistory() {
    localStorage.setItem('jhcg_history', JSON.stringify(this.readHistory));
  },

  loadHistory() {
    const h = localStorage.getItem('jhcg_history');
    if (h) {
      try { this.readHistory = JSON.parse(h); } catch(e) {}
    }
  },

  // ===== BOOKMARKS =====
  toggleBookmark() {
    const idx = this.bookmarks.indexOf(this.currentCh);
    if (idx > -1) {
      this.bookmarks.splice(idx, 1);
    } else {
      this.bookmarks.push(this.currentCh);
    }
    this.saveBookmarks();
    this.updateBookmarkBtn();
  },

  updateBookmarkBtn() {
    const btn = document.getElementById('bookmarkBtn');
    const svg = btn.querySelector('path');
    if (this.bookmarks.includes(this.currentCh)) {
      svg.setAttribute('fill', 'currentColor');
      btn.style.color = 'var(--accent)';
    } else {
      svg.setAttribute('fill', 'none');
      btn.style.color = '';
    }
  },

  saveBookmarks() {
    localStorage.setItem('jhcg_bookmarks', JSON.stringify(this.bookmarks));
  },

  loadBookmarks() {
    const b = localStorage.getItem('jhcg_bookmarks');
    if (b) {
      try { this.bookmarks = JSON.parse(b); } catch(e) {}
    }
  },

  // ===== UI TOGGLE =====
  toggleReaderUI() {
    this.uiVisible = !this.uiVisible;
    const bar = document.getElementById('readerBar');
    const nav = document.getElementById('readerNav');
    if (this.uiVisible) {
      bar.classList.remove('hidden');
      nav.classList.remove('hidden');
    } else {
      bar.classList.add('hidden');
      nav.classList.add('hidden');
    }
  },

  // ===== PROGRESS BAR =====
  updateProgress() {
    const view = document.getElementById('readerView');
    const fill = document.getElementById('progressFill');
    const maxScroll = view.scrollHeight - view.clientHeight;
    if (maxScroll > 0) {
      const pct = (view.scrollTop / maxScroll) * 100;
      fill.style.width = pct + '%';
    }
  },

  // ===== EMBER PARTICLES =====
  initEmbers() {
    const canvas = document.getElementById('emberCanvas');
    const ctx = canvas.getContext('2d');
    let W, H, particles = [];

    function resize() {
      W = canvas.width = window.innerWidth;
      H = canvas.height = window.innerHeight;
    }
    resize();
    window.addEventListener('resize', resize);

    function createParticle() {
      return {
        x: Math.random() * W,
        y: H + 10,
        vx: (Math.random() - 0.5) * 0.5,
        vy: -0.3 - Math.random() * 0.8,
        size: 0.5 + Math.random() * 2,
        life: 0,
        maxLife: 200 + Math.random() * 300,
        hue: 25 + Math.random() * 20
      };
    }

    // Initial particles
    for (let i = 0; i < 30; i++) {
      const p = createParticle();
      p.y = Math.random() * H;
      p.life = Math.random() * p.maxLife;
      particles.push(p);
    }

    function animate() {
      ctx.clearRect(0, 0, W, H);
      
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.vx += (Math.random() - 0.5) * 0.05;
        p.life++;
        
        const alpha = Math.sin((p.life / p.maxLife) * Math.PI) * 0.6;
        
        if (p.life > p.maxLife || p.y < -10) {
          particles[i] = createParticle();
          continue;
        }
        
        const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 3);
        grad.addColorStop(0, `hsla(${p.hue}, 80%, 60%, ${alpha})`);
        grad.addColorStop(0.5, `hsla(${p.hue}, 70%, 50%, ${alpha * 0.3})`);
        grad.addColorStop(1, `hsla(${p.hue}, 60%, 40%, 0)`);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * 3, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.fillStyle = `hsla(${p.hue}, 90%, 70%, ${alpha})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * 0.5, 0, Math.PI * 2);
        ctx.fill();
      }
      
      requestAnimationFrame(animate);
    }
    animate();
  }
};

// ===== BOOTSTRAP =====
document.addEventListener('DOMContentLoaded', () => {
  App.init();
  
  // Progress bar on scroll
  document.getElementById('readerView').addEventListener('scroll', () => {
    App.updateProgress();
  });
  
  // Keyboard navigation
  document.addEventListener('keydown', (e) => {
    if (App.currentView !== 'reader') return;
    if (e.target.tagName === 'INPUT') return;
    if (e.key === 'ArrowLeft') App.prevChapter();
    if (e.key === 'ArrowRight') App.nextChapter();
    if (e.key === ' ') { e.preventDefault(); App.toggleReaderUI(); }
  });
  
  // Close settings on outside click
  document.addEventListener('click', (e) => {
    const panel = document.getElementById('settingsPanel');
    const btn = e.target.closest('[onclick*="toggleSettings"]');
    if (panel.classList.contains('show') && !panel.contains(e.target) && !btn) {
      panel.classList.remove('show');
    }
  });
});
