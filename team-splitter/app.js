/* Whimfate Team Splitter — local-only, balanced shuffle, shareable results. */
(() => {
  'use strict';

  const byId = (id) => document.getElementById(id);
  const namesInput = byId('names-input');
  const teamCountInput = byId('team-count');
  const minusButton = byId('team-minus');
  const plusButton = byId('team-plus');
  const drawButton = byId('draw-button');
  const exampleButton = byId('example-button');
  const clearButton = byId('clear-button');
  const participantBadge = byId('participant-badge');
  const namesCount = byId('names-count');
  const validationMessage = byId('validation-message');
  const machine = byId('fate-machine');
  const machineStatus = byId('machine-status');
  const machineMessage = byId('machine-message');
  const machineSymbol = byId('machine-symbol');
  const meterNeedle = byId('meter-needle');
  const meterReadout = byId('meter-readout');
  const resultsSection = byId('results-section');
  const resultsGrid = byId('team-results');
  const resultsSummary = byId('results-summary');
  const resultStamp = byId('result-stamp');
  const copyButton = byId('copy-button');
  const shareButton = byId('share-button');
  const downloadButton = byId('download-button');
  const reshuffleButton = byId('reshuffle-button');
  const resultFeedback = byId('result-feedback');
  const main = byId('main-content');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const MAX_NAMES = 200;
  const MAX_TEAMS = 50;
  const exampleNames = [
    'Alex', 'Sam', 'Jordan', 'Riley', 'Casey', 'Jamie',
    'Taylor', 'Morgan', 'Avery', 'Cameron', 'Drew', 'Quinn'
  ];
  let lastTeams = [];
  let drawNumber = 0;
  let isDrawing = false;

  // Cryptographically secure browser randomness with unbiased integer sampling.
  // getRandomValues is available even on local files in modern browsers; Math.random is a fallback.
  function randomUint32() {
    if (window.crypto && typeof window.crypto.getRandomValues === 'function') {
      const value = new Uint32Array(1);
      window.crypto.getRandomValues(value);
      return value[0];
    }
    return Math.floor(Math.random() * 0x100000000) >>> 0;
  }

  function randomInt(maxExclusive) {
    if (!Number.isInteger(maxExclusive) || maxExclusive < 1 || maxExclusive > 0x100000000) {
      throw new RangeError('Random range must be an integer from 1 to 2^32.');
    }
    if (maxExclusive === 1) return 0;
    const range = 0x100000000;
    const limit = range - (range % maxExclusive);
    let value;
    do {
      value = randomUint32();
    } while (value >= limit);
    return value % maxExclusive;
  }

  function getNames() {
    return namesInput.value
      .split(/\r?\n/)
      .map((name) => name.trim())
      .filter(Boolean)
      .slice(0, MAX_NAMES);
  }

  function getTeamCount() {
    const parsed = Number.parseInt(teamCountInput.value, 10);
    if (!Number.isFinite(parsed)) return 2;
    return Math.min(MAX_TEAMS, Math.max(2, parsed));
  }

  function setValidation(message, isError = false) {
    validationMessage.textContent = message;
    validationMessage.classList.toggle('is-error', isError);
  }

  function setFeedback(message) {
    resultFeedback.textContent = message;
  }

  function invalidateResults() {
    if (resultsSection.hidden) return;
    resultsSection.hidden = true;
    resultsGrid.replaceChildren();
    lastTeams = [];
    setFeedback('');
  }

  function updateState({ resetResults = true } = {}) {
    const names = getNames();
    const rawLines = namesInput.value.split(/\r?\n/).filter((line) => line.trim()).length;
    participantBadge.textContent = `${names.length} ${names.length === 1 ? 'name' : 'names'}`;
    namesCount.textContent = `${Math.min(rawLines, MAX_NAMES)} / ${MAX_NAMES}`;
    namesInput.setAttribute('aria-invalid', rawLines > MAX_NAMES ? 'true' : 'false');

    const maxTeams = Math.min(MAX_TEAMS, Math.max(2, names.length || MAX_TEAMS));
    teamCountInput.max = String(maxTeams);
    const teamCount = getTeamCount();
    if (Number.parseInt(teamCountInput.value, 10) !== teamCount) teamCountInput.value = String(teamCount);
    minusButton.disabled = isDrawing || teamCount <= 2;
    plusButton.disabled = isDrawing || teamCount >= maxTeams;

    const valid = names.length >= 2 && rawLines <= MAX_NAMES && teamCount <= names.length;
    drawButton.disabled = isDrawing || !valid;
    exampleButton.disabled = isDrawing;
    clearButton.disabled = isDrawing || namesInput.value.length === 0;
    namesInput.disabled = isDrawing;
    teamCountInput.disabled = isDrawing;

    if (rawLines > MAX_NAMES) {
      setValidation(`That's a crowd of ${rawLines}. The limit is ${MAX_NAMES} names per draw.`, true);
    } else if (names.length < 2) {
      setValidation('Add at least two names to get started.', false);
    } else if (teamCount > names.length) {
      setValidation('You need at least one person for every team.', true);
    } else {
      const quotient = Math.floor(names.length / teamCount);
      const remainder = names.length % teamCount;
      const sizes = remainder ? `${remainder} team${remainder === 1 ? '' : 's'} will have ${quotient + 1}; the rest have ${quotient}.` : `That is ${quotient} people per team.`;
      setValidation(`${names.length} people · ${teamCount} teams. ${sizes}`, false);
    }

    if (resetResults) invalidateResults();
  }

  function shuffledTeams(names, teamCount) {
    const shuffled = names.map((name, index) => ({ name, originalIndex: index }));
    for (let index = shuffled.length - 1; index > 0; index -= 1) {
      const other = randomInt(index + 1);
      [shuffled[index], shuffled[other]] = [shuffled[other], shuffled[index]];
    }

    const teams = Array.from({ length: teamCount }, (_, index) => ({
      number: index + 1,
      members: [],
    }));
    // Deal the shuffled roster round-robin, keeping team sizes within one person.
    shuffled.forEach((person, index) => teams[index % teamCount].members.push(person.name));
    return teams;
  }

  function wait(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }

  async function animateNeedle() {
    if (reducedMotion) {
      meterNeedle.style.left = `${12 + randomInt(77)}%`;
      meterReadout.textContent = 'SHUFFLE COMPLETE';
      return;
    }
    const steps = 20;
    for (let step = 0; step < steps; step += 1) {
      meterNeedle.style.left = `${6 + randomInt(89)}%`;
      await wait(65 + Math.min(step, 10) * 7);
    }
    meterNeedle.style.left = `${12 + randomInt(77)}%`;
    await wait(160);
    meterReadout.textContent = 'SHUFFLE COMPLETE';
  }

  function renderResults(teams) {
    resultsGrid.replaceChildren();
    const fragment = document.createDocumentFragment();

    teams.forEach((team) => {
      const card = document.createElement('article');
      card.className = 'ts-team-card';
      const head = document.createElement('div');
      head.className = 'ts-team-card-head';
      const title = document.createElement('h3');
      title.className = 'ts-team-name';
      title.textContent = `Team ${String(team.number).padStart(2, '0')}`;
      const count = document.createElement('span');
      count.className = 'ts-team-size';
      count.textContent = `${team.members.length} ${team.members.length === 1 ? 'person' : 'people'}`;
      head.append(title, count);

      const list = document.createElement('ol');
      list.className = 'ts-team-members';
      team.members.forEach((name, memberIndex) => {
        const item = document.createElement('li');
        const number = document.createElement('span');
        number.className = 'ts-member-number';
        number.setAttribute('aria-hidden', 'true');
        number.textContent = String(memberIndex + 1).padStart(2, '0');
        const member = document.createElement('span');
        member.textContent = name;
        item.append(number, member);
        list.append(item);
      });
      card.append(head, list);
      fragment.append(card);
    });

    resultsGrid.append(fragment);
    const people = teams.reduce((sum, team) => sum + team.members.length, 0);
    resultsSummary.textContent = `${people} people · ${teams.length} teams · sizes differ by no more than one. No one gets to say you picked favorites. Technically.`;
    resultStamp.textContent = `DRAW #${String(drawNumber).padStart(2, '0')}`;
    resultsSection.hidden = false;
  }

  async function drawTeams({ scrollToResults = true } = {}) {
    if (isDrawing) return;
    const names = getNames();
    const teamCount = getTeamCount();
    if (names.length < 2 || names.length > MAX_NAMES || teamCount > names.length) {
      updateState({ resetResults: false });
      return;
    }

    isDrawing = true;
    updateState({ resetResults: false });
    drawButton.classList.add('is-pulled');
    drawButton.querySelector('.ts-pull-copy strong').textContent = 'THE FATE MACHINE IS THINKING';
    drawButton.querySelector('.ts-pull-copy small').textContent = 'PLEASE DO NOT LOBBY THE NEEDLE';
    machineStatus.textContent = 'SHUFFLING';
    machineStatus.className = 'ts-ready-state is-working';
    machineMessage.textContent = 'Mixing the roster. Any suspiciously good outcome is completely coincidental.';
    machineSymbol.textContent = '↻';
    machineSymbol.classList.add('is-spinning');
    meterReadout.textContent = 'SHUFFLING THE ROSTER';
    main.setAttribute('aria-busy', 'true');
    setValidation('The lever has been pulled. Please let the tiny machinery do its thing.', false);
    setFeedback('');

    try {
      const teams = shuffledTeams(names, teamCount);
      await animateNeedle();
      lastTeams = teams;
      drawNumber += 1;
      renderResults(teams);
      machineStatus.textContent = 'DRAW COMPLETE';
      machineStatus.className = 'ts-ready-state is-done';
      machineMessage.textContent = 'The teams have been decided. Appeal forms are not available.';
      machineSymbol.textContent = '✓';
      machineSymbol.classList.remove('is-spinning');
      drawButton.querySelector('.ts-pull-copy strong').textContent = 'PULL THE LEVER';
      drawButton.querySelector('.ts-pull-copy small').textContent = 'MAKE THE TEAMS';
      setValidation('Draw complete. Your list stayed right here in the browser.', false);
      if (scrollToResults) {
        resultsSection.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
      }
    } catch (error) {
      console.error('Team Splitter draw failed:', error);
      machineStatus.textContent = 'TRY AGAIN';
      machineStatus.className = 'ts-ready-state';
      machineMessage.textContent = 'The tiny machinery tripped over itself. Try that again.';
      machineSymbol.textContent = '↯';
      setValidation('Something interrupted the draw. Your names are still here; try again.', true);
    } finally {
      isDrawing = false;
      main.removeAttribute('aria-busy');
      drawButton.classList.remove('is-pulled');
      drawButton.querySelector('.ts-pull-copy strong').textContent = 'PULL THE LEVER';
      drawButton.querySelector('.ts-pull-copy small').textContent = 'MAKE THE TEAMS';
      updateState({ resetResults: false });
    }
  }

  function getShareText() {
    const lines = [
      'WHIMFATE · TEAM SPLITTER',
      'The teams are decided. The group chat may resume its usual nonsense.',
      ''
    ];
    lastTeams.forEach((team) => {
      lines.push(`TEAM ${String(team.number).padStart(2, '0')}`);
      team.members.forEach((name) => lines.push(`• ${name}`));
      lines.push('');
    });
    lines.push('Made with wimfate.com/team-splitter');
    return lines.join('\n');
  }

  async function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return;
    }
    const temporary = document.createElement('textarea');
    temporary.value = text;
    temporary.setAttribute('readonly', '');
    temporary.style.position = 'fixed';
    temporary.style.opacity = '0';
    temporary.style.pointerEvents = 'none';
    document.body.append(temporary);
    temporary.select();
    const successful = document.execCommand('copy');
    temporary.remove();
    if (!successful) throw new Error('Copy is not available in this browser.');
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

  async function createResultsImageBlob() {
    if (!lastTeams.length) throw new Error('Draw the teams first.');
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Image export is not available in this browser. Try Download image.');

    const width = 1200;
    const padding = 70;
    const columns = lastTeams.length > 4 ? 3 : 2;
    const gap = 22;
    const cardWidth = (width - padding * 2 - gap * (columns - 1)) / columns;
    const rows = Math.ceil(lastTeams.length / columns);
    const maxMembers = Math.max(...lastTeams.map((team) => team.members.length));
    const cardHeight = Math.max(150, 112 + maxMembers * 38);
    const headerHeight = 230;
    const rowGap = 22;
    const footerHeight = 74;
    const height = padding + headerHeight + rows * cardHeight + Math.max(0, rows - 1) * rowGap + footerHeight + padding;
    canvas.width = width;
    canvas.height = height;

    ctx.fillStyle = '#050506';
    ctx.fillRect(0, 0, width, height);
    const glow = ctx.createRadialGradient(width * .7, 90, 10, width * .7, 90, width * .65);
    glow.addColorStop(0, 'rgba(140, 95, 190, .22)');
    glow.addColorStop(1, 'rgba(5, 5, 6, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, width, Math.min(height, 350));

    ctx.fillStyle = '#8be9c7';
    ctx.font = '800 19px Manrope, sans-serif';
    ctx.letterSpacing = '3px';
    ctx.fillText('WHIMFATE · TEAM SPLITTER', padding, padding + 5);
    ctx.fillStyle = '#f8f4fb';
    ctx.font = '64px "Berkshire Swash", Georgia, serif';
    ctx.letterSpacing = '0px';
    ctx.fillText('The teams are decided.', padding, padding + 83);
    ctx.fillStyle = '#c8bfd0';
    ctx.font = '23px Manrope, sans-serif';
    ctx.fillText(`${lastTeams.reduce((sum, team) => sum + team.members.length, 0)} people · ${lastTeams.length} teams · no captains, no campaigning.`, padding, padding + 128);

    const colors = ['#d1b5ff', '#8be9c7', '#f3b5d9', '#a8caff'];
    const cardsTop = padding + headerHeight;
    lastTeams.forEach((team, index) => {
      const col = index % columns;
      const row = Math.floor(index / columns);
      const x = padding + col * (cardWidth + gap);
      const y = cardsTop + row * (cardHeight + rowGap);
      roundedRect(ctx, x, y, cardWidth, cardHeight, 3);
      ctx.fillStyle = '#0b0a0d';
      ctx.fill();
      ctx.strokeStyle = '#332c3b';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = colors[index % colors.length];
      ctx.font = '45px "Berkshire Swash", Georgia, serif';
      ctx.fillText(`Team ${String(team.number).padStart(2, '0')}`, x + 28, y + 53);
      ctx.fillStyle = '#9a91a4';
      ctx.font = '700 14px Manrope, sans-serif';
      ctx.fillText(`${team.members.length} ${team.members.length === 1 ? 'PERSON' : 'PEOPLE'}`, x + 28, y + 82);
      ctx.strokeStyle = '#29232f';
      ctx.beginPath();
      ctx.moveTo(x + 27, y + 99);
      ctx.lineTo(x + cardWidth - 27, y + 99);
      ctx.stroke();
      ctx.fillStyle = '#f5f1f8';
      ctx.font = '20px Manrope, sans-serif';
      team.members.forEach((name, memberIndex) => {
        const nameY = y + 132 + memberIndex * 38;
        ctx.fillStyle = '#a999bd';
        ctx.font = '800 14px Manrope, sans-serif';
        ctx.fillText(String(memberIndex + 1).padStart(2, '0'), x + 28, nameY);
        ctx.fillStyle = '#f5f1f8';
        ctx.font = '20px Manrope, sans-serif';
        const maxNameWidth = cardWidth - 87;
        let safeName = name;
        while (ctx.measureText(safeName).width > maxNameWidth && safeName.length > 4) safeName = `${safeName.slice(0, -4)}…`;
        ctx.fillText(safeName, x + 67, nameY);
      });
    });

    const footerY = height - padding + 4;
    ctx.fillStyle = '#a89eaf';
    ctx.font = '17px Manrope, sans-serif';
    ctx.fillText('Randomly shuffled. Reasonably balanced. Social consequences not included.', padding, footerY);
    ctx.fillStyle = '#c8a8ff';
    ctx.font = '800 17px Manrope, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('WIMFATE.COM', width - padding, footerY);
    ctx.textAlign = 'left';

    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Image export failed in this browser.')), 'image/png');
    });
  }

  async function downloadResultsImage() {
    if (!lastTeams.length) return;
    try {
      const blob = await createResultsImageBlob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `whimfate-teams-${new Date().toISOString().slice(0, 10)}.png`;
      document.body.append(link); link.click(); link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1500);
      setFeedback('Image saved. Drop it into the group chat and act surprised.');
    } catch (error) {
      setFeedback(error.message || 'Image export failed in this browser.');
    }
  }

  async function shareResultsImage() {
    if (!lastTeams.length) return;
    try {
      const blob = await createResultsImageBlob();
      const file = new File([blob], 'whimfate-teams.png', { type: 'image/png' });
      if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: 'Whimfate Team Splitter — the teams are decided',
          text: `${getShareText()}\nhttps://wimfate.com/team-splitter/`,
          files: [file]
        });
        setFeedback('The team card has been shared. Any complaints now go to the universe.');
      } else {
        setFeedback('This browser cannot send image files directly to social apps. Use Download image, then attach the PNG wherever you post.');
        document.querySelector('.wf-share-section')?.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'nearest' });
      }
    } catch (error) {
      if (error && error.name === 'AbortError') return;
      setFeedback(error.message || 'Image sharing is unavailable here. Use Download image instead.');
    }
  }

  async function shareResultsText() {
    if (!lastTeams.length) return;
    const text = getShareText();
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Whimfate Team Splitter', text, url: 'https://wimfate.com/team-splitter/' });
        setFeedback('Shared. Democracy has been temporarily suspended.');
      } else {
        await copyText(text);
        setFeedback('Result text copied. Pick a network below or paste it into the group chat.');
      }
    } catch (error) {
      if (error && error.name === 'AbortError') return;
      try { await copyText(text); setFeedback('Native share unavailable. Result text copied instead.'); }
      catch (_) { setFeedback('Could not share or copy the result in this browser.'); }
    }
  }

  async function shareTo(platform) {
    const url = 'https://wimfate.com/team-splitter/';
    const text = lastTeams.length ? `${getShareText()}\n${url}` : `Split a list into balanced random teams with Whimfate. ${url}`;
    const encodedText = encodeURIComponent(text);
    const encodedUrl = encodeURIComponent(url);
    const destinations = {
      whatsapp: `https://wa.me/?text=${encodeURIComponent(`${text}\n${url}`)}`,
      telegram: `https://t.me/share/url?url=${encodedUrl}&text=${encodedText}`,
      x: `https://twitter.com/intent/tweet?text=${encodedText}`,
      reddit: `https://www.reddit.com/submit?url=${encodedUrl}&title=${encodeURIComponent(lastTeams.length ? 'Whimfate teams are decided' : 'Random team generator — Whimfate')}`,
      facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`
    };
    const feedback = document.getElementById('ts-social-feedback');
    if (platform === 'copy-link') {
      try { await copyText(url); feedback.textContent = 'Link copied. Invite the group to let chance take the blame.'; }
      catch (_) { feedback.textContent = `Copy this link: ${url}`; }
      return;
    }
    if (platform === 'discord') {
      try { await copyText(text); feedback.textContent = 'Result text copied. Paste it in Discord; use Download image separately to attach the team card.'; }
      catch (_) { feedback.textContent = 'Copy failed. Use Share text or select the results manually.'; }
      return;
    }
    if (destinations[platform]) {
      window.open(destinations[platform], '_blank', 'noopener,noreferrer,width=760,height=640');
      feedback.textContent = lastTeams.length
        ? 'Share window opened with the team list and link. Use Download image separately if you want to attach the result card.'
        : 'Share window opened. Invite your friends to make some teams.';
    }
  }


  namesInput.addEventListener('input', () => updateState());
  teamCountInput.addEventListener('input', () => updateState());
  minusButton.addEventListener('click', () => {
    teamCountInput.value = String(Math.max(2, getTeamCount() - 1));
    updateState();
  });
  plusButton.addEventListener('click', () => {
    const maxTeams = Math.min(MAX_TEAMS, Math.max(2, getNames().length || MAX_TEAMS));
    teamCountInput.value = String(Math.min(maxTeams, getTeamCount() + 1));
    updateState();
  });
  exampleButton.addEventListener('click', () => {
    namesInput.value = exampleNames.join('\n');
    teamCountInput.value = '3';
    updateState();
    namesInput.focus();
    setValidation('Example roster loaded. Add or remove names before the grand reveal.', false);
  });
  clearButton.addEventListener('click', () => {
    namesInput.value = '';
    teamCountInput.value = '2';
    updateState();
    namesInput.focus();
  });
  drawButton.addEventListener('click', () => drawTeams());
  reshuffleButton.addEventListener('click', () => drawTeams({ scrollToResults: false }));
  copyButton.addEventListener('click', shareResultsText);
  shareButton.addEventListener('click', shareResultsImage);
  document.querySelectorAll('.wf-share-social-link[data-share]').forEach((button) => button.addEventListener('click', () => shareTo(button.dataset.share)));
  downloadButton.addEventListener('click', downloadResultsImage);

  // The shared footer points back to the homepage list; on this page, send people to the live module.
  document.querySelectorAll('.footer-play-grid a[href="/#team-splitter"]').forEach((link) => {
    link.setAttribute('href', '/team-splitter/');
  });

  updateState({ resetResults: false });
})();
