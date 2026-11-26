(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const els = {
    date: $('oracle-date'), reveal: $('reveal-oracle'), before: $('oracle-before'), reading: $('oracle-reading'),
    readingDate: $('reading-date'), mark: $('oracle-symbol-mark'), symbol: $('oracle-symbol'), energy: $('oracle-energy'),
    omen: $('oracle-omen'), mission: $('oracle-mission'), whisper: $('oracle-whisper'), feedback: $('oracle-feedback'),
    shareText: $('share-text'), sharePicture: $('share-picture'), downloadPicture: $('download-picture'),
    shareCard: document.querySelector('.oracle-share-card'), socialFeedback: $('oracle-social-feedback'),
    pictureDialog: $('oracle-picture-dialog'), picturePreview: $('oracle-picture-preview'),
    pictureDialogCopy: $('oracle-picture-dialog-copy'), pictureDialogNote: $('oracle-picture-dialog-note'),
    pictureDialogDownload: $('oracle-dialog-download'), pictureDialogCopyText: $('oracle-dialog-copy-text'),
    pictureDialogClose: $('oracle-dialog-close')
  };

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ORACLE_URL = 'https://wimfate.com/daily-oracle/';
  const SEED_KEY = 'whimfate.daily-oracle.seed.v1';
  let content = null;
  let currentReading = null;
  let currentDate = new Date();
  let busy = false;
  let hasRevealed = false;
  let shareImageBlob = null;
  let shareImageUrl = null;

  function secureToken() {
    const bytes = new Uint32Array(4);
    if (window.crypto && window.crypto.getRandomValues) {
      window.crypto.getRandomValues(bytes);
      return Array.from(bytes, (n) => n.toString(16).padStart(8, '0')).join('');
    }
    return `${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
  }

  function getSeed() {
    try {
      let seed = localStorage.getItem(SEED_KEY);
      if (!seed) {
        seed = secureToken();
        localStorage.setItem(SEED_KEY, seed);
      }
      return seed;
    } catch {
      try {
        let seed = sessionStorage.getItem(SEED_KEY);
        if (!seed) { seed = secureToken(); sessionStorage.setItem(SEED_KEY, seed); }
        return seed;
      } catch { return secureToken(); }
    }
  }

  function hash32(input) {
    let h = 2166136261;
    for (let i = 0; i < input.length; i++) {
      h ^= input.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    h += h << 13; h ^= h >>> 7; h += h << 3; h ^= h >>> 17; h += h << 5;
    return h >>> 0;
  }

  function gcd(a, b) {
    while (b) { const t = b; b = a % b; a = t; }
    return Math.abs(a);
  }

  function localDayOfYear(date) {
    const year = date.getFullYear();
    const today = Date.UTC(year, date.getMonth(), date.getDate());
    const first = Date.UTC(year, 0, 1);
    return Math.floor((today - first) / 86400000);
  }

  function getDailyIndex(seed, date, total) {
    const yearKey = `${seed}:${date.getFullYear()}:whimfate-oracle`;
    const day = localDayOfYear(date);
    let step = hash32(`${yearKey}:step`) % total;
    if (step === 0) step = 1;
    let attempts = 0;
    while (gcd(step, total) !== 1 && attempts < total) {
      step = (step + 1) % total;
      if (step === 0) step = 1;
      attempts++;
    }
    const offset = hash32(`${yearKey}:offset`) % total;
    return (step * day + offset) % total;
  }

  function catalogSize(db) {
    return db.symbols.length * db.energies.length * db.omens.length * db.missions.length * db.whispers.length;
  }

  function readingFromIndex(index, db) {
    const symbolIndex = index % db.symbols.length;
    index = Math.floor(index / db.symbols.length);
    const energyIndex = index % db.energies.length;
    index = Math.floor(index / db.energies.length);
    const omenIndex = index % db.omens.length;
    index = Math.floor(index / db.omens.length);
    const missionIndex = index % db.missions.length;
    index = Math.floor(index / db.missions.length);
    const whisperIndex = index % db.whispers.length;
    return {
      symbol: db.symbols[symbolIndex],
      energy: db.energies[energyIndex],
      omen: db.omens[omenIndex],
      mission: db.missions[missionIndex],
      whisper: db.whispers[whisperIndex]
    };
  }

  function formatDate(date) {
    return new Intl.DateTimeFormat(undefined, {
      weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
    }).format(date);
  }

  function buildReading() {
    const seed = getSeed();
    const index = getDailyIndex(seed, currentDate, catalogSize(content));
    const result = readingFromIndex(index, content);
    const dateISO = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(currentDate.getDate()).padStart(2, '0')}`;
    return { ...result, dateLabel: formatDate(currentDate), dateISO };
  }

  function setShareEnabled(enabled) {
    if (els.shareText) els.shareText.disabled = !enabled;
    if (els.sharePicture) els.sharePicture.disabled = !enabled || !shareImageBlob;
    if (els.downloadPicture) els.downloadPicture.disabled = !enabled;
  }

  async function prepareShareImage() {
    shareImageBlob = null;
    setShareEnabled(true);
    if (els.feedback) els.feedback.textContent = 'Preparing your Oracle card…';
    try {
      shareImageBlob = await createShareBlob();
      setShareEnabled(true);
      if (els.feedback) els.feedback.textContent = '';
    } catch (error) {
      setShareEnabled(true);
      if (els.feedback) els.feedback.textContent = error.message || 'The reading is ready, but the image could not be prepared.';
    }
  }

  function reveal() {
    if (busy || !currentReading || hasRevealed) return;
    busy = true;
    els.reveal.disabled = true;
    els.reveal.textContent = 'THE SYMBOLS ARE ARRANGING THEMSELVES…';
    els.feedback.textContent = 'Consulting the highly unofficial department of fate…';

    const finish = () => {
      els.before.hidden = true;
      els.reading.hidden = false;
      els.reading.classList.remove('is-revealing');
      void els.reading.offsetWidth;
      els.reading.classList.add('is-revealing');
      els.readingDate.textContent = currentReading.dateLabel;
      els.mark.textContent = currentReading.symbol.mark;
      els.symbol.textContent = currentReading.symbol.name;
      els.energy.textContent = `ENERGY · ${currentReading.energy}`;
      els.omen.textContent = currentReading.omen;
      els.mission.textContent = currentReading.mission;
      els.whisper.textContent = currentReading.whisper;
      hasRevealed = true;
      setShareEnabled(true);
      prepareShareImage();
      busy = false;
      els.feedback.textContent = '';
      els.socialFeedback.textContent = 'Your reading is ready. Choose a network to send the omen along.';
    };

    if (reducedMotion) finish();
    else window.setTimeout(finish, 620);
  }

  function readingText() {
    if (!currentReading || !hasRevealed) {
      return 'The Whimfate Daily Oracle has a little message for today. Reveal your own reading.';
    }
    return `WHIMFATE · THE DAILY ORACLE\n${currentReading.dateLabel}\n${currentReading.symbol.name} · ${currentReading.energy}\n\n${currentReading.omen}\n\nA TINY MISSION\n${currentReading.mission}\n\n${currentReading.whisper}`;
  }

  function roundedRect(ctx, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + width, y, x + width, y + height, r);
    ctx.arcTo(x + width, y + height, x, y + height, r);
    ctx.arcTo(x, y + height, x, y, r);
    ctx.arcTo(x, y, x + width, y, r);
    ctx.closePath();
  }

  function drawWrappedText(ctx, text, centerX, startY, maxWidth, lineHeight, maxLines) {
    const words = String(text).trim().split(/\s+/).filter(Boolean);
    const lines = [];
    let line = '';
    let consumed = 0;

    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width <= maxWidth || !line) {
        line = test;
        consumed++;
      } else {
        lines.push(line);
        if (lines.length >= maxLines) break;
        line = word;
        consumed++;
      }
    }
    if (line && lines.length < maxLines) lines.push(line);

    const truncated = consumed < words.length;
    if (truncated && lines.length) {
      let last = lines[lines.length - 1];
      while (last && ctx.measureText(`${last}…`).width > maxWidth) last = last.slice(0, -1);
      lines[lines.length - 1] = `${last.trimEnd()}…`;
    }

    lines.forEach((value, index) => ctx.fillText(value, centerX, startY + index * lineHeight, maxWidth));
    return startY + lines.length * lineHeight;
  }

  function drawPill(ctx, text, centerX, centerY, font) {
    ctx.font = font;
    const width = Math.min(1010, Math.max(270, ctx.measureText(text).width + 54));
    const height = 58;
    roundedRect(ctx, centerX - width / 2, centerY - height / 2, width, height, 29);
    ctx.fillStyle = 'rgba(11, 26, 19, .9)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(139, 233, 199, .5)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#a4ebca';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, centerX, centerY + 1);
  }

  async function createShareBlob() {
    if (!currentReading || !hasRevealed) throw new Error('Reveal the Oracle first.');
    if (document.fonts && document.fonts.ready) await document.fonts.ready;

    const canvas = document.createElement('canvas');
    canvas.width = 1200;
    canvas.height = 1600;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas is unavailable in this browser.');

    const W = canvas.width;
    const H = canvas.height;
    const cx = W / 2;
    ctx.fillStyle = '#050506';
    ctx.fillRect(0, 0, W, H);

    const violet = ctx.createRadialGradient(590, 370, 15, 590, 370, 700);
    violet.addColorStop(0, 'rgba(137, 83, 190, .30)');
    violet.addColorStop(.52, 'rgba(91, 52, 126, .12)');
    violet.addColorStop(1, 'rgba(5, 5, 6, 0)');
    ctx.fillStyle = violet;
    ctx.fillRect(0, 0, W, H);

    const mint = ctx.createRadialGradient(1060, 1250, 8, 1060, 1250, 480);
    mint.addColorStop(0, 'rgba(70, 177, 132, .15)');
    mint.addColorStop(1, 'rgba(5, 5, 6, 0)');
    ctx.fillStyle = mint;
    ctx.fillRect(0, 0, W, H);

    ctx.strokeStyle = '#463252';
    ctx.lineWidth = 2;
    roundedRect(ctx, 42, 42, W - 84, H - 84, 24);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(192, 164, 222, .20)';
    roundedRect(ctx, 56, 56, W - 112, H - 112, 17);
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#f6f1fa';
    ctx.font = '800 34px Manrope, sans-serif';
    ctx.letterSpacing = '7px';
    ctx.fillText('WHIMFATE', cx, 126);
    ctx.fillStyle = '#c6a9ec';
    ctx.font = '800 20px Manrope, sans-serif';
    ctx.letterSpacing = '6px';
    ctx.fillText('THE DAILY ORACLE', cx, 177);
    ctx.fillStyle = '#a99eb4';
    ctx.font = '500 22px Manrope, sans-serif';
    ctx.letterSpacing = '0px';
    ctx.fillText(currentReading.dateLabel.toUpperCase(), cx, 225);

    // Symbol medallion.
    const medallionY = 388;
    const aura = ctx.createRadialGradient(cx, medallionY, 20, cx, medallionY, 205);
    aura.addColorStop(0, 'rgba(188, 145, 245, .26)');
    aura.addColorStop(1, 'rgba(188, 145, 245, 0)');
    ctx.fillStyle = aura;
    ctx.beginPath(); ctx.arc(cx, medallionY, 205, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx, medallionY, 128, 0, Math.PI * 2);
    ctx.strokeStyle = '#8864ad'; ctx.lineWidth = 2; ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, medallionY, 111, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(207, 183, 231, .55)'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = '#e6d5ff';
    ctx.font = '400 104px Berkshire Swash, serif';
    ctx.letterSpacing = '0px';
    ctx.textBaseline = 'middle';
    ctx.fillText(currentReading.symbol.mark, cx, medallionY + 2);

    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#bda5d8';
    ctx.font = '800 18px Manrope, sans-serif';
    ctx.letterSpacing = '5px';
    ctx.fillText('YOUR SYMBOL', cx, 555);
    ctx.fillStyle = '#fff';
    ctx.font = '400 64px Berkshire Swash, serif';
    ctx.letterSpacing = '0px';
    ctx.fillText(currentReading.symbol.name, cx, 625, 1030);
    drawPill(ctx, `ENERGY · ${currentReading.energy.toUpperCase()}`, cx, 690, '800 19px Manrope, sans-serif');

    // Main omen card.
    roundedRect(ctx, 94, 748, 1012, 278, 18);
    ctx.fillStyle = 'rgba(18, 13, 24, .92)';
    ctx.fill();
    ctx.strokeStyle = '#463451';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#a98acb';
    ctx.font = '800 17px Manrope, sans-serif';
    ctx.letterSpacing = '5px';
    ctx.fillText('THE OMEN', cx, 800);
    ctx.fillStyle = '#f5effa';
    ctx.font = '400 43px Berkshire Swash, serif';
    ctx.letterSpacing = '0px';
    ctx.textBaseline = 'top';
    drawWrappedText(ctx, currentReading.omen, cx, 843, 880, 58, 3);

    // Tiny mission card.
    roundedRect(ctx, 94, 1050, 1012, 220, 16);
    ctx.fillStyle = 'rgba(10, 22, 16, .94)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(117, 204, 158, .45)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#9ce7c4';
    ctx.font = '800 18px Manrope, sans-serif';
    ctx.letterSpacing = '5px';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('A TINY MISSION', cx, 1100);
    ctx.fillStyle = '#e7f0e9';
    ctx.font = '500 29px Manrope, sans-serif';
    ctx.textBaseline = 'top';
    drawWrappedText(ctx, currentReading.mission, cx, 1138, 890, 43, 3);

    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#c6a9e5';
    ctx.font = 'italic 23px Manrope, sans-serif';
    ctx.letterSpacing = '0px';
    drawWrappedText(ctx, currentReading.whisper, cx, 1330, 940, 34, 2);
    ctx.fillStyle = '#a79bac';
    ctx.font = '800 17px Manrope, sans-serif';
    ctx.letterSpacing = '4px';
    ctx.fillText('WHIMFATE.COM', cx, 1460);
    ctx.fillStyle = '#716779';
    ctx.font = '500 14px Manrope, sans-serif';
    ctx.letterSpacing = '1px';
    ctx.fillText('A LITTLE SIGN. A VERY HUMAN DAY.', cx, 1491);

    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Could not create the Oracle card.')), 'image/png');
    });
  }

  async function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
    const area = document.createElement('textarea');
    area.value = text;
    area.readOnly = true;
    area.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
    document.body.append(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    if (!ok) throw new Error('Copy failed in this browser.');
  }

  function scrollToShareCard() {
    if (!els.shareCard) return;
    els.shareCard.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'center' });
  }

  async function shareText() {
    if (!currentReading || !hasRevealed) return;
    const text = readingText();
    const textWithLink = `${text}\n\n${ORACLE_URL}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Whimfate Daily Oracle', text, url: ORACLE_URL });
        els.feedback.textContent = 'The omen has left the building.';
      } else {
        await copyText(textWithLink);
        els.feedback.textContent = 'Reading copied. Choose a network below to share the reading and Oracle link.';
        scrollToShareCard();
      }
    } catch (error) {
      if (error && error.name === 'AbortError') return;
      try {
        await copyText(textWithLink);
        els.feedback.textContent = 'Reading copied. Choose a network below to share the reading and Oracle link.';
        scrollToShareCard();
      } catch {
        els.feedback.textContent = 'Could not share automatically. Choose a network below to share the reading and Oracle link, or copy the reading manually.';
        scrollToShareCard();
      }
    }
  }

  function createOracleFile(blob) {
    if (typeof File === 'undefined') return null;
    return new File([blob], 'whimfate-daily-oracle.png', { type: 'image/png', lastModified: Date.now() });
  }

  function openPictureFallback(blob, reason = '') {
    if (!els.pictureDialog || !els.picturePreview) {
      els.feedback.textContent = 'Direct image sharing is unavailable here. Download the PNG and attach it in your chosen app.';
      return;
    }
    if (shareImageUrl) URL.revokeObjectURL(shareImageUrl);
    shareImageUrl = URL.createObjectURL(blob);
    els.picturePreview.src = shareImageUrl;
    els.pictureDialogCopy.textContent = 'This browser cannot hand a local image directly to another app. Download the PNG, then attach it in WhatsApp, Telegram, Discord or wherever the omen needs to go.';
    els.pictureDialogNote.textContent = reason || 'The image is ready to save and attach in your chosen app.';
    if (!els.pictureDialog.open) {
      if (typeof els.pictureDialog.showModal === 'function') els.pictureDialog.showModal();
      else els.pictureDialog.setAttribute('open', '');
    }
  }

  function closePictureFallback() {
    if (!els.pictureDialog) return;
    if (typeof els.pictureDialog.close === 'function' && els.pictureDialog.open) els.pictureDialog.close();
    else els.pictureDialog.removeAttribute('open');
    if (shareImageUrl) {
      URL.revokeObjectURL(shareImageUrl);
      shareImageUrl = null;
      if (els.picturePreview) els.picturePreview.removeAttribute('src');
    }
  }

  function sharePicture() {
    if (!currentReading || !hasRevealed || !shareImageBlob) return;
    const file = createOracleFile(shareImageBlob);
    const canShareFile = file && typeof navigator.share === 'function' &&
      typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] });

    if (!canShareFile) {
      openPictureFallback(shareImageBlob);
      return;
    }

    // Called directly from the user's click so the native file share sheet keeps user activation.
    let sharePromise;
    try {
      sharePromise = navigator.share({
        title: 'Whimfate Daily Oracle',
        text: `${currentReading.symbol.name}: ${currentReading.omen}\n${ORACLE_URL}`,
        files: [file]
      });
    } catch (error) {
      openPictureFallback(shareImageBlob, error.message || 'Your device could not open its image-sharing menu.');
      return;
    }
    Promise.resolve(sharePromise).then(() => {
      els.feedback.textContent = 'The Oracle card has been dispatched.';
    }).catch((error) => {
      if (error && error.name === 'AbortError') return;
      openPictureFallback(shareImageBlob, 'Your device could not complete direct image sharing. Download the card and attach it manually.');
    });
  }

  async function downloadPicture() {
    if (!currentReading || !hasRevealed) return;
    try {
      const blob = shareImageBlob || await createShareBlob();
      shareImageBlob = blob;
      setShareEnabled(true);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'whimfate-daily-oracle.png';
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1500);
      if (els.feedback) els.feedback.textContent = 'Your Oracle card is ready. Go confuse the group chat.';
      if (els.pictureDialog && els.pictureDialog.open) closePictureFallback();
    } catch (error) {
      els.feedback.textContent = error.message || 'Could not create the image.';
    }
  }

  async function shareTo(platform) {
    const text = readingText();
    const url = ORACLE_URL;
    const encodedText = encodeURIComponent(text);
    const encodedUrl = encodeURIComponent(url);
    const fullText = `${text}\n\n${url}`;
    const destinations = {
      whatsapp: `https://wa.me/?text=${encodeURIComponent(fullText)}`,
      telegram: `https://t.me/share/url?url=${encodedUrl}&text=${encodedText}`,
      x: `https://twitter.com/intent/tweet?text=${encodedText}&url=${encodedUrl}`,
      reddit: `https://www.reddit.com/submit?url=${encodedUrl}&title=${encodeURIComponent(hasRevealed ? `Daily Oracle — ${currentReading.symbol.name}: ${currentReading.omen}` : 'Whimfate Daily Oracle')}`,
      facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}&quote=${encodedText}`
    };

    if (platform === 'copy-link') {
      try {
        await copyText(url);
        els.socialFeedback.textContent = 'Link copied. Your friend may now consult the questionable cosmos.';
      } catch {
        els.socialFeedback.textContent = `Copy this link: ${url}`;
      }
      return;
    }

    if (platform === 'discord') {
      const discordWindow = window.open('https://discord.com/app', '_blank', 'noopener,noreferrer');
      try {
        await copyText(fullText);
        els.socialFeedback.textContent = 'Reading copied. Paste it into Discord. Use Share picture above for direct image sharing where supported, or download the PNG and attach it.';
      } catch {
        els.socialFeedback.textContent = 'Could not copy automatically. Use Share text or copy the reading manually, then paste it into Discord.';
      }
      if (discordWindow) discordWindow.opener = null;
      return;
    }

    if (destinations[platform]) {
      window.open(destinations[platform], '_blank', 'noopener,noreferrer,width=760,height=660');
      els.socialFeedback.textContent = hasRevealed
        ? 'Share window opened with the reading and Oracle link. Use Share picture above to send the actual image where your device supports it.'
        : 'Share window opened. Invite your friends to reveal their own daily reading.';
    }
  }

  function attachSocialActions() {
    document.querySelectorAll('.wf-share-social-link[data-share]').forEach((button) => {
      button.addEventListener('click', () => shareTo(button.dataset.share));
    });
  }

  async function init() {
    try {
      const response = await fetch('oracle-content.json', { cache: 'force-cache' });
      if (!response.ok) throw new Error(`Oracle content could not be loaded (${response.status}).`);
      content = await response.json();
      const arrays = ['symbols', 'energies', 'omens', 'missions', 'whispers'];
      if (arrays.some((key) => !Array.isArray(content[key]) || !content[key].length)) {
        throw new Error('Oracle content is incomplete.');
      }
      currentDate = new Date();
      els.date.textContent = formatDate(currentDate);
      currentReading = buildReading();
      els.reveal.addEventListener('click', reveal);
      els.shareText.addEventListener('click', shareText);
      els.sharePicture.addEventListener('click', sharePicture);
      els.downloadPicture.addEventListener('click', downloadPicture);
      if (els.pictureDialogDownload) els.pictureDialogDownload.addEventListener('click', downloadPicture);
      if (els.pictureDialogCopyText) els.pictureDialogCopyText.addEventListener('click', async () => {
        try {
          await copyText(readingText());
          els.pictureDialogNote.textContent = 'Reading text copied. The PNG is still ready to download.';
        } catch {
          els.pictureDialogNote.textContent = 'Could not copy the reading in this browser.';
        }
      });
      if (els.pictureDialogClose) els.pictureDialogClose.addEventListener('click', closePictureFallback);
      if (els.pictureDialog) els.pictureDialog.addEventListener('click', (event) => {
        if (event.target === els.pictureDialog) closePictureFallback();
      });
      if (els.pictureDialog) els.pictureDialog.addEventListener('close', () => {
        if (shareImageUrl) {
          URL.revokeObjectURL(shareImageUrl);
          shareImageUrl = null;
          if (els.picturePreview) els.picturePreview.removeAttribute('src');
        }
      });
      setShareEnabled(false);
      attachSocialActions();
    } catch (error) {
      els.reveal.disabled = true;
      els.reveal.textContent = 'THE ORACLE IS TEMPORARILY UNAVAILABLE';
      els.feedback.textContent = error.message || 'Please refresh and try again.';
      attachSocialActions();
    }
  }

  init();
})();
