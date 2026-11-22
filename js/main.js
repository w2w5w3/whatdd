/* ============================================================
 * 我的刀盾 · BLADE & SHIELD
 * main.js — 启动与资源预加载
 * ============================================================ */
(function (global) {
  'use strict';

  const MIN_LOAD_MS = 720;
  const MAX_LOAD_MS = 20000;
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  function assetList() {
    const list = new Set();
    (global.CG.CARDS || []).forEach((card) => card.img && list.add(card.img));
    (global.CG.HEROES || []).forEach((hero) => {
      if (hero.img) list.add(hero.img);
      if (hero.portrait) list.add(hero.portrait);
    });
    ['assets/backs/back1.webp', 'assets/backs/back2.webp', 'assets/backs/back3.webp', 'assets/summons/huohuli.webp', 'assets/summons/huohuli-card.webp']
      .forEach((src) => list.add(src));
    return Array.from(list);
  }

  function loadImage(src) {
    return new Promise((resolve) => {
      const img = new Image();
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        resolve();
      };
      img.onload = finish;
      img.onerror = finish;
      img.src = src;
      if (img.complete) finish();
    });
  }

  function runPreloader() {
    const loader = document.getElementById('boot-loader');
    const bar = document.getElementById('boot-progress');
    const percentEl = document.getElementById('boot-percent');
    const statusEl = document.getElementById('boot-status');
    const assets = assetList();
    const total = Math.max(assets.length, 1);
    let loaded = 0;
    let failed = 0;

    const render = (count) => {
      const pct = Math.min(100, Math.round((count / total) * 100));
      if (bar) bar.style.width = pct + '%';
      if (percentEl) percentEl.textContent = pct + '%';
      if (statusEl) statusEl.textContent = `正在加载卡牌与立绘 ${Math.min(count, total)} / ${total}`;
    };
    render(0);

    const tasks = assets.map((src) =>
      loadImage(src).then(() => {
        loaded += 1;
        render(loaded);
      }).catch(() => {
        failed += 1;
        loaded += 1;
        render(loaded);
      })
    );

    const all = Promise.all(tasks).then(() => {
      if (failed && statusEl) statusEl.textContent = `${failed} 项资源未加载，仍可进入游戏`;
      else if (statusEl) statusEl.textContent = '准备就绪';
    });

    return Promise.race([Promise.all([all, sleep(MIN_LOAD_MS)]), sleep(MAX_LOAD_MS)])
      .then(() => {
        if (bar) bar.style.width = '100%';
        if (percentEl) percentEl.textContent = '100%';
        if (statusEl && failed) statusEl.textContent = `${failed} 项资源未加载，仍可进入游戏`;
        else if (statusEl) statusEl.textContent = '准备就绪';
        if (loader) {
          loader.classList.add('is-done');
          setTimeout(() => loader.remove(), 650);
        }
      });
  }

  function boot() {
    if (!global.CG || !CG.UI) {
      console.error('我的刀盾：脚本未正确加载');
      const loader = document.getElementById('boot-loader');
      if (loader) loader.remove();
      return;
    }

    runPreloader()
      .catch((error) => {
        console.error('资源加载异常，继续启动：', error);
        const loader = document.getElementById('boot-loader');
        if (loader) loader.remove();
      })
      .then(() => {
        CG.UI.init();

        // 首次触摸/点击时解锁音频
        const unlock = () => {
          CG.Audio.resume();
          document.removeEventListener('pointerdown', unlock);
          document.removeEventListener('touchstart', unlock);
        };
        document.addEventListener('pointerdown', unlock, { passive: true });
        document.addEventListener('touchstart', unlock, { passive: true });

        // PWA：仅在 HTTPS 下注册，避免本地开发缓存干扰
        if ('serviceWorker' in navigator && location.protocol === 'https:') {
          window.addEventListener('load', () => {
            navigator.serviceWorker.register('./sw.js').catch(() => {});
          });
        }
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(typeof window !== 'undefined' ? window : globalThis);
