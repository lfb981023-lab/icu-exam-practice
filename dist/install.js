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
    const release = $('app-release').textContent.trim();
    const checkButton = $('check-update');
    const applyButton = $('apply-update');
    const updateStatus = message => {
      $('update-status').textContent = message;
      $('update-status').hidden = !message;
    };
    let registrationPromise, checking = false, lastCheck = 0, newerReady = false;
    const register = () => registrationPromise ||= navigator.serviceWorker.register('./sw.js', {updateViaCache:'none'}).catch(error => {
      registrationPromise = null;
      throw error;
    });
    const workerVersion = worker => new Promise(resolve => {
      if (!worker) { resolve(null); return; }
      const channel = new MessageChannel();
      const finish = value => { clearTimeout(timer); channel.port1.close(); resolve(value); };
      const timer = setTimeout(() => finish(null), 3000);
      channel.port1.onmessage = event => finish(event.data?.release || null);
      try { worker.postMessage({type:'GET_APP_VERSION'}, [channel.port2]); }
      catch { finish(null); }
    });
    const waitForActivation = worker => new Promise((resolve, reject) => {
      const finish = error => {
        clearTimeout(timer); worker.removeEventListener('statechange', changed);
        if (error) reject(error); else resolve();
      };
      const changed = () => {
        if (worker.state === 'activated') finish();
        else if (worker.state === 'redundant') finish(new Error('Update incomplete'));
      };
      const timer = setTimeout(() => finish(new Error('Update timed out')), 65000);
      worker.addEventListener('statechange', changed); changed();
    });
    async function showReady(registration, manual = false) {
      const activeRelease = await workerVersion(registration.active);
      if (activeRelease && activeRelease !== release) {
        newerReady = true; applyButton.hidden = false;
        updateStatus('新版题库已准备好。先完成当前题目，再点“更新并重新打开”；已提交的答题记录会保留。');
      } else if (activeRelease === release && !newerReady && manual) {
        updateStatus('当前已是最新版本：1000道考点专项模拟，622道历年题均有解答分析。');
      } else if (!activeRelease && manual && !newerReady) {
        updateStatus('暂时无法确认更新状态，请保持联网后重试。');
      }
    }
    async function checkUpdate(manual = false) {
      if (checking || (!manual && Date.now() - lastCheck < 60000)) return;
      if (!navigator.onLine) {
        if (manual) updateStatus('当前离线，暂时无法检查更新。已下载的题目仍可练习，请联网后再试。');
        return;
      }
      checking = true; lastCheck = Date.now(); checkButton.disabled = true;
      if (manual) updateStatus('正在检查并下载更新，请保持联网…');
      try {
        const registration = await register();
        await registration.update();
        const worker = registration.installing || registration.waiting;
        if (worker) await waitForActivation(worker);
        await showReady(registration, manual);
      } catch {
        if (manual) updateStatus('本次更新未完成，现有题库和记录仍保留。请保持联网，稍后再试。');
      } finally { checking = false; checkButton.disabled = false; }
    }
    checkButton.addEventListener('click', () => checkUpdate(true));
    applyButton.addEventListener('click', () => {
      if (newerReady && window.confirm('更新会保留已提交的答题记录；当前题目尚未提交的选项会取消。现在重新打开吗？')) location.reload();
    });
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      // Never reload here: a learner may be choosing a multiple-choice answer.
      register().then(registration => showReady(registration)).catch(() => {});
    });
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') checkUpdate(); });
    window.addEventListener('online', () => { lastCheck = 0; checkUpdate(); });
    window.addEventListener('pageshow', () => checkUpdate());
    checkUpdate();
  } else {
    $('check-update').addEventListener('click', () => {
      $('update-status').hidden = false;
      $('update-status').textContent = '当前浏览器不支持离线更新，请保持联网并重新打开题库。';
    });
  }
})();
