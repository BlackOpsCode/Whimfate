/* Whimfate Wheel of Names — browser-side picker and shareable result cards. */
(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const entriesInput = $('entries-input');
  const entryCount = $('entry-count');
  const entriesCount = $('entries-count');
  const validation = $('validation-message');
  const exampleButton = $('example-button');
  const clearButton = $('clear-button');
  const removeWinnerInput = $('remove-winner');
  const wheelCanvas = $('wheel-canvas');
  const wheelContext = wheelCanvas.getContext('2d');
  const wheelStatus = $('wheel-status');
  const wheelHint = $('wheel-hint');
  const spinButton = $('spin-button');
  const wheelHubButton = $('wheel-hub-spin');
  const spinButtonLabel = $('spin-button-label');
  const resultSection = $('result-section');
  const resultTitle = $('result-title');
  const resultLine = $('result-line');
  const spinCount = $('spin-count');
  const feedback = $('result-feedback');
  const historyList = $('spin-history');
  const clearHistoryButton = $('clear-history-button');
  const shareTextButton = $('share-text-button');
  const sharePictureButton = $('share-picture-button');
  const downloadImageButton = $('download-image-button');
  const socialFeedback = $('social-feedback');
  const sharePictureDialog = $('share-picture-dialog');
  const sharePicturePreview = $('share-picture-preview');
  const shareImageDeviceButton = $('share-image-device');
  const downloadImageDialogButton = $('download-image-dialog');
  const closeShareDialogButton = $('close-share-dialog');
  const openSocialOptionsButton = $('open-social-options');
  const shareDialogFeedback = $('share-dialog-feedback');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const PAGE_URL = 'https://whimfate.com/wheel-of-names/';
  const MAX_ENTRIES = 80;
  const TAU = Math.PI * 2;

  const exampleEntries = [
    'Alex', 'Sam', 'Jordan', 'Riley', 'Casey', 'Jamie',
    'Taylor', 'Morgan', 'Avery', 'Cameron', 'Drew', 'Quinn'
  ];
  const verdicts = [
    'The wheel has spoken. The group chat may proceed.',
    'Fate has selected. Please do not appeal to management.',
    'A decision has been made. Nobody remembers who asked.',
    'The universe picked a name and left without explaining.',
    'The wheel accepts no lobbying at this time.',
    'One name rose. Several eyebrows followed.',
    'The odds have done their little dance.',
    'The spinning stopped. The consequences begin.',
    'A winner has emerged from the circular paperwork.',
    'The wheel made a choice. It seems quite comfortable with it.',
    'The committee has been replaced by a circle.',
    'No favoritism detected. Mild suspicion remains.'
  ];

  const palette = [
    { light: '#eadfff', mid: '#b98df2', dark: '#7045a0', text: '#1b1028' },
    { light: '#caffeb', mid: '#76dcb7', dark: '#327b60', text: '#08251a' },
    { light: '#b99ae1', mid: '#8055ae', dark: '#44265f', text: '#fffaff' },
    { light: '#a9f3d4', mid: '#4ca982', dark: '#205d46', text: '#041b12' },
    { light: '#e1caff', mid: '#9b72cb', dark: '#57347c', text: '#170d22' },
    { light: '#9de6c8', mid: '#438d70', dark: '#1a4938', text: '#f1fff8' }
  ];

  let entries = [];
  let rotation = 0;
  let spinning = false;
  let spinNumber = 0;
  let lastResult = null;
  let history = [];
  let lastVerdictIndex = -1;
  let canvasWidth = 640;
  let canvasHeight = 640;
  let pixelRatio = 1;
  let animationFrame = 0;
  let revealTimer = 0;
  let currentShareBlob = null;
  let currentShareFile = null;
  let currentShareObjectUrl = '';

  function randomUint32() {
    if (window.crypto && typeof window.crypto.getRandomValues === 'function') {
      const buffer = new Uint32Array(1);
      window.crypto.getRandomValues(buffer);
      return buffer[0];
    }
    return Math.floor(Math.random() * 0x100000000) >>> 0;
  }

  // Uniform integer sampling: reject the incomplete tail of the 32-bit range.
  function randomInt(maxExclusive) {
    if (!Number.isSafeInteger(maxExclusive) || maxExclusive < 1 || maxExclusive > 0x100000000) {
      throw new RangeError('The requested random range is not supported.');
    }
    if (maxExclusive === 1) return 0;
    const range = 0x100000000;
    const limit = range - (range % maxExclusive);
    let value;
    do { value = randomUint32(); } while (value >= limit);
    return value % maxExclusive;
  }

  function pickVerdict() {
    if (verdicts.length < 2) return verdicts[0] || 'The wheel has spoken.';
    let next = randomInt(verdicts.length);
    if (next === lastVerdictIndex) next = (next + 1 + randomInt(verdicts.length - 1)) % verdicts.length;
    lastVerdictIndex = next;
    return verdicts[next];
  }

  function readEntries() {
    return entriesInput.value
      .split(/\r?\n/)
      .map((entry) => entry.trim())
      .filter(Boolean)
      .slice(0, MAX_ENTRIES);
  }

  function setValidation(message, isError = false) {
    validation.textContent = message;
    validation.classList.toggle('is-error', isError);
  }

  function setFeedback(message) {
    feedback.textContent = message;
  }

  function clearCurrentResult() {
    resultSection.hidden = true;
    resultTitle.textContent = '—';
    resultLine.textContent = '';
    lastResult = null;
    setFeedback('');
  }

  function updateState({ clearResult = true } = {}) {
    entries = readEntries();
    const rawCount = entriesInput.value.split(/\r?\n/).filter((entry) => entry.trim()).length;
    entryCount.textContent = `${entries.length} ${entries.length === 1 ? 'entry' : 'entries'}`;
    entriesCount.textContent = `${Math.min(rawCount, MAX_ENTRIES)} / ${MAX_ENTRIES}`;
    entriesInput.setAttribute('aria-invalid', String(rawCount > MAX_ENTRIES));

    if (rawCount > MAX_ENTRIES) {
      setValidation(`This wheel supports up to ${MAX_ENTRIES} entries. Remove ${rawCount - MAX_ENTRIES} to continue.`, true);
    } else if (entries.length < 2) {
      setValidation('Add at least two entries to get started.');
    } else {
      setValidation('Every line is one entry. Repeated lines count as separate slices.');
    }

    const valid = entries.length >= 2 && rawCount <= MAX_ENTRIES;
    spinButton.disabled = spinning || !valid;
    wheelHubButton.disabled = spinning || !valid;
    wheelHubButton.setAttribute('aria-label', spinning ? 'Wheel is spinning' : 'Spin the wheel');
    entriesInput.disabled = spinning;
    exampleButton.disabled = spinning;
    clearButton.disabled = spinning || !entriesInput.value;
    removeWinnerInput.disabled = spinning;
    spinButtonLabel.textContent = entries.length > 1 ? 'SPIN THE WHEEL' : 'ADD MORE ENTRIES';
    if (!spinning) {
      wheelStatus.textContent = valid ? 'READY' : 'WAITING';
      wheelStatus.classList.remove('is-spinning');
    }
    wheelHint.textContent = valid
      ? `${entries.length} entries on the wheel. One spin will choose one.`
      : 'The wheel is waiting for at least two entries.';

    if (clearResult) clearCurrentResult();
    drawWheel(wheelContext, canvasWidth, rotation, entries, -1);
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

  function shortenWheelWord(ctx, word, maxWidth) {
    if (ctx.measureText(word).width <= maxWidth) return word;
    let clipped = word;
    while (clipped.length > 2 && ctx.measureText(`${clipped}…`).width > maxWidth) {
      clipped = clipped.slice(0, -1);
    }
    return `${clipped}…`;
  }

  function wrapWheelLabel(ctx, label, maxWidth, maxLines = 2) {
    const words = String(label).trim().split(/\s+/).filter(Boolean);
    if (!words.length) return [''];
    const lines = [];
    let line = '';
    let truncated = false;

    for (let index = 0; index < words.length; index += 1) {
      const safeWord = shortenWheelWord(ctx, words[index], maxWidth);
      if (safeWord !== words[index]) truncated = true;
      const candidate = line ? `${line} ${safeWord}` : safeWord;
      if (ctx.measureText(candidate).width <= maxWidth) {
        line = candidate;
        continue;
      }

      if (line) lines.push(line);
      line = safeWord;
      if (lines.length >= maxLines - 1 && index < words.length - 1) {
        truncated = true;
        break;
      }
    }

    if (line && lines.length < maxLines) lines.push(line);
    if (truncated && lines.length) {
      const lastIndex = lines.length - 1;
      const last = lines[lastIndex].replace(/…$/, '');
      lines[lastIndex] = `${shortenWheelWord(ctx, last, maxWidth).replace(/…$/, '')}…`;
    }
    return lines;
  }

  function drawWheel(ctx, size, angle, list, highlightIndex = -1) {
    if (!ctx) return;
    const cx = size / 2;
    const cy = size / 2;
    const radius = size * .455;
    ctx.clearRect(0, 0, size, size);
    if (!list.length) {
      const empty = ctx.createRadialGradient(cx, cy, radius * .1, cx, cy, radius);
      empty.addColorStop(0, '#17121e');
      empty.addColorStop(1, '#050506');
      ctx.beginPath(); ctx.arc(cx, cy, radius, 0, TAU); ctx.fillStyle = empty; ctx.fill();
      ctx.strokeStyle = '#49365d'; ctx.lineWidth = size * .012; ctx.stroke();
      // Keep the empty wheel quiet: the central W remains the visual focal point.
      // Entry guidance is already shown in the controls, so no canvas placeholder is needed.
      return;
    }

    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,.62)';
    ctx.shadowBlur = size * .035;
    ctx.beginPath(); ctx.arc(cx, cy, radius + size * .018, 0, TAU);
    const rim = ctx.createLinearGradient(cx - radius, cy - radius, cx + radius, cy + radius);
    rim.addColorStop(0, '#efe2ff'); rim.addColorStop(.22, '#8059a8'); rim.addColorStop(.5, '#251833'); rim.addColorStop(.78, '#8be9c7'); rim.addColorStop(1, '#2b1d38');
    ctx.fillStyle = rim; ctx.fill();
    ctx.restore();

    const slice = TAU / list.length;
    const startBase = -Math.PI / 2 + angle;
    list.forEach((entry, index) => {
      const start = startBase + index * slice;
      const end = start + slice;
      const tone = palette[index % palette.length];
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, radius, start, end); ctx.closePath();
      const grad = ctx.createRadialGradient(cx - radius * .2, cy - radius * .24, radius * .08, cx, cy, radius);
      grad.addColorStop(0, tone.light); grad.addColorStop(.54, tone.mid); grad.addColorStop(1, tone.dark);
      ctx.fillStyle = grad; ctx.fill();
      ctx.strokeStyle = 'rgba(5,4,8,.6)'; ctx.lineWidth = Math.max(1, size * .0028); ctx.stroke();

      if (list.length <= 48) {
        const middle = start + slice / 2;
        const flipped = Math.cos(middle) < 0;
        const labelRadius = radius * .66;
        const tangentSpace = 2 * labelRadius * Math.sin(Math.min(slice * .43, Math.PI / 2));
        const fontSize = Math.max(size * .0115, Math.min(size * .032, tangentSpace * .36));
        const maxTextWidth = radius * .42;

        ctx.save();
        // Place each label at the centre of its slice, safely outside the W hub.
        // Radial alignment follows the wheel while the text stays upright on the left half.
        ctx.translate(cx + Math.cos(middle) * labelRadius, cy + Math.sin(middle) * labelRadius);
        ctx.rotate(middle + (flipped ? Math.PI : 0));
        ctx.font = `800 ${fontSize}px Manrope, sans-serif`;
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'center';
        const maxLines = Math.max(2, Math.min(3, Math.floor(tangentSpace / (fontSize * 1.12))));
        const lines = wrapWheelLabel(ctx, entry, maxTextWidth, maxLines);
        const lineHeight = fontSize * 1.08;
        const startY = -((lines.length - 1) * lineHeight) / 2;
        ctx.fillStyle = tone.text;
        ctx.shadowColor = 'rgba(255,255,255,.10)'; ctx.shadowBlur = size * .002;
        lines.forEach((line, lineIndex) => {
          ctx.fillText(line, 0, startY + lineIndex * lineHeight, maxTextWidth);
        });
        ctx.restore();
      } else {
        const middle = start + slice / 2;
        const markerRadius = radius * .73;
        const mx = cx + Math.cos(middle) * markerRadius;
        const my = cy + Math.sin(middle) * markerRadius;
        ctx.beginPath(); ctx.arc(mx, my, size * .012, 0, TAU);
        ctx.fillStyle = tone.text; ctx.fill();
      }

      if (index === highlightIndex) {
        // A soft slice wash marks the winner without the chunky inner arc from the old UI.
        ctx.save();
        ctx.globalAlpha = .13;
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, radius * .985, start, end); ctx.closePath();
        ctx.fillStyle = '#fff'; ctx.fill();
        ctx.restore();
      }
    });

    ctx.beginPath(); ctx.arc(cx, cy, radius, 0, TAU);
    ctx.strokeStyle = 'rgba(245,233,255,.72)'; ctx.lineWidth = Math.max(1.5, size * .0045); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, radius * .19, 0, TAU);
    const hub = ctx.createRadialGradient(cx - radius * .07, cy - radius * .08, radius * .01, cx, cy, radius * .2);
    hub.addColorStop(0, '#4b385e'); hub.addColorStop(.6, '#17111f'); hub.addColorStop(1, '#050506');
    ctx.fillStyle = hub; ctx.fill();
    ctx.strokeStyle = 'rgba(225,208,255,.72)'; ctx.lineWidth = Math.max(1.5, size * .004); ctx.stroke();
    ctx.fillStyle = '#d6c1ff'; ctx.font = `400 ${size * .078}px Berkshire Swash, Georgia, serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('W', cx, cy + size * .004);
  }

  function resizeWheel() {
    const rect = wheelCanvas.getBoundingClientRect();
    const width = Math.max(1, rect.width || 480);
    const height = Math.max(1, rect.height || width);
    canvasWidth = width;
    canvasHeight = height;
    pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    const backingWidth = Math.max(1, Math.round(width * pixelRatio));
    const backingHeight = Math.max(1, Math.round(height * pixelRatio));
    if (wheelCanvas.width !== backingWidth) wheelCanvas.width = backingWidth;
    if (wheelCanvas.height !== backingHeight) wheelCanvas.height = backingHeight;
    wheelContext.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    drawWheel(wheelContext, width, rotation, entries, lastResult ? lastResult.index : -1);
  }

  function getShareText() {
    if (!lastResult) return `Spin the Wheel of Names on whimfate.com. Add your list and let the wheel pick.\n${PAGE_URL}`;
    return `THE WHEEL HAS SPOKEN\n${lastResult.winner}\n${lastResult.verdict}\nSpin your own: ${PAGE_URL}`;
  }

  async function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
    const area = document.createElement('textarea');
    area.value = text; area.readOnly = true;
    area.style.cssText = 'position:fixed;left:-9999px;top:0';
    document.body.append(area); area.select();
    const copied = document.execCommand('copy'); area.remove();
    if (!copied) throw new Error('Copy is not available in this browser.');
  }

  function shareDataForImage() {
    if (!lastResult) throw new Error('Spin the wheel first.');
    return lastResult;
  }

  async function createResultImageBlob() {
    const result = shareDataForImage();
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Image export is not available in this browser.');
    const width = 1200;
    const height = 1500;
    canvas.width = width; canvas.height = height;

    ctx.fillStyle = '#050506'; ctx.fillRect(0, 0, width, height);
    const violetGlow = ctx.createRadialGradient(170, 80, 5, 170, 80, 640);
    violetGlow.addColorStop(0, 'rgba(151,104,210,.26)'); violetGlow.addColorStop(1, 'rgba(5,5,6,0)');
    ctx.fillStyle = violetGlow; ctx.fillRect(0, 0, width, 750);
    const greenGlow = ctx.createRadialGradient(1100, 1180, 10, 1100, 1180, 540);
    greenGlow.addColorStop(0, 'rgba(82,179,139,.14)'); greenGlow.addColorStop(1, 'rgba(5,5,6,0)');
    ctx.fillStyle = greenGlow; ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = '#8be9c7'; ctx.font = '800 21px Manrope, sans-serif'; ctx.letterSpacing = '3px';
    ctx.fillText('WHIMFATE  /  WHEEL OF NAMES', 74, 92);
    ctx.fillStyle = '#f8f4fb'; ctx.font = '68px "Berkshire Swash", Georgia, serif'; ctx.letterSpacing = '0px';
    ctx.fillText('The wheel has spoken.', 74, 181);
    ctx.fillStyle = '#c9c0d2'; ctx.font = '24px Manrope, sans-serif';
    ctx.fillText(`${result.entryCount} entries went into the wheel. One name came out.`, 74, 226);

    const wheelImage = document.createElement('canvas');
    wheelImage.width = 700; wheelImage.height = 700;
    const wheelImageContext = wheelImage.getContext('2d');
    drawWheel(wheelImageContext, 700, result.rotation, result.entries, result.index);
    ctx.drawImage(wheelImage, 250, 260, 700, 700);

    roundedRect(ctx, 74, 1010, 1052, 285, 8);
    ctx.fillStyle = '#0b0910'; ctx.fill(); ctx.strokeStyle = '#47365b'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#8be9c7'; ctx.font = '800 19px Manrope, sans-serif'; ctx.letterSpacing = '3px';
    ctx.textAlign = 'center'; ctx.fillText('THE CHOSEN ONE', 600, 1080);
    ctx.fillStyle = '#fff'; ctx.font = `${result.winner.length > 22 ? 54 : 76}px "Berkshire Swash", Georgia, serif`;
    ctx.letterSpacing = '0px';
    let winnerLabel = result.winner;
    while (ctx.measureText(winnerLabel).width > 940 && winnerLabel.length > 5) winnerLabel = `${winnerLabel.slice(0, -2)}…`;
    ctx.fillText(winnerLabel, 600, 1170);
    ctx.fillStyle = '#cfc5d9'; ctx.font = '22px Manrope, sans-serif';
    ctx.fillText(result.verdict, 600, 1228);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#b7adbf'; ctx.font = '18px Manrope, sans-serif'; ctx.fillText('The wheel accepts no appeals.', 74, 1400);
    ctx.textAlign = 'right'; ctx.fillStyle = '#c8a8ff'; ctx.font = '800 19px Manrope, sans-serif'; ctx.letterSpacing = '2px';
    ctx.fillText('whimfate.com', 1126, 1400);

    return new Promise((resolve, reject) => {
      if (typeof canvas.toBlob === 'function') {
        canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Could not create the result image.')), 'image/png');
        return;
      }
      try {
        const dataUrl = canvas.toDataURL('image/png');
        const base64 = dataUrl.split(',')[1];
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
        resolve(new Blob([bytes], { type: 'image/png' }));
      } catch (error) {
        reject(error);
      }
    });
  }

  async function shareText() {
    if (!lastResult) return;
    const text = getShareText();
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Whimfate Wheel of Names', text, url: PAGE_URL });
        setFeedback('Shared. The wheel accepts no appeals.');
      } else {
        await copyText(text);
        setFeedback('Result text copied. Paste it into the group chat.');
      }
    } catch (error) {
      if (error && error.name === 'AbortError') return;
      try { await copyText(text); setFeedback('Native sharing unavailable. Result text copied instead.'); }
      catch (_) { setFeedback('Could not share or copy the result here.'); }
    }
  }

  function closeSharePictureDialog() {
    if (sharePictureDialog.open && typeof sharePictureDialog.close === 'function') {
      sharePictureDialog.close();
    } else {
      sharePictureDialog.removeAttribute('open');
      releaseSharePreview();
    }
  }

  function releaseSharePreview() {
    if (currentShareObjectUrl) {
      URL.revokeObjectURL(currentShareObjectUrl);
      currentShareObjectUrl = '';
    }
    sharePicturePreview.removeAttribute('src');
  }

  async function openSharePictureDialog() {
    if (!lastResult) return;
    sharePictureButton.disabled = true;
    setFeedback('Preparing the wheel card…');
    try {
      const blob = await createResultImageBlob();
      currentShareBlob = blob;
      currentShareFile = typeof File === 'function'
        ? new File([blob], 'whimfate-wheel-of-names.png', { type: 'image/png' })
        : null;
      releaseSharePreview();
      currentShareObjectUrl = URL.createObjectURL(blob);
      sharePicturePreview.src = currentShareObjectUrl;

      const supportsFileShare = Boolean(
        currentShareFile && navigator.share && navigator.canShare && navigator.canShare({ files: [currentShareFile] })
      );
      shareImageDeviceButton.hidden = !supportsFileShare;
      shareDialogFeedback.textContent = supportsFileShare
        ? 'Your device can send this PNG directly. Choose Share image to pick WhatsApp, Messages or another supported app.'
        : 'This browser cannot attach image files directly to social apps. Download the PNG, then attach it in WhatsApp, Discord or wherever you post.';

      if (typeof sharePictureDialog.showModal === 'function') sharePictureDialog.showModal();
      else sharePictureDialog.setAttribute('open', '');
      setFeedback('Your result card is ready.');
    } catch (error) {
      setFeedback(error.message || 'Could not prepare the result picture.');
    } finally {
      sharePictureButton.disabled = false;
    }
  }

  async function shareImageWithDevice() {
    if (!currentShareFile || !navigator.share || !navigator.canShare || !navigator.canShare({ files: [currentShareFile] })) {
      shareDialogFeedback.textContent = 'Direct image sharing is not available in this browser. Download the PNG and attach it manually.';
      return;
    }
    try {
      await navigator.share({
        title: 'Whimfate Wheel of Names',
        text: `${getShareText()}\n`,
        files: [currentShareFile]
      });
      shareDialogFeedback.textContent = 'Picture shared. The wheel has witnesses.';
      setFeedback('Result picture shared. The wheel has witnesses.');
    } catch (error) {
      if (error && error.name === 'AbortError') return;
      shareDialogFeedback.textContent = 'The share sheet could not send the file. Download the PNG and attach it manually.';
      setFeedback('Image sharing was unavailable. Your preview is still ready.');
    }
  }

  async function downloadImage() {
    if (!lastResult) return;
    try {
      const blob = currentShareBlob || await createResultImageBlob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = `whimfate-wheel-${new Date().toISOString().slice(0, 10)}.png`;
      document.body.append(link); link.click(); link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1500);
      setFeedback('Image saved. The group chat may now react.');
      if (sharePictureDialog.open) shareDialogFeedback.textContent = 'PNG downloaded. Attach it to WhatsApp, Discord or your group chat.';
    } catch (error) {
      setFeedback(error.message || 'Image export failed in this browser.');
    }
  }

  async function shareTo(platform) {
    const text = getShareText();
    const encodedText = encodeURIComponent(text);
    const encodedUrl = encodeURIComponent(PAGE_URL);
    const destinations = {
      whatsapp: `https://wa.me/?text=${encodeURIComponent(`${text}\n${PAGE_URL}`)}`,
      telegram: `https://t.me/share/url?url=${encodedUrl}&text=${encodedText}`,
      x: `https://twitter.com/intent/tweet?text=${encodedText}`,
      reddit: `https://www.reddit.com/submit?url=${encodedUrl}&title=${encodeURIComponent(lastResult ? `The wheel picked ${lastResult.winner}` : 'Wheel of Names — Whimfate')}`,
      facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`
    };
    if (platform === 'copy-link') {
      try { await copyText(PAGE_URL); socialFeedback.textContent = 'Link copied. Invite the group to let the wheel decide.'; }
      catch (_) { socialFeedback.textContent = `Copy this link: ${PAGE_URL}`; }
      return;
    }
    if (platform === 'discord') {
      try { await copyText(text); socialFeedback.textContent = 'Result text and link copied. Paste them into Discord; attach the downloaded PNG if you want the picture too.'; }
      catch (_) { socialFeedback.textContent = 'Copy failed. Use Share text or select the result manually.'; }
      return;
    }
    if (destinations[platform]) {
      window.open(destinations[platform], '_blank', 'noopener,noreferrer,width=760,height=640');
      socialFeedback.textContent = lastResult
        ? 'Share window opened with the selected name and link. Use Download image separately to attach the result card.'
        : 'Share window opened. Invite your friends to spin the wheel.';
    }
  }

  function renderHistory() {
    historyList.replaceChildren();
    if (!history.length) {
      const empty = document.createElement('p'); empty.className = 'wn-empty';
      empty.textContent = 'No spins yet. The wheel is enjoying the silence.'; historyList.append(empty); return;
    }
    history.slice(0, 6).forEach((item, index) => {
      const row = document.createElement('div'); row.className = 'wn-history-item';
      const label = document.createElement('span'); label.textContent = `SPIN ${String(spinNumber - index).padStart(2, '0')}`;
      const winner = document.createElement('strong'); winner.textContent = item.winner;
      row.append(label, winner); historyList.append(row);
    });
  }

  function finishSpin(selectedIndex, selectedEntries, finalRotation) {
    const winner = selectedEntries[selectedIndex];
    currentShareBlob = null;
    currentShareFile = null;
    if (sharePictureDialog.open) closeSharePictureDialog();
    const verdict = pickVerdict();
    spinNumber += 1;
    lastResult = {
      winner,
      verdict,
      index: selectedIndex,
      entries: selectedEntries.slice(),
      entryCount: selectedEntries.length,
      rotation: finalRotation
    };
    history.unshift({ winner, verdict });
    history = history.slice(0, 6);

    resultTitle.textContent = winner;
    resultLine.textContent = verdict;
    spinCount.textContent = `SPIN #${String(spinNumber).padStart(2, '0')}`;
    resultSection.hidden = false;
    setFeedback('');
    renderHistory();
    drawWheel(wheelContext, canvasWidth, rotation, entries, -1);

    if (removeWinnerInput.checked) {
      const updatedEntries = selectedEntries.slice();
      updatedEntries.splice(selectedIndex, 1);
      entriesInput.value = updatedEntries.join('\n');
      // Preserve the winner card while refreshing the remaining wheel.
      updateState({ clearResult: false });
      wheelHint.textContent = updatedEntries.length
        ? `${winner} has been removed. ${updatedEntries.length} entries remain.`
        : `${winner} was the final entry. Add more names for another spin.`;
    } else {
      entries = selectedEntries.slice();
      updateState({ clearResult: false });
      wheelHint.textContent = `${winner} was selected. Ready when you are.`;
    }

    spinning = false;
    updateState({ clearResult: false });
    resultSection.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
  }

  function spinWheel() {
    if (spinning || entries.length < 2) return;
    spinning = true;
    const selectedEntries = entries.slice();
    const selectedIndex = randomInt(selectedEntries.length);
    const slice = TAU / selectedEntries.length;
    const selectedCenter = -Math.PI / 2 + (selectedIndex + .5) * slice;
    const currentMod = ((rotation % TAU) + TAU) % TAU;
    const targetMod = ((-Math.PI / 2 - selectedCenter) % TAU + TAU) % TAU;
    const extraTurns = 7 + randomInt(4);
    const delta = (((targetMod - currentMod) % TAU) + TAU) % TAU + extraTurns * TAU;
    const startRotation = rotation;
    const endRotation = startRotation + delta;
    const duration = reducedMotion ? 0 : 4300 + randomInt(1200);
    const started = performance.now();

    spinButton.disabled = true;
    wheelHubButton.disabled = true;
    wheelHubButton.setAttribute('aria-label', 'Wheel is spinning');
    entriesInput.disabled = true;
    exampleButton.disabled = true;
    clearButton.disabled = true;
    removeWinnerInput.disabled = true;
    wheelStatus.textContent = 'SPINNING';
    wheelStatus.classList.add('is-spinning');
    spinButtonLabel.textContent = 'FATE IS THINKING';
    wheelHint.textContent = 'The wheel is considering the options. Dramatically.';
    setFeedback('');

    if (duration === 0) {
      rotation = endRotation;
      drawWheel(wheelContext, canvasWidth, rotation, selectedEntries, selectedIndex);
      finishSpin(selectedIndex, selectedEntries, rotation);
      return;
    }

    const animate = (now) => {
      const progress = Math.min(1, (now - started) / duration);
      const eased = 1 - Math.pow(1 - progress, 5);
      rotation = startRotation + delta * eased;
      drawWheel(wheelContext, canvasWidth, rotation, selectedEntries, -1);
      if (progress < 1) {
        animationFrame = window.requestAnimationFrame(animate);
      } else {
        animationFrame = 0;
        rotation = endRotation;
        drawWheel(wheelContext, canvasWidth, rotation, selectedEntries, selectedIndex);
        wheelHint.textContent = 'The wheel has stopped. One tiny moment…';
        revealTimer = window.setTimeout(() => finishSpin(selectedIndex, selectedEntries, rotation), 520);
      }
    };
    animationFrame = window.requestAnimationFrame(animate);
  }

  entriesInput.addEventListener('input', () => updateState());
  exampleButton.addEventListener('click', () => {
    entriesInput.value = exampleEntries.join('\n');
    updateState();
    entriesInput.focus();
    setValidation('Example list loaded. Add, remove or rename entries before spinning.');
  });
  clearButton.addEventListener('click', () => {
    entriesInput.value = '';
    rotation = 0;
    updateState();
    entriesInput.focus();
  });
  spinButton.addEventListener('click', spinWheel);
  wheelHubButton.addEventListener('click', spinWheel);
  shareTextButton.addEventListener('click', shareText);
  sharePictureButton.addEventListener('click', openSharePictureDialog);
  shareImageDeviceButton.addEventListener('click', shareImageWithDevice);
  downloadImageDialogButton.addEventListener('click', downloadImage);
  closeShareDialogButton.addEventListener('click', closeSharePictureDialog);
  sharePictureDialog.addEventListener('click', (event) => {
    if (event.target === sharePictureDialog) closeSharePictureDialog();
  });
  sharePictureDialog.addEventListener('close', releaseSharePreview);
  openSocialOptionsButton.addEventListener('click', () => {
    closeSharePictureDialog();
    document.querySelector('.wf-share-section')?.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'center' });
  });
  downloadImageButton.addEventListener('click', downloadImage);
  clearHistoryButton.addEventListener('click', () => {
    history = [];
    spinNumber = 0;
    renderHistory();
    socialFeedback.textContent = 'History cleared. The wheel has a clean slate.';
  });
  document.querySelectorAll('.wf-share-social-link[data-share]').forEach((button) => {
    button.addEventListener('click', () => shareTo(button.dataset.share));
  });

  window.addEventListener('resize', resizeWheel, { passive: true });
  if ('ResizeObserver' in window) new ResizeObserver(resizeWheel).observe(wheelCanvas);
  resizeWheel();
  updateState({ clearResult: false });
  renderHistory();
})();
