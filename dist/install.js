(() => {
  const $ = id => document.getElementById(id);
  const entry = $('install-entry');
  if (!entry) return;
  const help = $('install-help');
  const openButton = $('install-open');
  const ua = navigator.userAgent || '';
  const ios = /iPhone|iPad|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const android = /Android/i.test(ua);
  const inApp = /MicroMessenger|\bQQ\//i.test(ua);
  const displayMode = window.matchMedia ? window.matchMedia('(display-mode: standalone)') : null;
  let installPrompt = null;
  let prompting = false;
  const standalone = () => navigator.standalone === true || !!displayMode?.matches;
  const status = message => {
    $('install-status').textContent = message;
    $('install-status').hidden = !message;
  };
  const updateEntry = () => { entry.hidden = standalone(); };
  const setHelp = shown => {
    help.hidden = !shown;
    openButton.setAttribute('aria-expanded', String(shown));
  };

  updateEntry();
  if (displayMode?.addEventListener) displayMode.addEventListener('change', updateEntry);
  else if (displayMode?.addListener) displayMode.addListener(updateEntry);
  $('install-browser-note').hidden = !inApp;
  if (ios) {
    $('install-ios').classList.add('install-current');
    $('install-android').hidden = true;
  } else if (android) {
    $('install-android').classList.add('install-current');
    $('install-ios').hidden = true;
  }

  async function requestInstall() {
    if (!installPrompt || prompting) { setHelp(true); return; }
    prompting = true;
    $('install-now').disabled = true;
    const event = installPrompt;
    installPrompt = null;
    try {
      await event.prompt();
      const choice = await event.userChoice;
      status(choice?.outcome === 'accepted'
        ? '请按手机系统提示完成添加，然后从桌面的“重症刷题”图标打开。'
        : '暂未添加。你仍可继续答题，稍后也可通过浏览器菜单添加。');
    } catch {
      status('本次未能打开系统添加窗口，请按下方浏览器步骤操作。');
    } finally {
      prompting = false;
      $('install-native').hidden = true;
      $('install-now').disabled = false;
    }
  }

  openButton.addEventListener('click', () => {
    if (installPrompt) { setHelp(true); requestInstall(); }
    else setHelp(help.hidden);
  });
  $('install-now').addEventListener('click', requestInstall);
  $('install-close').addEventListener('click', () => { setHelp(false); openButton.focus(); });
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    if (standalone() || inApp) return;
    installPrompt = event;
    $('install-native').hidden = false;
  });
  window.addEventListener('appinstalled', () => {
    installPrompt = null;
    entry.hidden = true;
  });
  $('install-copy').addEventListener('click', async () => {
    const field = $('install-url');
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(field.value);
      status('链接已复制，可粘贴到手机浏览器中打开。');
    } catch {
      field.focus();
      field.select();
      field.setSelectionRange(0, field.value.length);
      status('请长按已选中的链接，选择“复制”。');
    }
  });

  const local = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || local)) {
    const register = () => navigator.serviceWorker.register('./sw.js', {updateViaCache:'none'}).then(registration => {
      const showUpdate = () => { if (registration.waiting && navigator.serviceWorker.controller) $('app-update-note').hidden = false; };
      showUpdate();
      registration.addEventListener('updatefound', () => {
        const worker = registration.installing;
        if (worker) worker.addEventListener('statechange', showUpdate);
      });
    }).catch(() => {});
    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register, {once:true});
  }
})();
