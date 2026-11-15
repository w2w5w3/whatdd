/* ============================================================
 * 烬契 · EMBER PACT
 * main.js — 启动
 * ============================================================ */
(function (global) {
  'use strict';
  function boot() {
    if (!global.CG || !CG.UI) {
      console.error('烬契：脚本未正确加载');
      return;
    }
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
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(typeof window !== 'undefined' ? window : globalThis);
