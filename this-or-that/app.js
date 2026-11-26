(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const PAGE_URL = 'https://wimfate.com/this-or-that/';
  const BRAND = 'WHIMFATE.COM';
  const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const form = $('tat-form');
  const contextInput = $('tat-context');
  const inputA = $('tat-input-a');
  const inputB = $('tat-input-b');
  const decideButton = $('tat-decide');
  const decideLabel = $('tat-decide-label');
  const validation = $('tat-validation');
  const statusText = $('tat-status-text');
  const resultPanel = $('tat-result');
  const resultSide = $('tat-result-side');
  const resultValue = $('tat-result-value');
  const resultContext = $('tat-result-context');
  const resultLine = $('tat-result-line');
  const picksCount = $('tat-picks-count');
  const sessionNote = $('tat-session-note');
  const resultActions = $('tat-result-actions');
  const feedback = $('tat-feedback');
  const clearButton = $('tat-clear');
  const historyList = $('tat-history-list');
  const socialFeedback = $('tat-social-feedback');

  const shareTextButton = $('tat-share-text');
  const sharePictureButton = $('tat-share-picture');
  const downloadImageButton = $('tat-download-image');
  const shareDialog = $('tat-share-dialog');
  const closeDialogButton = $('tat-close-dialog');
  const sharePreview = $('tat-share-preview');
  const previewLoading = $('tat-preview-loading');
  const nativeShareButton = $('tat-native-share');
  const dialogDownloadButton = $('tat-dialog-download');
  const dialogCopyButton = $('tat-dialog-copy');
  const dialogNote = $('tat-dialog-note');
  const dialogFeedback = $('tat-dialog-feedback');

  const verdictLines = [
    'The committee has been dismissed. The choice stands.',
    'Fate has made its selection. Please update the group chat.',
    'One option survives. The other may appeal never.',
    'The universe has picked a side and refused to elaborate.',
    'A decision has happened. Historians are taking notes.',
    'The debate is over. Until someone says “but what if”.',
    'One tiny decision. An unreasonable amount of closure.',
    'Your indecision has been gently escorted out.',
    'The coin was not consulted. The algorithm had a meeting.',
    'An official ruling from the Department of Sure, Why Not.',
    'There. That was easier than another twenty-minute discussion.',
    'Fate has spoken. The snacks may now be ordered.',
    'A winner has emerged from the fog of possibilities.',
    'The other option has been placed gently on read.',
    'No further debate will be accepted at this time.',
    'Decision delivered. Overthinking subscription paused.'
  ];

  let decisionCount = 0;
  let history = [];
  let currentDecision = null;
  let lastVerdictLine = '';
  let busy = false;
  let shareBlobCache = null;
  let shareBlobKey = '';
  let shareObjectUrl = '';

  function randomUint32() {
    if (window.crypto?.getRandomValues) {
      const buffer = new Uint32Array(1);
      window.crypto.getRandomValues(buffer);
      return buffer[0];
    }
    return Math.floor(Math.random() * 0x100000000);
  }

  // Uniform integer in [0, max - 1], using rejection sampling for Web Crypto.
  function randomInt(max) {
    if (!Number.isSafeInteger(max) || max <= 0) throw new RangeError('Random range must be a positive safe integer.');
    if (window.crypto?.getRandomValues) {
      const range = 0x100000000;
      const limit = range - (range % max);
      let value;
      do { value = randomUint32(); } while (value >= limit);
      return value % max;
    }
    return Math.floor(Math.random() * max);
  }

  function pickVerdictLine() {
    let next = verdictLines[randomInt(verdictLines.length)];
    if (verdictLines.length > 1 && next === lastVerdictLine) {
      const previousIndex = verdictLines.indexOf(next);
      next = verdictLines[(previousIndex + 1 + randomInt(verdictLines.length - 1)) % verdictLines.length];
    }
    lastVerdictLine = next;
    return next;
  }

  function updateButtonState() {
    const ready = Boolean(inputA.value.trim() && inputB.value.trim()) && !busy;
    decideButton.disabled = !ready;
    decideLabel.textContent = currentDecision ? 'DECIDE AGAIN' : 'LET FATE DECIDE';
  }

  function revokeShareUrl() {
    if (shareObjectUrl) URL.revokeObjectURL(shareObjectUrl);
    shareObjectUrl = '';
  }

  function clearDisplayedResult() {
    currentDecision = null;
    resultPanel.hidden = true;
    resultActions.hidden = true;
    resultSide.textContent = '';
    resultValue.textContent = '';
    resultContext.textContent = '';
    resultLine.textContent = '';
    statusText.textContent = 'READY';
    feedback.textContent = '';
    shareBlobCache = null;
    shareBlobKey = '';
    revokeShareUrl();
    updateButtonState();
  }

  function renderHistory() {
    historyList.replaceChildren();
    if (!history.length) {
      const empty = document.createElement('p');
      empty.className = 'tat-empty';
      empty.textContent = 'No decisions yet. Enjoy the rare moment of certainty.';
      historyList.append(empty);
      return;
    }

    history.forEach((item, index) => {
      const row = document.createElement('div');
      row.className = 'tat-history-item';
      const context = document.createElement('div');
      context.className = 'tat-history-context';
      const title = document.createElement('strong');
      title.textContent = item.context || `${item.a}  /  ${item.b}`;
      const detail = document.createElement('span');
      detail.textContent = `DECISION ${decisionCount - index} · ${item.side === 'a' ? 'OPTION A' : 'OPTION B'}`;
      context.append(title, detail);
      const picked = document.createElement('strong');
      picked.className = 'tat-history-pick';
      picked.textContent = item.choice;
      row.append(context, picked);
      row.setAttribute('aria-label', `Recent decision ${index + 1}: ${item.choice}`);
      historyList.append(row);
    });
  }

  function addHistory(decision) {
    history.unshift(decision);
    history = history.slice(0, 6);
    renderHistory();
  }

  function decide(event) {
    event?.preventDefault();
    if (busy) return;

    const a = inputA.value.trim();
    const b = inputB.value.trim();
    const context = contextInput.value.trim();

    validation.textContent = '';
    if (!a || !b) {
      validation.textContent = 'Give fate two options first. It is not a mind reader.';
      (!a ? inputA : inputB).focus();
      return;
    }
    if (a.toLocaleLowerCase() === b.toLocaleLowerCase()) {
      validation.textContent = 'Those options are identical. Give fate at least a tiny challenge.';
      inputB.focus();
      return;
    }

    // Pick before the animation. Motion only reveals the already-selected result.
    const side = randomInt(2) === 0 ? 'a' : 'b';
    const choice = side === 'a' ? a : b;
    const decision = { a, b, context, side, choice, line: pickVerdictLine(), timestamp: Date.now() };

    busy = true;
    inputA.disabled = true;
    inputB.disabled = true;
    contextInput.disabled = true;
    decideButton.disabled = true;
    decideButton.classList.add('is-thinking');
    decideLabel.textContent = 'CONSULTING CHANCE…';
    statusText.textContent = 'DECIDING';
    resultPanel.hidden = true;
    resultActions.hidden = true;
    validation.textContent = '';
    feedback.textContent = '';
    document.querySelector('.tat-console')?.classList.add('is-deciding');

    window.setTimeout(() => finishDecision(decision), REDUCED_MOTION ? 0 : 620);
  }

  function finishDecision(decision) {
    busy = false;
    inputA.disabled = false;
    inputB.disabled = false;
    contextInput.disabled = false;
    decideButton.classList.remove('is-thinking');
    document.querySelector('.tat-console')?.classList.remove('is-deciding');

    currentDecision = decision;
    decisionCount += 1;
    picksCount.textContent = String(decisionCount);
    sessionNote.textContent = decisionCount === 1 ? 'One decision down. Look at us go.' : 'Your indecision is losing ground.';

    resultSide.textContent = decision.side === 'a' ? 'OPTION A SELECTED' : 'OPTION B SELECTED';
    resultValue.textContent = decision.choice;
    resultContext.textContent = decision.context ? `DECISION: ${decision.context}` : `${decision.a}  ·  OR  ·  ${decision.b}`;
    resultLine.textContent = decision.line;
    resultPanel.hidden = false;
    resultActions.hidden = false;
    statusText.textContent = 'DECIDED';
    shareBlobCache = null;
    shareBlobKey = '';
    revokeShareUrl();
    addHistory(decision);
    updateButtonState();
  }

  function resultText() {
    if (!currentDecision) return '';
    const d = currentDecision;
    return [
      'WHIMFATE · THIS OR THAT',
      d.context ? `Decision: ${d.context}` : 'Two options. One random pick.',
      `A: ${d.a}`,
      `B: ${d.b}`,
      `Fate picked: ${d.choice}`,
      d.line,
      '',
      `Make your own: ${PAGE_URL}`
    ].join('\n');
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
    if (!ok) throw new Error('Copy is unavailable in this browser.');
  }

  function canShareFiles(file) {
    try { return Boolean(navigator.share && navigator.canShare && navigator.canShare({ files: [file] })); }
    catch { return false; }
  }

  function roundedRect(ctx, x, y, w, h, radius) {
    const r = Math.min(radius, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function wrapText(ctx, text, maxWidth) {
    const words = String(text).split(/\s+/);
    const lines = [];
    let line = '';
    for (let word of words) {
      if (ctx.measureText(word).width > maxWidth) {
        if (line) { lines.push(line); line = ''; }
        let chunk = '';
        for (const char of word) {
          const candidate = chunk + char;
          if (chunk && ctx.measureText(candidate).width > maxWidth) {
            lines.push(chunk);
            chunk = char;
          } else chunk = candidate;
        }
        word = chunk;
      }
      const candidate = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(candidate).width > maxWidth) {
        lines.push(line);
        line = word;
      } else line = candidate;
    }
    if (line) lines.push(line);
    return lines;
  }

  function fitText(ctx, text, maxWidth, startSize, minSize, fontFamily, weight = 700, maxLines = 3) {
    let size = startSize;
    let lines = [];
    while (size >= minSize) {
      ctx.font = `${weight} ${size}px ${fontFamily}`;
      lines = wrapText(ctx, text, maxWidth);
      if (lines.length <= maxLines) break;
      size -= 2;
    }
    ctx.font = `${weight} ${size}px ${fontFamily}`;
    return { size, lines: wrapText(ctx, text, maxWidth).slice(0, maxLines) };
  }

  async function createShareBlob() {
    if (!currentDecision) throw new Error('Make a decision before sharing it.');
    const d = currentDecision;
    const key = `${d.a}|${d.b}|${d.context}|${d.side}|${d.line}`;
    if (shareBlobCache && shareBlobKey === key) return shareBlobCache;

    if (document.fonts?.ready) await document.fonts.ready;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Image export is unavailable in this browser.');
    const width = 1200;
    const height = 1500;
    const pad = 76;
    canvas.width = width;
    canvas.height = height;

    ctx.fillStyle = '#050506';
    ctx.fillRect(0, 0, width, height);
    const purpleGlow = ctx.createRadialGradient(170, 90, 8, 170, 90, 700);
    purpleGlow.addColorStop(0, 'rgba(147,92,218,.32)');
    purpleGlow.addColorStop(1, 'rgba(5,5,6,0)');
    ctx.fillStyle = purpleGlow;
    ctx.fillRect(0, 0, width, 760);
    const greenGlow = ctx.createRadialGradient(1080, 1140, 10, 1080, 1140, 520);
    greenGlow.addColorStop(0, 'rgba(90,198,157,.15)');
    greenGlow.addColorStop(1, 'rgba(5,5,6,0)');
    ctx.fillStyle = greenGlow;
    ctx.fillRect(0, 700, width, 800);

    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#8be9c7';
    ctx.font = '800 22px Manrope, sans-serif';
    ctx.letterSpacing = '3px';
    ctx.fillText('WHIMFATE  /  THIS OR THAT', pad, pad);

    ctx.fillStyle = '#f9f4ff';
    ctx.font = '76px "Berkshire Swash", Georgia, serif';
    ctx.letterSpacing = '0px';
    ctx.fillText('A decision has been made.', pad, pad + 112);

    const contextText = d.context || 'Two options. One random pick.';
    ctx.fillStyle = '#bdb3ca';
    ctx.font = '700 22px Manrope, sans-serif';
    ctx.letterSpacing = '1px';
    const contextLines = wrapText(ctx, contextText, width - pad * 2).slice(0, 2);
    contextLines.forEach((line, index) => ctx.fillText(line, pad, pad + 165 + index * 32));

    const cardsY = 350;
    const gap = 22;
    const cardW = (width - pad * 2 - gap) / 2;
    const cardH = 500;
    [
      { side: 'a', text: d.a, x: pad, accent: '#c8a8ff' },
      { side: 'b', text: d.b, x: pad + cardW + gap, accent: '#8be9c7' }
    ].forEach((item) => {
      const chosen = item.side === d.side;
      roundedRect(ctx, item.x, cardsY, cardW, cardH, 5);
      ctx.fillStyle = chosen ? 'rgba(36,25,48,.96)' : 'rgba(10,9,13,.92)';
      ctx.fill();
      ctx.strokeStyle = chosen ? item.accent : '#38323f';
      ctx.lineWidth = chosen ? 4 : 2;
      ctx.stroke();
      ctx.fillStyle = item.accent;
      ctx.font = '800 19px Manrope, sans-serif';
      ctx.letterSpacing = '2px';
      ctx.fillText(item.side === 'a' ? 'OPTION A' : 'OPTION B', item.x + 30, cardsY + 53);
      if (chosen) {
        roundedRect(ctx, item.x + 28, cardsY + 78, 162, 38, 3);
        ctx.fillStyle = item.accent;
        ctx.fill();
        ctx.fillStyle = '#08070b';
        ctx.font = '900 15px Manrope, sans-serif';
        ctx.letterSpacing = '1px';
        ctx.fillText('FATE PICKED', item.x + 42, cardsY + 103);
      }
      const fitted = fitText(ctx, item.text, cardW - 58, 48, 28, '"Berkshire Swash", Georgia, serif', 400, 5);
      ctx.fillStyle = '#fff';
      const lineHeight = fitted.size * 1.22;
      const blockHeight = fitted.lines.length * lineHeight;
      let y = cardsY + 300 - blockHeight / 2;
      fitted.lines.forEach((line) => { ctx.fillText(line, item.x + 29, y); y += lineHeight; });
      ctx.fillStyle = chosen ? item.accent : '#8e8796';
      ctx.font = '800 16px Manrope, sans-serif';
      ctx.letterSpacing = '1px';
      ctx.fillText(chosen ? 'SELECTED' : 'NOT THIS TIME', item.x + 29, cardsY + cardH - 34);
    });

    const verdictY = 900;
    roundedRect(ctx, pad, verdictY, width - pad * 2, 330, 5);
    ctx.fillStyle = 'rgba(10,9,13,.94)';
    ctx.fill();
    ctx.strokeStyle = '#3a3047';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#8be9c7';
    ctx.font = '800 19px Manrope, sans-serif';
    ctx.letterSpacing = '2px';
    ctx.fillText('THE VERDICT', pad + 34, verdictY + 55);
    const chosenText = d.choice;
    const chosenFit = fitText(ctx, chosenText, width - pad * 2 - 68, 51, 30, '"Berkshire Swash", Georgia, serif', 400, 3);
    ctx.fillStyle = '#c8a8ff';
    chosenFit.lines.forEach((line, index) => ctx.fillText(line, pad + 34, verdictY + 128 + index * chosenFit.size * 1.2));
    ctx.fillStyle = '#d1c8da';
    ctx.font = 'italic 21px Manrope, sans-serif';
    ctx.letterSpacing = '0px';
    wrapText(ctx, d.line, width - pad * 2 - 68).slice(0, 2).forEach((line, index) => ctx.fillText(line, pad + 34, verdictY + 245 + index * 31));

    ctx.fillStyle = '#8be9c7';
    ctx.font = '800 18px Manrope, sans-serif';
    ctx.letterSpacing = '2px';
    ctx.fillText(BRAND, pad, height - pad + 5);
    ctx.fillStyle = '#9b92a5';
    ctx.font = '600 16px Manrope, sans-serif';
    ctx.letterSpacing = '0px';
    ctx.textAlign = 'right';
    ctx.fillText('wimfate.com/this-or-that', width - pad, height - pad + 5);

    const blob = await new Promise((resolve, reject) => {
      if (canvas.toBlob) {
        canvas.toBlob((result) => result ? resolve(result) : reject(new Error('Could not create the PNG card.')), 'image/png');
      } else {
        try {
          const dataUrl = canvas.toDataURL('image/png');
          const binary = atob(dataUrl.split(',')[1]);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
          resolve(new Blob([bytes], { type: 'image/png' }));
        } catch (error) { reject(error); }
      }
    });
    shareBlobCache = blob;
    shareBlobKey = key;
    return blob;
  }

  function openDialog() {
    if (typeof shareDialog.showModal === 'function') {
      if (!shareDialog.open) shareDialog.showModal();
    } else {
      shareDialog.setAttribute('open', '');
      shareDialog.classList.add('is-open');
    }
  }

  function closeDialog() {
    if (typeof shareDialog.close === 'function' && shareDialog.open) shareDialog.close();
    else {
      shareDialog.removeAttribute('open');
      shareDialog.classList.remove('is-open');
    }
  }

  async function prepareShareDialog() {
    dialogFeedback.textContent = '';
    previewLoading.hidden = false;
    previewLoading.textContent = 'Preparing your result card…';
    sharePreview.hidden = true;
    nativeShareButton.disabled = true;
    dialogDownloadButton.disabled = true;
    dialogCopyButton.disabled = false;
    dialogNote.textContent = 'Preparing a high-resolution image for sharing.';
    openDialog();
    try {
      const blob = await createShareBlob();
      revokeShareUrl();
      shareObjectUrl = URL.createObjectURL(blob);
      sharePreview.src = shareObjectUrl;
      sharePreview.hidden = false;
      previewLoading.hidden = true;
      dialogDownloadButton.disabled = false;
      const file = new File([blob], 'whimfate-this-or-that.png', { type: 'image/png' });
      if (canShareFiles(file)) {
        nativeShareButton.disabled = false;
        dialogNote.textContent = 'Your device can share image files. Choose Share image with an app to send the PNG to a compatible app.';
      } else {
        dialogNote.textContent = 'This browser cannot attach a local PNG to social-site links. Download the image and attach it in your chosen app. The network buttons share the text and page link.';
      }
    } catch (error) {
      previewLoading.textContent = error.message || 'Could not prepare the image.';
      dialogNote.textContent = 'The image could not be prepared in this browser.';
      dialogFeedback.textContent = error.message || 'Image export failed.';
    }
  }

  async function sharePicture() {
    if (!currentDecision) return;
    feedback.textContent = 'Preparing the picture…';
    try {
      const blob = await createShareBlob();
      const file = new File([blob], 'whimfate-this-or-that.png', { type: 'image/png' });
      if (canShareFiles(file)) {
        try {
          await navigator.share({ title: 'Whimfate This or That', text: resultText(), files: [file] });
          feedback.textContent = 'Picture shared. The decision has left the building.';
          return;
        } catch (error) {
          if (error?.name === 'AbortError') { feedback.textContent = ''; return; }
        }
      }
      feedback.textContent = '';
      await prepareShareDialog();
    } catch (error) {
      feedback.textContent = error.message || 'Could not prepare the result picture.';
    }
  }

  async function shareImageWithApp() {
    try {
      const blob = shareBlobCache || await createShareBlob();
      const file = new File([blob], 'whimfate-this-or-that.png', { type: 'image/png' });
      if (!canShareFiles(file)) {
        dialogNote.textContent = 'Direct image sharing is not available in this browser. Download the PNG and attach it manually.';
        dialogFeedback.textContent = 'Image sharing is not supported here. Use Download PNG instead.';
        return;
      }
      await navigator.share({ title: 'Whimfate This or That', text: resultText(), files: [file] });
      dialogFeedback.textContent = 'Result card shared. The decision has escaped the browser.';
      feedback.textContent = 'Picture shared.';
    } catch (error) {
      if (error?.name === 'AbortError') return;
      dialogFeedback.textContent = 'The share sheet could not send the image. Download the PNG and attach it manually.';
    }
  }

  async function downloadImage() {
    try {
      const blob = await createShareBlob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `whimfate-this-or-that-${new Date().toISOString().slice(0, 10)}.png`;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1200);
      feedback.textContent = 'Picture downloaded. Submit it as evidence.';
      dialogFeedback.textContent = 'PNG downloaded. Attach it wherever the debate is happening.';
    } catch (error) {
      feedback.textContent = error.message || 'Could not download the image.';
      dialogFeedback.textContent = feedback.textContent;
    }
  }

  async function shareText() {
    if (!currentDecision) return;
    const text = resultText();
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Whimfate This or That', text, url: PAGE_URL });
        feedback.textContent = 'Shared. The decision now has witnesses.';
      } else {
        await copyText(text);
        feedback.textContent = 'Result text copied. Go tell the group chat.';
      }
    } catch (error) {
      if (error?.name === 'AbortError') return;
      try { await copyText(text); feedback.textContent = 'Share sheet unavailable. Result text copied instead.'; }
      catch { feedback.textContent = 'Could not share or copy in this browser.'; }
    }
  }

  async function shareTo(platform) {
    const text = currentDecision ? resultText() : 'Have two options? Let Whimfate pick one. No committee required.';
    const encodedText = encodeURIComponent(text);
    const encodedUrl = encodeURIComponent(PAGE_URL);
    const destinations = {
      whatsapp: `https://wa.me/?text=${encodeURIComponent(`${text}\n${PAGE_URL}`)}`,
      telegram: `https://t.me/share/url?url=${encodedUrl}&text=${encodedText}`,
      x: `https://twitter.com/intent/tweet?text=${encodedText}&url=${encodedUrl}`,
      reddit: `https://www.reddit.com/submit?url=${encodedUrl}&title=${encodeURIComponent('This or That — Whimfate')}`,
      facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`
    };
    if (platform === 'copy-link') {
      try {
        await copyText(PAGE_URL);
        socialFeedback.textContent = 'Link copied. The group chat may now convene.';
      } catch { socialFeedback.textContent = 'Could not copy the link in this browser.'; }
      closeDialog();
      return;
    }
    if (platform === 'discord') {
      try {
        await copyText(text);
        socialFeedback.textContent = 'Text copied for Discord. Attach the downloaded PNG if you want the picture too.';
        dialogFeedback.textContent = 'Text copied for Discord. Attach the downloaded PNG to include the image.';
      } catch { socialFeedback.textContent = 'Could not copy the result for Discord.'; }
      return;
    }
    const target = destinations[platform];
    if (target) window.open(target, '_blank', 'noopener,noreferrer');
  }

  function invalidateOnEdit() {
    if (currentDecision) clearDisplayedResult();
    validation.textContent = '';
    updateButtonState();
  }

  form.addEventListener('submit', decide);
  [inputA, inputB].forEach((input) => input.addEventListener('input', invalidateOnEdit));
  contextInput.addEventListener('input', invalidateOnEdit);
  clearButton.addEventListener('click', () => {
    if (busy) return;
    inputA.value = '';
    inputB.value = '';
    contextInput.value = '';
    validation.textContent = '';
    clearDisplayedResult();
    updateButtonState();
    inputA.focus();
    feedback.textContent = '';
  });

  shareTextButton.addEventListener('click', shareText);
  sharePictureButton.addEventListener('click', sharePicture);
  downloadImageButton.addEventListener('click', downloadImage);
  nativeShareButton.addEventListener('click', shareImageWithApp);
  dialogDownloadButton.addEventListener('click', downloadImage);
  dialogCopyButton.addEventListener('click', async () => {
    try { await copyText(resultText()); dialogFeedback.textContent = 'Decision copied. Send it to the group.'; }
    catch { dialogFeedback.textContent = 'Could not copy the decision.'; }
  });
  closeDialogButton.addEventListener('click', closeDialog);
  shareDialog.addEventListener('click', (event) => {
    if (event.target === shareDialog) closeDialog();
  });
  document.querySelectorAll('[data-dialog-share]').forEach((button) => {
    button.addEventListener('click', () => shareTo(button.dataset.dialogShare));
  });
  document.querySelectorAll('[data-share]').forEach((button) => {
    button.addEventListener('click', () => shareTo(button.dataset.share));
  });
  window.addEventListener('pagehide', revokeShareUrl, { once: true });

  renderHistory();
  updateButtonState();
})();
