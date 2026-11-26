(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const typeButtons = [...document.querySelectorAll('.die-type-button')];
  const countOutput = $('die-count');
  const minus = $('dice-minus');
  const plus = $('dice-plus');
  const stage = $('dice-stage');
  const stageCaption = $('dice-stage-caption');
  const total = $('dice-total');
  const breakdown = $('dice-breakdown');
  const rollButton = $('roll-button');
  const status = $('dice-status');
  const shareButton = $('share-dice');
  const shareCardButton = $('share-card-dice');
  const downloadCardButton = $('download-card-dice');
  const shareFeedback = $('dice-share-feedback');
  const shareDialog = $('dice-share-dialog');
  const closeShareDialogButton = $('close-dice-share');
  const dialogImage = $('dice-share-preview-image');
  const dialogPreviewLoading = $('dice-share-preview-loading');
  const dialogNote = $('dice-dialog-note');
  const dialogFeedback = $('dice-dialog-feedback');
  const sendImageButton = $('send-dice-image');
  const dialogCopyButton = $('copy-dice-text-dialog');
  const socialButtons = [...document.querySelectorAll('[data-social]')];
  const sharePanelButtons = [...document.querySelectorAll('.wf-share-social-link[data-share]')];
  const resetButton = $('reset-dice');
  const history = $('dice-history');
  const feedback = $('dice-feedback');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const MAX_DICE = 8;
  let sides = 6;
  let count = 1;
  let busy = false;
  let lastRoll = null;
  let records = [];
  let animationTimer = 0;
  let animationTicks = 0;
  let cachedShareBlob = null;
  let cachedShareBlobFor = null;
  let cachedShareObjectUrl = '';
  let dialogIntent = 'text';

  const sideNotes = {
    4: 'A tiny triangle. A surprisingly large responsibility.',
    6: 'Six sides. Six opportunities.',
    8: 'Eight sides. Confidence not included.',
    10: 'Ten sides. Now with extra maths energy.',
    12: 'Twelve sides. This is getting ceremonial.',
    20: 'The D20 has entered the chat.',
    100: 'A D100. Because subtlety left the table.'
  };
  const rollLines = [
    'The numbers have landed. Please remain dramatic.',
    'The dice have spoken. The rules lawyer may respond.',
    'Entropy has entered its findings into the minutes.',
    'A result has occurred. Historians are investigating.',
    'The universe rolled first. You may now react.',
    'The little cubes have completed their tiny meeting.',
    'Fate has provided a number, not an explanation.',
    'The roll is in. Blame the dice responsibly.'
  ];
  let lastRollLine = -1;

  function randomInt(max) {
    if (window.crypto?.getRandomValues) {
      const range = 0x100000000;
      const limit = range - (range % max);
      const buffer = new Uint32Array(1);
      let value;
      do {
        window.crypto.getRandomValues(buffer);
        value = buffer[0];
      } while (value >= limit);
      return (value % max) + 1;
    }
    return Math.floor(Math.random() * max) + 1;
  }

  function pickRollLine() {
    if (rollLines.length < 2) return rollLines[0] || 'The dice have spoken.';
    let next = randomInt(rollLines.length) - 1;
    if (next === lastRollLine) next = (next + 1 + randomInt(rollLines.length - 1) - 1) % rollLines.length;
    lastRollLine = next;
    return rollLines[next];
  }

  function toneForDie(dieSides, index) {
    // Odd-numbered die styles use violet; even-numbered styles use the Whimfate mint accent.
    return ((dieSides + index) % 2 === 0) ? 'tone-purple' : 'tone-green';
  }

  function pipGrid(value) {
    const grid = document.createElement('span');
    grid.className = 'pip-grid';
    grid.dataset.value = String(value);
    grid.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < 9; i++) grid.append(document.createElement('i'));
    return grid;
  }

  function makeDie(value, dieSides, index = 0, rolling = false) {
    const tile = document.createElement('div');
    tile.className = `die-tile ${toneForDie(dieSides, index)}${rolling ? ' is-rolling' : ''}`;
    tile.dataset.sides = String(dieSides);
    const shape = document.createElement('div');
    shape.className = `die-shape shape-d${dieSides}`;
    shape.dataset.sides = String(dieSides);
    shape.dataset.value = String(value);
    shape.setAttribute('aria-label', `D${dieSides} result ${value}`);

    if (dieSides === 6) {
      if (String(value) === '?') {
        const placeholder = document.createElement('span');
        placeholder.className = 'die-number';
        placeholder.textContent = '?';
        shape.append(placeholder);
      }
      shape.append(pipGrid(value));
    } else {
      const number = document.createElement('span');
      number.className = 'die-number';
      number.textContent = String(value);
      shape.append(number);
    }

    const label = document.createElement('span');
    label.className = 'die-caption';
    label.textContent = `D${dieSides}`;
    tile.append(shape, label);
    return tile;
  }

  function showDice(values, dieSides, rolling = false) {
    stage.replaceChildren(...values.map((value, index) => makeDie(value, dieSides, index, rolling)));
    stage.classList.toggle('is-rolling', rolling);
  }

  function updateControls() {
    countOutput.textContent = String(count);
    minus.disabled = count <= 1 || busy;
    plus.disabled = count >= MAX_DICE || busy;
    typeButtons.forEach((button) => {
      const selected = Number(button.dataset.sides) === sides;
      button.classList.toggle('is-selected', selected);
      button.setAttribute('aria-pressed', String(selected));
      button.disabled = busy;
    });
    status.textContent = busy ? 'ROLLING' : 'READY';
    rollButton.disabled = busy;
  }


  function roundRect(ctx, x, y, w, h, r) {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }

  function drawDieForCard(ctx, x, y, size, dieSides, value, accent) {
    const sidesCount = dieSides === 4 ? 3 : dieSides === 6 ? 4 : dieSides === 8 ? 6 : dieSides === 10 ? 8 : dieSides === 12 ? 8 : dieSides === 20 ? 7 : 40;
    const gradient = ctx.createLinearGradient(x, y, x + size, y + size);
    if (accent === 'green') {
      gradient.addColorStop(0, '#c5ffed'); gradient.addColorStop(.55, '#70ddb7'); gradient.addColorStop(1, '#1b765b');
    } else {
      gradient.addColorStop(0, '#f0e4ff'); gradient.addColorStop(.52, '#b88bff'); gradient.addColorStop(1, '#5b2b99');
    }
    ctx.save();
    ctx.shadowColor = accent === 'green' ? 'rgba(139,233,199,.15)' : 'rgba(200,168,255,.2)';
    ctx.shadowBlur = 24;
    ctx.fillStyle = gradient;
    ctx.strokeStyle = accent === 'green' ? '#b5ffe6' : '#e6d3ff';
    ctx.lineWidth = 3;
    if (dieSides === 6) {
      roundRect(ctx, x + size * .08, y + size * .08, size * .84, size * .84, size * .17);
      ctx.fill(); ctx.stroke();
    } else if (dieSides === 100) {
      ctx.beginPath(); ctx.arc(x + size / 2, y + size / 2, size * .43, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    } else {
      const radius = size * .43;
      ctx.beginPath();
      for (let i = 0; i < sidesCount; i++) {
        const a = -Math.PI / 2 + i * Math.PI * 2 / sidesCount;
        const px = x + size / 2 + Math.cos(a) * radius;
        const py = y + size / 2 + Math.sin(a) * radius;
        if (!i) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#090610';
    if (dieSides === 6 && Number.isInteger(value)) {
      const points = {
        1: [[.5,.5]],
        2: [[.28,.28],[.72,.72]],
        3: [[.28,.28],[.5,.5],[.72,.72]],
        4: [[.28,.28],[.72,.28],[.28,.72],[.72,.72]],
        5: [[.28,.28],[.72,.28],[.5,.5],[.28,.72],[.72,.72]],
        6: [[.28,.25],[.72,.25],[.28,.5],[.72,.5],[.28,.75],[.72,.75]]
      }[value] || [];
      const pipR = size * .052;
      points.forEach(([px, py]) => { ctx.beginPath(); ctx.arc(x + size * px, y + size * py, pipR, 0, Math.PI * 2); ctx.fill(); });
    } else {
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = `800 ${String(value).length > 2 ? size * .25 : size * .35}px Manrope, sans-serif`;
      ctx.fillText(String(value), x + size / 2, y + size / 2 + 2);
    }
    ctx.restore();
  }

  async function createRollImageBlob() {
    if (!lastRoll) throw new Error('Roll the dice first.');
    if (document.fonts?.ready) await document.fonts.ready;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas export is unavailable in this browser.');
    const width = 1200;
    const padding = 64;
    const columns = Math.min(4, lastRoll.values.length);
    const rows = Math.ceil(lastRoll.values.length / columns);
    const gap = 20;
    const tileWidth = (width - padding * 2 - gap * (columns - 1)) / columns;
    const tileHeight = 222;
    const headerH = 245;
    const footerH = 94;
    const totalH = 205;
    const diceTop = padding + headerH;
    const height = padding + headerH + rows * tileHeight + (rows - 1) * gap + totalH + footerH + padding;
    canvas.width = width; canvas.height = height;

    ctx.fillStyle = '#050506'; ctx.fillRect(0, 0, width, height);
    const glowPurple = ctx.createRadialGradient(width * .25, 30, 20, width * .25, 30, width * .7);
    glowPurple.addColorStop(0, 'rgba(132, 76, 202, .28)'); glowPurple.addColorStop(1, 'rgba(5,5,6,0)');
    ctx.fillStyle = glowPurple; ctx.fillRect(0, 0, width, 390);
    const glowGreen = ctx.createRadialGradient(width * .9, height * .82, 10, width * .9, height * .82, 430);
    glowGreen.addColorStop(0, 'rgba(70, 180, 140, .10)'); glowGreen.addColorStop(1, 'rgba(5,5,6,0)');
    ctx.fillStyle = glowGreen; ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = '#8be9c7'; ctx.font = '800 20px Manrope, sans-serif'; ctx.letterSpacing = '3px';
    ctx.fillText('WHIMFATE  /  DICE ROLL', padding, padding + 8);
    ctx.fillStyle = '#f7f1ff'; ctx.font = '62px "Berkshire Swash", Georgia, serif'; ctx.letterSpacing = '0px';
    ctx.fillText('The dice have spoken.', padding, padding + 92);
    ctx.fillStyle = '#bdb3ca'; ctx.font = '23px Manrope, sans-serif';
    ctx.fillText(`D${lastRoll.sides}  ·  ${lastRoll.values.length} ${lastRoll.values.length === 1 ? 'die' : 'dice'}  ·  no appeals accepted`, padding, padding + 142);
    ctx.fillStyle = '#29232f'; ctx.fillRect(padding, padding + 172, width - padding * 2, 1);

    lastRoll.values.forEach((value, index) => {
      const col = index % columns;
      const row = Math.floor(index / columns);
      const x = padding + col * (tileWidth + gap);
      const y = diceTop + row * (tileHeight + gap);
      roundRect(ctx, x, y, tileWidth, tileHeight, 4);
      ctx.fillStyle = '#0b0a0e'; ctx.fill(); ctx.strokeStyle = '#302938'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.fillStyle = index % 2 ? '#8be9c7' : '#c8a8ff';
      ctx.font = '800 15px Manrope, sans-serif'; ctx.letterSpacing = '2px';
      ctx.fillText(`D${lastRoll.sides} · DIE ${String(index + 1).padStart(2, '0')}`, x + 20, y + 28);
      const dieSize = Math.min(tileWidth * .54, 118);
      drawDieForCard(ctx, x + (tileWidth - dieSize) / 2, y + 48, dieSize, lastRoll.sides, value, index % 2 ? 'green' : 'purple');
      ctx.fillStyle = '#faf6ff'; ctx.font = '800 27px Manrope, sans-serif'; ctx.letterSpacing = '0px';
      ctx.textAlign = 'center'; ctx.fillText(String(value), x + tileWidth / 2, y + tileHeight - 15); ctx.textAlign = 'left';
    });

    const totalTop = diceTop + rows * tileHeight + (rows - 1) * gap + 22;
    roundRect(ctx, padding, totalTop, width - padding * 2, totalH - 16, 4);
    ctx.fillStyle = '#0b0a0e'; ctx.fill(); ctx.strokeStyle = '#363040'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = '#a99fb4'; ctx.font = '800 17px Manrope, sans-serif'; ctx.letterSpacing = '3px';
    ctx.fillText('THE TOTAL', padding + 28, totalTop + 44);
    ctx.fillStyle = '#8be9c7'; ctx.font = '86px "Berkshire Swash", Georgia, serif'; ctx.letterSpacing = '0px';
    ctx.fillText(String(lastRoll.total), padding + 28, totalTop + 132);
    ctx.fillStyle = '#eee8f4'; ctx.font = '21px Manrope, sans-serif';
    const expression = `${lastRoll.values.join(' + ')} = ${lastRoll.total}`;
    ctx.textAlign = 'right'; ctx.fillText(expression, width - padding - 28, totalTop + 116); ctx.textAlign = 'left';
    ctx.fillStyle = '#c5bbd1'; ctx.font = 'italic 21px Manrope, sans-serif';
    ctx.fillText(lastRoll.message || 'Entropy has entered its findings.', padding, totalTop + totalH - 26);

    const footerY = height - padding + 3;
    ctx.fillStyle = '#a69cb1'; ctx.font = '17px Manrope, sans-serif';
    ctx.fillText('Roll for initiative. Blame the dice.', padding, footerY);
    ctx.fillStyle = '#c8a8ff'; ctx.font = '800 18px Manrope, sans-serif'; ctx.textAlign = 'right';
    ctx.fillText('WIMFATE.COM/DICE-ROLL', width - padding, footerY); ctx.textAlign = 'left';

    return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Could not build the PNG card.')), 'image/png'));
  }

  async function getShareBlobForCurrentRoll() {
    if (!lastRoll) throw new Error('Roll the dice first.');
    if (cachedShareBlob && cachedShareBlobFor === lastRoll) return cachedShareBlob;
    if (cachedShareObjectUrl) URL.revokeObjectURL(cachedShareObjectUrl);
    cachedShareObjectUrl = '';
    cachedShareBlob = null;
    cachedShareBlobFor = lastRoll;
    const blob = await createRollImageBlob();
    // A newer roll may have been made while the image was rendering.
    if (cachedShareBlobFor !== lastRoll) throw new Error('A new roll replaced this one. Open Share again.');
    cachedShareBlob = blob;
    cachedShareObjectUrl = URL.createObjectURL(blob);
    return blob;
  }

  function canShareFiles(file) {
    try {
      return Boolean(navigator.share && navigator.canShare && navigator.canShare({ files: [file] }));
    } catch {
      return false;
    }
  }

  async function openShareDialog(intent = 'text') {
    if (!lastRoll) {
      shareFeedback.textContent = 'Roll the dice first. The audience needs a number.';
      return;
    }
    dialogIntent = intent;
    sendImageButton.textContent = 'Share image with an app';
    dialogFeedback.textContent = '';
    dialogPreviewLoading.hidden = false;
    dialogPreviewLoading.textContent = 'Preparing your result card…';
    dialogImage.hidden = true;
    sendImageButton.disabled = true;
    if (intent === 'image') {
      dialogNote.textContent = 'Preparing a high-resolution image, then you can choose how to send it.';
    } else {
      dialogNote.textContent = 'Choose a network for the result text, or send the image through your device’s share menu.';
    }
    if (typeof shareDialog.showModal === 'function') {
      if (!shareDialog.open) shareDialog.showModal();
    } else {
      shareDialog.setAttribute('open', '');
      shareDialog.classList.add('is-open');
    }
    try {
      const blob = await getShareBlobForCurrentRoll();
      dialogImage.src = cachedShareObjectUrl;
      dialogImage.hidden = false;
      dialogPreviewLoading.hidden = true;
      sendImageButton.disabled = false;
      const file = new File([blob], 'whimfate-dice-roll.png', { type: 'image/png' });
      if (canShareFiles(file)) {
        sendImageButton.disabled = false;
        sendImageButton.textContent = 'Share image with an app';
        dialogNote.textContent = 'Your device supports direct image sharing. Choose “Share image with an app”, then pick WhatsApp, Discord, or another available app.';
      } else {
        sendImageButton.disabled = true;
        sendImageButton.textContent = 'Direct image share unavailable';
        dialogNote.textContent = 'This browser cannot pass an image directly to social apps. Choose a network to share the result text and link, or download the PNG and attach it manually.';
      }
    } catch (error) {
      dialogPreviewLoading.textContent = error.message || 'Could not prepare the image.';
      dialogNote.textContent = 'You can still copy or share the result text.';
      dialogFeedback.textContent = error.message || 'Image preparation failed.';
      sendImageButton.disabled = true;
    }
  }

  function closeShareDialog() {
    if (typeof shareDialog.close === 'function' && shareDialog.open) shareDialog.close();
    else {
      shareDialog.removeAttribute('open');
      shareDialog.classList.remove('is-open');
    }
  }

  async function downloadRollImage() {
    try {
      const blob = await getShareBlobForCurrentRoll();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `whimfate-dice-roll-${new Date().toISOString().slice(0,10)}.png`;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1500);
      feedback.textContent = 'PNG downloaded. Your dice have requested to be perceived.';
      shareFeedback.textContent = 'Image downloaded. Attach it to the group chat and let the debate begin.';
      dialogFeedback.textContent = 'PNG downloaded. Attach it to your chosen app or post.';
    } catch (error) {
      feedback.textContent = error.message || 'Could not export the image in this browser.';
      dialogFeedback.textContent = feedback.textContent;
    }
  }

  async function shareRollImage() {
    if (!lastRoll) return;
    let blob;
    try {
      // openShareDialog prepares and caches this blob before the user clicks the native share action.
      blob = cachedShareBlob && cachedShareBlobFor === lastRoll
        ? cachedShareBlob
        : await getShareBlobForCurrentRoll();
    } catch (error) {
      dialogFeedback.textContent = error.message || 'Could not prepare the image.';
      return;
    }
    const file = new File([blob], `whimfate-dice-roll.png`, { type: 'image/png' });
    if (canShareFiles(file)) {
      try {
        await navigator.share({
          title: 'Whimfate Dice Roll',
          text: `${lastRoll.message}\n${resultText()}`,
          files: [file]
        });
        dialogFeedback.textContent = 'The dice card has left the dungeon. Shared successfully.';
        shareFeedback.textContent = 'Dice card shared. Fate is now someone else’s problem.';
      } catch (error) {
        if (error?.name === 'AbortError') return;
        dialogFeedback.textContent = 'The share sheet could not send the image. Download the PNG and attach it manually.';
      }
    } else {
      dialogFeedback.textContent = 'Direct image sharing is not supported by this browser. Use Download image, then attach the PNG in WhatsApp, Discord, or your chosen app. The network buttons below share the text and link.';
      dialogNote.textContent = 'No browser API can attach a local PNG to arbitrary social-site URLs. Downloading the card and attaching it in the target app is the reliable desktop workflow.';
      sendImageButton.textContent = 'Image sharing unavailable here';
      sendImageButton.disabled = true;
    }
  }

  async function shareTo(platform) {
    const url = 'https://wimfate.com/dice-roll/';
    const text = lastRoll ? resultText() : 'Roll some virtual dice with Whimfate. D4 to D100, no dice bag required.';
    const encodedText = encodeURIComponent(text);
    const encodedUrl = encodeURIComponent(url);
    const destinations = {
      whatsapp: `https://wa.me/?text=${encodeURIComponent(`${text}\n${url}`)}`,
      telegram: `https://t.me/share/url?url=${encodedUrl}&text=${encodedText}`,
      x: `https://twitter.com/intent/tweet?text=${encodedText}&url=${encodedUrl}`,
      reddit: `https://www.reddit.com/submit?url=${encodedUrl}&title=${encodeURIComponent(lastRoll ? `Whimfate roll: ${lastRoll.total}` : 'Whimfate Dice Roll')}`,
      facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`
    };
    if (platform === 'copy-link') {
      try { await copyText(url); shareFeedback.textContent = 'Link copied. Roll diplomacy begins now.'; dialogFeedback.textContent = 'Link copied. Paste it wherever the party gathers.'; }
      catch { shareFeedback.textContent = 'Could not copy the link in this browser.'; dialogFeedback.textContent = shareFeedback.textContent; }
      closeShareDialog();
      return;
    }
    if (platform === 'discord') {
      closeShareDialog();
      try {
        await copyText(text);
        shareFeedback.textContent = lastRoll ? 'Result text copied. Download the PNG and attach it in Discord when you paste the text.' : 'Dice Roll link copied. Paste it into your Discord channel.';
        dialogFeedback.textContent = shareFeedback.textContent;
      } catch {
        shareFeedback.textContent = 'Discord has no general web share composer. Copy the result, then attach the PNG in Discord.';
        dialogFeedback.textContent = shareFeedback.textContent;
      }
      return;
    }
    const destination = destinations[platform];
    if (!destination) return;
    closeShareDialog();
    window.open(destination, '_blank', 'noopener,noreferrer,width=760,height=640');
    const message = lastRoll ? 'Network composer opened with the result text and link. Attach the PNG manually if you want to include the dice image.' : 'Share window opened. Invite the group to roll.';
    shareFeedback.textContent = message;
    dialogFeedback.textContent = message;
  }


  function renderHistory() {
    history.replaceChildren();
    if (!records.length) {
      const empty = document.createElement('p');
      empty.className = 'dice-empty';
      empty.textContent = 'No rolls yet. Your tabletop awaits.';
      history.append(empty);
      return;
    }
    records.slice(0, 6).forEach((record, index) => {
      const item = document.createElement('div');
      item.className = 'dice-history-item';
      const label = document.createElement('span');
      label.textContent = `ROLL ${records.length - index} · D${record.sides} × ${record.values.length}`;
      const value = document.createElement('strong');
      value.textContent = `${record.values.join(' + ')} = ${record.total}`;
      value.className = 'history-total';
      item.append(label, value);
      history.append(item);
    });
  }

  function resultText() {
    if (!lastRoll) return '';
    return [
      'WHIMFATE DICE ROLLER',
      `D${lastRoll.sides} × ${lastRoll.values.length}`,
      `Results: ${lastRoll.values.join(', ')}`,
      `Total: ${lastRoll.total}`,
      lastRoll.message,
      'Roll your own: https://wimfate.com/dice-roll/'
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
    if (!ok) throw new Error('Copy failed');
  }

  async function shareRoll() {
    if (!lastRoll) return;
    const text = resultText();
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Whimfate Dice Roll', text, url: 'https://wimfate.com/dice-roll/' });
        feedback.textContent = 'Roll shared. The dice have entered the group chat.';
        shareFeedback.textContent = 'Roll shared. Probability discourse is now someone else’s problem.';
      } else {
        await copyText(text);
        feedback.textContent = 'Result text copied. Pick a network below or paste it into your game chat.';
        shareFeedback.textContent = 'Result copied. Choose a network below, or paste it into your tabletop chat.';
      }
    } catch (error) {
      if (error?.name === 'AbortError') return;
      try {
        await copyText(text);
        feedback.textContent = 'Native sharing was unavailable. Result text copied instead.';
      } catch (_) {
        feedback.textContent = 'Could not share or copy automatically in this browser.';
      }
    }
  }

  function finishRoll(values, dieSides) {
    busy = false;
    lastRoll = {
      sides: dieSides,
      values,
      total: values.reduce((sum, value) => sum + value, 0),
      message: pickRollLine()
    };
    records.unshift(lastRoll);
    records = records.slice(0, 6);
    showDice(values, dieSides, false);
    total.textContent = String(lastRoll.total);
    breakdown.textContent = `${values.join(' + ')} = ${lastRoll.total} · ${values.length} ${values.length === 1 ? 'die' : 'dice'}`;
    stageCaption.textContent = lastRoll.message;

    shareButton.disabled = false;
    shareCardButton.disabled = false;
    downloadCardButton.disabled = false;
    feedback.textContent = lastRoll.message;
    updateControls();
    renderHistory();
  }

  function performRoll() {
    if (busy) return;
    busy = true;
    updateControls();

    shareButton.disabled = true;
    feedback.textContent = 'The dice are tumbling through the paperwork…';
    shareFeedback.textContent = '';
    shareCardButton.disabled = true;
    downloadCardButton.disabled = true;
    stageCaption.textContent = 'Rolling… rolling… legally, this is suspense.';
    const dieSides = sides;
    const finalValues = Array.from({ length: count }, () => randomInt(dieSides));

    if (reducedMotion) {
      finishRoll(finalValues, dieSides);
      return;
    }

    animationTicks = 0;
    showDice(Array.from({ length: count }, () => randomInt(dieSides)), dieSides, true);
    animationTimer = window.setInterval(() => {
      animationTicks += 1;
      const temporary = Array.from({ length: count }, () => randomInt(dieSides));
      showDice(temporary, dieSides, true);
      if (animationTicks >= 9) {
        window.clearInterval(animationTimer);
        animationTimer = 0;
        // Let the final tumble settle for a short beat before revealing the actual result.
        window.setTimeout(() => finishRoll(finalValues, dieSides), 140);
      }
    }, 78);
  }

  typeButtons.forEach((button) => {
    button.addEventListener('click', () => {
      if (busy) return;
      sides = Number(button.dataset.sides);
      $('selected-die-note').textContent = sideNotes[sides] || 'Roll carefully. Or dramatically.';
      total.textContent = '—';
      breakdown.textContent = 'The dice are waiting for their cue.';
      stageCaption.textContent = sideNotes[sides] || 'Choose the number of dice, then roll.';
      showDice(Array.from({ length: count }, () => '?'), sides, false);
      lastRoll = null;

      shareButton.disabled = true;
      shareCardButton.disabled = true;
      downloadCardButton.disabled = true;
      updateControls();
    });
  });

  minus.addEventListener('click', () => {
    if (busy) return;
    count = Math.max(1, count - 1);
    total.textContent = '—';
    breakdown.textContent = 'The dice are waiting for their cue.';
    lastRoll = null;

    shareButton.disabled = true;
    shareCardButton.disabled = true;
    downloadCardButton.disabled = true;
    showDice(Array.from({ length: count }, () => '?'), sides, false);
    updateControls();
  });

  plus.addEventListener('click', () => {
    if (busy) return;
    count = Math.min(MAX_DICE, count + 1);
    total.textContent = '—';
    breakdown.textContent = 'The dice are waiting for their cue.';
    lastRoll = null;

    shareButton.disabled = true;
    shareCardButton.disabled = true;
    downloadCardButton.disabled = true;
    showDice(Array.from({ length: count }, () => '?'), sides, false);
    updateControls();
  });

  rollButton.addEventListener('click', performRoll);
  shareButton.addEventListener('click', shareRoll);
  shareCardButton.addEventListener('click', () => openShareDialog('image'));
  downloadCardButton.addEventListener('click', downloadRollImage);
  closeShareDialogButton.addEventListener('click', closeShareDialog);
  sendImageButton.addEventListener('click', shareRollImage);
  dialogCopyButton.addEventListener('click', async () => {
    try {
      await copyText(resultText());
      dialogFeedback.textContent = 'Result text copied. Paste it into the group chat.';
      feedback.textContent = 'Copied. The party has been notified.';
    } catch {
      dialogFeedback.textContent = 'Could not copy in this browser.';
    }
  });
  shareDialog.addEventListener('click', (event) => {
    if (event.target === shareDialog) closeShareDialog();
  });
  socialButtons.forEach((button) => button.addEventListener('click', (event) => {
    if (button.tagName === 'A') event.preventDefault();
    shareTo(button.dataset.social);
  }));
  sharePanelButtons.forEach((button) => button.addEventListener('click', () => shareTo(button.dataset.share)));
  resetButton.addEventListener('click', () => {
    if (busy) return;
    records = [];
    lastRoll = null;
    renderHistory();
    showDice(Array.from({ length: count }, () => '?'), sides, false);
    total.textContent = '—';
    breakdown.textContent = 'The dice are waiting for their cue.';
    stageCaption.textContent = sideNotes[sides];
    shareFeedback.textContent = '';
    feedback.textContent = 'History cleared. The dice remember nothing.';

    shareButton.disabled = true;
    shareCardButton.disabled = true;
    downloadCardButton.disabled = true;
  });

  $('selected-die-note').textContent = sideNotes[sides];
  updateControls();
  renderHistory();
})();
