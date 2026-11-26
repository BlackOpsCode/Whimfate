(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const minInput = $('rng-min');
  const maxInput = $('rng-max');
  const quantityOutput = $('rng-quantity');
  const minusButton = $('rng-minus');
  const plusButton = $('rng-plus');
  const repeatsInput = $('rng-repeats');
  const sortInput = $('rng-sort');
  const generateButton = $('rng-generate');
  const engine = $('rng-engine');
  const engineDisplay = document.querySelector('.rng-engine-display');
  const engineNumber = $('rng-engine-number');
  const engineCaption = $('rng-engine-caption');
  const ready = $('rng-ready');
  const entropyLabel = $('rng-entropy-label');
  const entropyFill = $('rng-entropy-fill');
  const validation = $('rng-validation');
  const resultsSection = $('rng-results');
  const resultsGrid = $('rng-number-grid');
  const resultsSummary = $('rng-results-summary');
  const resultStamp = $('rng-result-stamp');
  const resultVerdict = $('rng-result-verdict');
  const resultMethod = $('rng-result-method');
  const resultRange = $('rng-result-range');
  const feedback = $('rng-feedback');
  const shareFeedback = $('rng-share-feedback');
  const shareTextButton = $('rng-share-text');
  const sharePictureButton = $('rng-share-picture');
  const downloadButton = $('rng-download-image');
  const againButton = $('rng-again');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const pageUrl = 'https://wimfate.com/random-number/';
  const MAX_QUANTITY = 50;
  const SAFE_MIN = Number.MIN_SAFE_INTEGER;
  const SAFE_MAX = Number.MAX_SAFE_INTEGER;

  let quantity = 1;
  let drawing = false;
  let drawIndex = 0;
  let lastDraw = null;
  let recentVerdicts = [];
  let lastPreviewValue = '?';

  const verdicts = [
    'The entropy has entered the chat.',
    'Fate has outsourced this one.',
    'The universe made a choice. It declined to explain.',
    'Probability did a tiny backflip.',
    'The numbers have been summoned. Please behave.',
    'Chance has left a note. It just says “yes”.',
    'A statistically dramatic little moment.',
    'The cosmic spreadsheet has updated.',
    'No committee was harmed in this draw.',
    'The random department has clocked in.',
    'The void picked. The void is unionized.',
    'A number appeared. This is how it starts.',
    'Entropy says: stop refreshing the range.',
    'The fates have selected a very specific integer.',
    'The machine has spoken in numerals.',
    'No vibes were consulted. Only bits.',
    'The universe rolled its invisible sleeves.',
    'A number has been chosen. Appeals cost extra.',
    'Chaos, but make it integer-safe.',
    'The result is in. Your group chat is next.'
  ];

  function getVerdict() {
    const candidates = verdicts.filter((line) => !recentVerdicts.includes(line));
    const choice = candidates.length ? candidates[secureRandomIndex(candidates.length)] : verdicts[secureRandomIndex(verdicts.length)];
    recentVerdicts.push(choice);
    recentVerdicts = recentVerdicts.slice(-8);
    return choice;
  }

  function hasCryptoRandom() {
    return Boolean(window.crypto && typeof window.crypto.getRandomValues === 'function' && typeof BigInt === 'function');
  }

  // Web Crypto gives a uniformly distributed 32-bit word. Two words form a 64-bit sample.
  // Rejection sampling below avoids modulo bias for any interval within safe-integer bounds.
  function randomBigIntBelow(limit) {
    if (limit <= 0n) throw new RangeError('Random range must be positive.');
    if (hasCryptoRandom()) {
      const words = Math.max(1, Math.ceil(limit.toString(2).length / 32));
      const space = 1n << BigInt(words * 32);
      const cutoff = space - (space % limit);
      const buffer = new Uint32Array(words);
      let sample;
      do {
        window.crypto.getRandomValues(buffer);
        sample = 0n;
        for (let index = 0; index < buffer.length; index += 1) {
          sample = (sample << 32n) | BigInt(buffer[index]);
        }
      } while (sample >= cutoff);
      return sample % limit;
    }
    // Compatibility fallback for very old/nonstandard browser contexts; not cryptographic.
    const fallback = BigInt(Math.floor(Math.random() * Number(limit)));
    return fallback < limit ? fallback : limit - 1n;
  }

  function secureRandomInteger(min, max) {
    const minimum = BigInt(min);
    const span = BigInt(max) - minimum + 1n;
    return Number(minimum + randomBigIntBelow(span));
  }

  function secureRandomIndex(length) {
    if (!Number.isSafeInteger(length) || length < 1) throw new RangeError('Cannot choose from an empty list.');
    return Number(randomBigIntBelow(BigInt(length)));
  }

  function validateSettings() {
    const min = Number(minInput.value);
    const max = Number(maxInput.value);
    if (minInput.value.trim() === '' || maxInput.value.trim() === '') {
      return { valid: false, message: 'Enter both ends of the range.' };
    }
    if (!Number.isSafeInteger(min) || !Number.isSafeInteger(max)) {
      return { valid: false, message: 'Use whole numbers within JavaScript’s safe-integer range.' };
    }
    if (min > max) return { valid: false, message: 'The minimum cannot be greater than the maximum.' };
    if (quantity < 1 || quantity > MAX_QUANTITY) return { valid: false, message: `Choose between 1 and ${MAX_QUANTITY} numbers.` };

    const rangeSize = BigInt(max) - BigInt(min) + 1n;
    if (!repeatsInput.checked && BigInt(quantity) > rangeSize) {
      return { valid: false, message: `There are only ${rangeSize.toString()} unique numbers in that range. Widen the range or allow repeats.` };
    }
    return { valid: true, min, max, rangeSize };
  }

  function setValidation(message, isError = false) {
    validation.textContent = message;
    validation.classList.toggle('is-error', isError);
  }

  function updateQuantity() {
    quantityOutput.textContent = String(quantity);
    minusButton.disabled = quantity <= 1 || drawing;
    plusButton.disabled = quantity >= MAX_QUANTITY || drawing;
    syncValidation();
  }

  function syncValidation() {
    const state = validateSettings();
    generateButton.disabled = drawing || !state.valid;
    if (!state.valid) {
      setValidation(state.message, true);
      return;
    }
    const source = hasCryptoRandom() ? 'Cryptographic browser randomness is ready.' : 'Compatibility randomness is active in this browser.';
    const repeatsText = repeatsInput.checked ? 'Repeats are allowed.' : 'Every number will be unique.';
    setValidation(`${source} ${repeatsText} Both range limits are included.`);
  }

  function drawNumbers(min, max) {
    const values = [];
    if (repeatsInput.checked) {
      for (let index = 0; index < quantity; index += 1) values.push(secureRandomInteger(min, max));
    } else {
      const chosen = new Set();
      while (chosen.size < quantity) chosen.add(secureRandomInteger(min, max));
      values.push(...chosen);
    }
    if (sortInput.checked) values.sort((a, b) => a - b);
    return values;
  }

  function formatInteger(value) {
    return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0, useGrouping: true }).format(value);
  }

  function renderNumbers(values) {
    resultsGrid.replaceChildren();
    const fragment = document.createDocumentFragment();
    values.forEach((value, index) => {
      const card = document.createElement('article');
      card.className = 'rng-number-card';
      card.style.setProperty('--delay', `${Math.min(index, 18) * 35}ms`);
      const label = document.createElement('span');
      label.textContent = `NUMBER ${String(index + 1).padStart(2, '0')}`;
      const number = document.createElement('strong');
      number.textContent = formatInteger(value);
      card.append(label, number);
      fragment.append(card);
    });
    resultsGrid.append(fragment);
  }

  function textResult() {
    if (!lastDraw) return `Whimfate Random Number\nPick your numbers: ${pageUrl}`;
    const values = lastDraw.values.map(formatInteger);
    return [
      'WHIMFATE · RANDOM NUMBER',
      lastDraw.verdict,
      `Range: ${formatInteger(lastDraw.min)} to ${formatInteger(lastDraw.max)} (inclusive)`,
      `Numbers: ${values.join(', ')}`,
      `Duplicates: ${lastDraw.allowRepeats ? 'allowed' : 'not allowed'}`,
      '',
      `Generate your own: ${pageUrl}`
    ].join('\n');
  }

  async function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return;
    }
    const area = document.createElement('textarea');
    area.value = text;
    area.readOnly = true;
    area.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0;pointer-events:none';
    document.body.append(area);
    area.select();
    const copied = document.execCommand('copy');
    area.remove();
    if (!copied) throw new Error('Clipboard is unavailable in this browser.');
  }

  async function shareText() {
    if (!lastDraw) return;
    const text = textResult();
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Whimfate Random Number', text, url: pageUrl });
        feedback.textContent = 'The numbers are out in the world. Entropy has no publicist.';
      } else {
        await copyText(text);
        feedback.textContent = 'Result text copied. Paste it wherever decisions happen.';
      }
    } catch (error) {
      if (error && error.name === 'AbortError') return;
      try {
        await copyText(text);
        feedback.textContent = 'Share sheet unavailable. Result text copied instead.';
      } catch {
        feedback.textContent = 'Could not share automatically. Select the numbers to copy them manually.';
      }
    }
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

  async function createImageBlob() {
    if (!lastDraw) throw new Error('Generate numbers first.');
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Image export is unavailable in this browser.');

    const width = 1200;
    const padding = 70;
    const columns = lastDraw.values.length <= 4 ? 2 : 4;
    const gap = 18;
    const cardWidth = (width - padding * 2 - gap * (columns - 1)) / columns;
    const rows = Math.ceil(lastDraw.values.length / columns);
    const cardHeight = lastDraw.values.length === 1 ? 205 : 142;
    const headerHeight = 330;
    const footerHeight = 155;
    const height = padding + headerHeight + rows * cardHeight + Math.max(0, rows - 1) * gap + footerHeight + padding;
    canvas.width = width;
    canvas.height = height;

    ctx.fillStyle = '#030304';
    ctx.fillRect(0, 0, width, height);
    const glow = ctx.createRadialGradient(width * .78, 100, 4, width * .78, 100, 680);
    glow.addColorStop(0, 'rgba(139,233,199,.14)');
    glow.addColorStop(.45, 'rgba(200,168,255,.12)');
    glow.addColorStop(1, 'rgba(3,3,4,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, width, Math.min(500, height));

    ctx.fillStyle = '#8be9c7';
    ctx.font = '800 21px Manrope, sans-serif';
    ctx.letterSpacing = '4px';
    ctx.fillText('WHIMFATE · RANDOM NUMBER', padding, padding + 7);
    ctx.fillStyle = '#f8f4fb';
    ctx.font = '64px "Berkshire Swash", Georgia, serif';
    ctx.letterSpacing = '0px';
    ctx.fillText('The numbers have landed.', padding, padding + 95);
    ctx.fillStyle = '#d7cedf';
    ctx.font = '25px Manrope, sans-serif';
    ctx.fillText(`Range ${formatInteger(lastDraw.min)} to ${formatInteger(lastDraw.max)} · ${lastDraw.values.length} pick${lastDraw.values.length === 1 ? '' : 's'}`, padding, padding + 148);
    ctx.fillStyle = '#c8a8ff';
    ctx.font = 'italic 27px "Berkshire Swash", Georgia, serif';
    const verdict = lastDraw.verdict.length > 58 ? `${lastDraw.verdict.slice(0, 55)}…` : lastDraw.verdict;
    ctx.fillText(verdict, padding, padding + 202);

    const listTop = padding + headerHeight;
    lastDraw.values.forEach((value, index) => {
      const col = index % columns;
      const row = Math.floor(index / columns);
      const x = padding + col * (cardWidth + gap);
      const y = listTop + row * (cardHeight + gap);
      const accent = index % 2 === 0 ? '#c8a8ff' : '#8be9c7';
      roundedRect(ctx, x, y, cardWidth, cardHeight, 4);
      ctx.fillStyle = '#08070a';
      ctx.fill();
      ctx.strokeStyle = index % 2 === 0 ? 'rgba(200,168,255,.55)' : 'rgba(139,233,199,.55)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = '#a79bb5';
      ctx.font = '800 14px Manrope, sans-serif';
      ctx.letterSpacing = '2px';
      ctx.textAlign = 'center';
      ctx.fillText(`NUMBER ${String(index + 1).padStart(2, '0')}`, x + cardWidth / 2, y + 34);
      ctx.fillStyle = accent;
      let fontSize = value.toString().length >= 14 ? 37 : value.toString().length >= 11 ? 45 : value.toString().length >= 8 ? 54 : 68;
      ctx.font = `${fontSize}px "Berkshire Swash", Georgia, serif`;
      ctx.letterSpacing = '0px';
      ctx.fillText(formatInteger(value), x + cardWidth / 2, y + cardHeight * .69);
      ctx.textAlign = 'left';
    });

    const footerY = listTop + rows * cardHeight + Math.max(0, rows - 1) * gap + 56;
    ctx.fillStyle = '#a79bb5';
    ctx.font = '800 16px Manrope, sans-serif';
    ctx.letterSpacing = '2px';
    ctx.fillText(hasCryptoRandom() ? 'BROWSER CRYPTO RANDOMNESS' : 'BROWSER RANDOMNESS', padding, footerY);
    ctx.fillStyle = '#8be9c7';
    ctx.font = '800 20px Manrope, sans-serif';
    ctx.textAlign = 'right';
    ctx.letterSpacing = '1px';
    ctx.fillText('WIMFATE.COM/RANDOM-NUMBER', width - padding, footerY);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#82798d';
    ctx.font = '18px Manrope, sans-serif';
    ctx.letterSpacing = '0px';
    ctx.fillText('Made for the beautifully undecided.', padding, footerY + 34);

    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Could not prepare the result image.')), 'image/png');
    });
  }

  async function getImageFile() {
    const blob = await createImageBlob();
    return new File([blob], 'whimfate-random-number.png', { type: 'image/png' });
  }

  async function sharePicture() {
    if (!lastDraw) return;
    sharePictureButton.disabled = true;
    feedback.textContent = 'Preparing the number card…';
    try {
      const file = await getImageFile();
      if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Whimfate Random Number', text: `${lastDraw.verdict}\n${pageUrl}` });
        feedback.textContent = 'Number card sent into the world. Screenshot arguments may now begin.';
      } else {
        feedback.textContent = 'This browser cannot send image files directly. Use Download image, then attach the PNG to your message.';
      }
    } catch (error) {
      if (error && error.name === 'AbortError') return;
      feedback.textContent = error && error.message ? error.message : 'Picture sharing is unavailable here. Use Download image instead.';
    } finally {
      sharePictureButton.disabled = !lastDraw;
    }
  }

  async function downloadImage() {
    if (!lastDraw) return;
    downloadButton.disabled = true;
    try {
      const blob = await createImageBlob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'whimfate-random-number.png';
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1500);
      feedback.textContent = 'PNG downloaded. Your number has acquired a tiny passport.';
    } catch (error) {
      feedback.textContent = error && error.message ? error.message : 'Could not create the image in this browser.';
    } finally {
      downloadButton.disabled = !lastDraw;
    }
  }

  async function shareTo(network) {
    const message = textResult();
    const encodedText = encodeURIComponent(message);
    const encodedUrl = encodeURIComponent(pageUrl);
    const targets = {
      whatsapp: `https://wa.me/?text=${encodedText}`,
      telegram: `https://t.me/share/url?url=${encodedUrl}&text=${encodedText}`,
      x: `https://twitter.com/intent/tweet?text=${encodedText}`,
      reddit: `https://www.reddit.com/submit?url=${encodedUrl}&title=${encodeURIComponent(lastDraw ? `Whimfate numbers: ${lastDraw.values.join(', ')}` : 'Whimfate Random Number')}`,
      facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`
    };
    if (network === 'copy-link') {
      try {
        await copyText(pageUrl);
        shareFeedback.textContent = 'Link copied. The numbers are now somebody else’s problem.';
      } catch {
        shareFeedback.textContent = `Copy this link: ${pageUrl}`;
      }
      return;
    }
    if (network === 'discord') {
      try {
        await copyText(message);
        shareFeedback.textContent = 'Result text copied for Discord. Add the downloaded PNG if you want the visual evidence.';
      } catch {
        shareFeedback.textContent = `Copy the result manually: ${message}`;
      }
      return;
    }
    const target = targets[network];
    if (target) window.open(target, '_blank', 'noopener,noreferrer');
  }

  async function generate({ scrollToResults = true } = {}) {
    if (drawing) return;
    const state = validateSettings();
    if (!state.valid) {
      syncValidation();
      return;
    }

    drawing = true;
    updateQuantity();
    generateButton.disabled = true;
    generateButton.classList.add('is-working');
    generateButton.querySelector('strong').textContent = 'THE FATE ENGINE IS THINKING';
    ready.textContent = 'DRAWING';
    ready.classList.add('is-working');
    engineDisplay.classList.add('is-spinning');
    entropyLabel.textContent = 'IN MOTION';
    entropyFill.classList.add('is-charging');
    engineCaption.textContent = 'COLLAPSING THE POSSIBILITIES';
    feedback.textContent = 'The numbers are already chosen. The machine is adding dramatic lighting…';
    setValidation('Please let the tiny machinery finish its very serious work.');
    shareTextButton.disabled = true;
    sharePictureButton.disabled = true;
    downloadButton.disabled = true;

    const values = drawNumbers(state.min, state.max);
    const verdict = getVerdict();
    const finalDraw = {
      min: state.min,
      max: state.max,
      values,
      verdict,
      allowRepeats: repeatsInput.checked,
      sorted: sortInput.checked,
      secure: hasCryptoRandom(),
      draw: drawIndex + 1
    };

    try {
      if (!reducedMotion) {
        const started = performance.now();
        const duration = 880;
        await new Promise((resolve) => {
          const tick = (now) => {
            const progress = Math.min(1, (now - started) / duration);
            if (progress > .82) {
              engineNumber.textContent = String(values[values.length - 1]);
            } else {
              engineNumber.textContent = String(secureRandomInteger(state.min, state.max));
            }
            entropyFill.style.width = `${12 + progress * 88}%`;
            if (progress < 1) window.requestAnimationFrame(tick);
            else resolve();
          };
          window.requestAnimationFrame(tick);
        });
      } else {
        engineNumber.textContent = String(values[values.length - 1]);
        entropyFill.style.width = '100%';
      }
      lastDraw = finalDraw;
      drawIndex += 1;
      renderNumbers(values);
      const uniqueCount = new Set(values).size;
      resultsSummary.textContent = `${values.length} number${values.length === 1 ? '' : 's'} from ${formatInteger(state.min)} to ${formatInteger(state.max)}. ${uniqueCount === values.length ? 'No duplicates in this draw.' : 'Repeats made the guest list.'}`;
      resultStamp.textContent = `DRAW #${String(drawIndex).padStart(2, '0')}`;
      resultVerdict.textContent = verdict;
      resultMethod.textContent = finalDraw.secure ? 'WEB CRYPTO RANDOMNESS' : 'BROWSER FALLBACK RANDOMNESS';
      resultRange.textContent = `RANGE ${formatInteger(state.min)}–${formatInteger(state.max)}`;
      resultsSection.hidden = false;
      shareTextButton.disabled = false;
      sharePictureButton.disabled = false;
      downloadButton.disabled = false;
      ready.textContent = 'DECIDED';
      ready.classList.remove('is-working');
      engineCaption.textContent = 'THE FATE ENGINE HAS SPOKEN';
      engineNumber.textContent = String(values[values.length - 1]);
      entropyLabel.textContent = 'COLLAPSED';
      entropyFill.style.width = '100%';
      entropyFill.classList.remove('is-charging');
      feedback.textContent = verdict;
      setValidation('Draw complete. Your settings and numbers stayed in this browser.');
      if (scrollToResults) {
        resultsSection.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
      }
    } catch (error) {
      console.error('Random Number draw failed:', error);
      feedback.textContent = 'The fate engine has mislaid a decimal. Try the draw again.';
      setValidation('Something interrupted the draw. Check your range and try again.', true);
    } finally {
      drawing = false;
      engineDisplay.classList.remove('is-spinning');
      generateButton.classList.remove('is-working');
      generateButton.querySelector('strong').textContent = 'GENERATE NUMBERS';
      ready.textContent = lastDraw ? 'READY' : 'READY';
      ready.classList.remove('is-working');
      updateQuantity();
    }
  }

  function setPreset(min, max) {
    minInput.value = String(min);
    maxInput.value = String(max);
    syncValidation();
  }

  minusButton.addEventListener('click', () => {
    if (drawing) return;
    quantity = Math.max(1, quantity - 1);
    updateQuantity();
  });
  plusButton.addEventListener('click', () => {
    if (drawing) return;
    quantity = Math.min(MAX_QUANTITY, quantity + 1);
    updateQuantity();
  });
  [minInput, maxInput, repeatsInput, sortInput].forEach((control) => {
    control.addEventListener('input', syncValidation);
    control.addEventListener('change', syncValidation);
  });
  document.querySelectorAll('[data-min][data-max]').forEach((button) => {
    button.addEventListener('click', () => setPreset(button.dataset.min, button.dataset.max));
  });
  generateButton.addEventListener('click', () => generate());
  againButton.addEventListener('click', () => generate({ scrollToResults: false }));
  shareTextButton.addEventListener('click', shareText);
  sharePictureButton.addEventListener('click', sharePicture);
  downloadButton.addEventListener('click', downloadImage);
  document.querySelectorAll('.wf-share-social-link[data-social]').forEach((button) => {
    button.addEventListener('click', () => shareTo(button.dataset.social));
  });

  updateQuantity();
})();
