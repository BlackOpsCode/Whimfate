(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const canvas = $('coin-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d', { alpha: true });
  if (!ctx) return;

  const COIN_URL = 'https://wimfate.com/coin-flip/';
  const TAU = Math.PI * 2;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const els = {
    flip: $('flip-button'), result: $('coin-result'), subline: $('coin-result-subline'),
    heads: $('heads-count'), tails: $('tails-count'), flips: $('flip-count'),
    copy: $('copy-coin'), share: $('share-coin'), download: $('download-coin'), reset: $('reset-coin'),
    history: $('coin-history'), feedback: $('coin-feedback'), ready: $('coin-ready'),
    socialFeedback: $('coin-social-feedback')
  };

  let heads = 0, tails = 0, flips = 0, lastResult = '', lastVerdict = '', lastMessage = '', busy = false;
  let records = [], angle = 0, canvasW = 300, canvasH = 300, pixelRatio = 1, rafId = 0, settleTimer = 0;
  let messageConfig = null;
  let fallbackRecent = {};

  const FALLBACK_MESSAGES = {
    spin: ['Entropy has entered the chat.', 'The tiny oracle is buffering…', 'The universe is checking its notes.'],
    suspense: ['It has landed. The universe is clearing its throat…', 'The shiny verdict is being prepared…'],
    heads: ['Fate has spoken. Please do not request a recount.', 'HEADS. The meeting could have been a coin flip.'],
    tails: ['TAILS. Fate has a sense of humour.', 'The coin has spoken. It has not elaborated.'],
    share: ['A tiny circle has ended a massive debate.', 'Entropy did it. Do not look at me.'],
    verdictHeads: ['FATE HAS SPOKEN', 'THE ORACLE SAYS HEADS'],
    verdictTails: ['THE COIN HAS DECIDED', 'THE OTHER SIDE HAS SPOKEN'],
    shareHeaders: ['THE COIN HAS SPOKEN', 'A TINY COSMIC VERDICT']
  };

  const messagesReady = fetch('fate-messages.json', { cache: 'no-cache' })
    .then(response => { if (!response.ok) throw new Error('Message pack unavailable'); return response.json(); })
    .then(data => { messageConfig = data; return data; })
    .catch(() => { messageConfig = FALLBACK_MESSAGES; return FALLBACK_MESSAGES; });

  function randomUint32() {
    if (window.crypto?.getRandomValues) {
      const array = new Uint32Array(1);
      window.crypto.getRandomValues(array);
      return array[0];
    }
    return Math.floor(Math.random() * 0x100000000) >>> 0;
  }

  function randomBit() { return randomUint32() & 1; }

  // Rejection sampling avoids modulo bias when choosing an item from a message pool.
  function randomInt(max) {
    if (!Number.isSafeInteger(max) || max < 1) return 0;
    const span = 0x100000000;
    const limit = span - (span % max);
    let value;
    do { value = randomUint32(); } while (value >= limit);
    return value % max;
  }

  function hashString(value) {
    let hash = 2166136261;
    for (let i = 0; i < value.length; i++) {
      hash ^= value.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function pickMessage(bucket) {
    const pool = (messageConfig && Array.isArray(messageConfig[bucket]) && messageConfig[bucket].length)
      ? messageConfig[bucket] : FALLBACK_MESSAGES[bucket] || ['Fate has declined to elaborate.'];
    const storageKey = `whimfate-coin-recent-${bucket}`;
    let recent = fallbackRecent[bucket] || [];
    try {
      const parsed = JSON.parse(sessionStorage.getItem(storageKey) || '[]');
      if (Array.isArray(parsed)) recent = parsed.filter(n => Number.isInteger(n));
    } catch (_) {}
    const day = new Date().toISOString().slice(0, 10);
    const seed = hashString(`${day}|${bucket}|${flips}|${randomUint32()}`);
    const start = seed % pool.length;
    let picked = start;
    for (let i = 0; i < pool.length; i++) {
      const candidate = (start + i) % pool.length;
      if (!recent.includes(candidate)) { picked = candidate; break; }
    }
    recent = [picked, ...recent.filter(n => n !== picked)].slice(0, Math.min(10, pool.length - 1));
    fallbackRecent[bucket] = recent;
    try { sessionStorage.setItem(storageKey, JSON.stringify(recent)); } catch (_) {}
    return pool[picked];
  }

  function roundedRect(target, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    target.beginPath();
    target.moveTo(x + r, y);
    target.arcTo(x + width, y, x + width, y + height, r);
    target.arcTo(x + width, y + height, x, y + height, r);
    target.arcTo(x, y + height, x, y, r);
    target.arcTo(x, y, x + width, y, r);
    target.closePath();
  }


  function drawCoinArt(target, width, height, rotation, bounce = 0, options = {}) {
    const cx = width / 2;
    const radius = Math.min(width, height) * (options.radiusFactor || .345);
    const cy = (options.centerY == null ? height / 2 : options.centerY) + bounce;
    const ry = radius * .94;
    const cosine = Math.cos(rotation);
    const sine = Math.sin(rotation);
    const faceScale = Math.max(.025, Math.abs(cosine));
    const sideShow = Math.abs(sine);
    const thickness = radius * .13 * sideShow;
    const faceRx = radius * faceScale;
    const edgeRx = faceRx + thickness * .42 + radius * .018;

    if (options.clear !== false) target.clearRect(0, 0, width, height);

    // Aura and shadow are subtle on the live stage, more deliberate on the export card.
    const aura = target.createRadialGradient(cx, cy, radius * .12, cx, cy, radius * 1.5);
    aura.addColorStop(0, options.exportMode ? 'rgba(153,91,255,.30)' : 'rgba(146,77,255,.24)');
    aura.addColorStop(.55, options.exportMode ? 'rgba(92,42,175,.16)' : 'rgba(104,46,201,.10)');
    aura.addColorStop(1, 'rgba(104,46,201,0)');
    target.fillStyle = aura;
    target.beginPath(); target.ellipse(cx, cy, radius*1.48, radius*1.38, 0, 0, TAU); target.fill();

    const shadow = target.createRadialGradient(cx, cy + ry*.95, 1, cx, cy + ry*.95, radius*.92);
    shadow.addColorStop(0, 'rgba(0,0,0,.75)'); shadow.addColorStop(1, 'rgba(0,0,0,0)');
    target.fillStyle = shadow;
    target.beginPath(); target.ellipse(cx, cy + ry*.88, radius*.9, radius*.22, 0, 0, TAU); target.fill();

    // Ridged metal rim.
    const edge = target.createLinearGradient(cx-edgeRx, cy, cx+edgeRx, cy);
    edge.addColorStop(0, '#28103f'); edge.addColorStop(.2, '#b887ff'); edge.addColorStop(.45, '#6530a8');
    edge.addColorStop(.68, '#d8b7ff'); edge.addColorStop(.86, '#7b45c3'); edge.addColorStop(1, '#25103a');
    target.beginPath(); target.ellipse(cx, cy, edgeRx, ry+radius*.025, 0, 0, TAU);
    target.fillStyle = edge; target.fill();
    target.strokeStyle = 'rgba(245,229,255,.92)'; target.lineWidth = Math.max(1.5, radius*.015); target.stroke();

    if (faceScale < .52) {
      target.save();
      target.beginPath(); target.ellipse(cx, cy, edgeRx, ry+radius*.02, 0, 0, TAU); target.clip();
      target.strokeStyle = 'rgba(17,5,30,.62)'; target.lineWidth = Math.max(1, radius*.012);
      for (let y = cy-ry+radius*.05; y < cy+ry; y += radius*.065) {
        target.beginPath(); target.moveTo(cx-edgeRx-radius*.02, y); target.lineTo(cx+edgeRx+radius*.02, y); target.stroke();
      }
      target.restore();
    }

    // Coin face. Transforming the mint horizontally gives the illusion of turning in 3D.
    if (faceScale > .018) {
      target.save();
      target.translate(cx, cy); target.scale(faceScale, 1);
      const r = radius*.91;
      const face = target.createRadialGradient(-r*.32, -r*.42, r*.05, 0, 0, r*1.42);
      face.addColorStop(0, '#fff3ff'); face.addColorStop(.18, '#d8b7ff'); face.addColorStop(.48, '#9c5df0');
      face.addColorStop(.78, '#7134c6'); face.addColorStop(1, '#32124f');
      target.beginPath(); target.arc(0,0,r,0,TAU); target.fillStyle=face; target.fill();
      target.strokeStyle='#f0ddff'; target.lineWidth=Math.max(2, radius*.028); target.stroke();
      target.beginPath(); target.arc(0,0,r*.88,0,TAU); target.strokeStyle='rgba(39,12,70,.84)'; target.lineWidth=Math.max(1.5,r*.018); target.stroke();
      target.beginPath(); target.arc(0,0,r*.81,0,TAU); target.strokeStyle='rgba(247,235,255,.48)'; target.lineWidth=Math.max(1,r*.011); target.stroke();

      target.save();
      target.beginPath(); target.arc(0,0,r*.78,0,TAU); target.clip();
      const shine = target.createLinearGradient(-r,-r,r*.65,r*.8);
      shine.addColorStop(0,'rgba(255,255,255,.32)'); shine.addColorStop(.35,'rgba(255,255,255,.055)'); shine.addColorStop(1,'rgba(255,255,255,0)');
      target.fillStyle=shine; target.fillRect(-r,-r,2*r,2*r); target.restore();

      // Both sides use the same clean mint: only the label changes.
      // Large, centered type stays readable while the face is compressed during a flip.
      const faceLabel = cosine >= 0 ? 'HEADS' : 'TAILS';
      target.textAlign = 'center';
      target.textBaseline = 'middle';
      target.fillStyle = '#fff8ff';
      target.shadowColor = 'rgba(38, 12, 66, .35)';
      target.shadowBlur = r * .035;
      target.font = `900 ${r * .30}px Manrope, sans-serif`;
      if ('letterSpacing' in target) target.letterSpacing = `${r * .012}px`;
      target.fillText(faceLabel, 0, r * .025);
      target.shadowBlur = 0;
      target.restore();
    }
  }

  function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    canvasW = rect.width || 300;
    canvasH = rect.height || canvasW;
    pixelRatio = Math.min(window.devicePixelRatio || 1, 2.5);
    const backingW = Math.max(1, Math.round(canvasW * pixelRatio));
    const backingH = Math.max(1, Math.round(canvasH * pixelRatio));
    if (canvas.width !== backingW) canvas.width = backingW;
    if (canvas.height !== backingH) canvas.height = backingH;
    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    drawCoinArt(ctx, canvasW, canvasH, angle, 0, { radiusFactor: .395 });
  }

  function refreshStats() {
    els.heads.textContent = heads;
    els.tails.textContent = tails;
    els.flips.textContent = flips;
  }

  function renderHistory() {
    els.history.replaceChildren();
    if (!records.length) {
      const empty = document.createElement('p'); empty.className='game-empty';
      empty.textContent='Nothing flipped yet. The coin is very patient.'; els.history.append(empty); return;
    }
    records.slice(0, 8).forEach((record, index) => {
      const item=document.createElement('div'); item.className=`coin-history-item${record.result==='TAILS'?' is-tails':''}`;
      const dot=document.createElement('span'); dot.className='coin-history-dot'; dot.setAttribute('aria-hidden','true');
      const label=document.createElement('span'); label.textContent=`#${flips-index} · ${record.result}`;
      item.append(dot,label); els.history.append(item);
    });
  }

  function getShareText(shareLine = pickMessage('share')) {
    if (!lastResult) return `A tiny cosmic decision awaits. Flip your fate: ${COIN_URL}`;
    return `WHIMFATE COIN FLIP\n${lastVerdict} — ${lastResult}\n${lastMessage}\n${shareLine}\nFlip your own: ${COIN_URL} #Whimfate`;
  }

  async function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
    const area=document.createElement('textarea'); area.value=text; area.readOnly=true;
    area.style.cssText='position:fixed;left:-9999px;top:0;opacity:0'; document.body.append(area); area.select();
    const ok=document.execCommand('copy'); area.remove(); if (!ok) throw new Error('Copy failed');
  }

  function wrapCanvasText(target, text, x, y, maxWidth, lineHeight, maxLines=3) {
    const words = String(text || '').split(/\s+/);
    const lines = []; let line = '';
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (target.measureText(test).width > maxWidth && line) { lines.push(line); line = word; }
      else line = test;
    }
    if (line) lines.push(line);
    let visible = lines.slice(0, maxLines);
    if (lines.length > maxLines) {
      let last = visible[maxLines-1];
      while (last && target.measureText(`${last}…`).width > maxWidth) last = last.slice(0,-1);
      visible[maxLines-1] = `${last.trimEnd()}…`;
    }
    visible.forEach((ln, index) => target.fillText(ln, x, y + index*lineHeight));
    return visible.length;
  }

  async function makeResultCard(shareLine = pickMessage('share')) {
    if (!lastResult) throw new Error('Flip the coin first.');
    try { await document.fonts.ready; } catch (_) {}
    try { await document.fonts.load('400 150px "Berkshire Swash"'); } catch (_) {}

    const card=document.createElement('canvas');
    card.width=1200; card.height=1500;
    const g=card.getContext('2d');
    if (!g) throw new Error('Image export is unavailable in this browser.');
    g.fillStyle='#050506'; g.fillRect(0,0,card.width,card.height);

    const topGlow=g.createRadialGradient(600,420,20,600,420,760);
    topGlow.addColorStop(0,'rgba(83,43,133,.22)'); topGlow.addColorStop(.52,'rgba(40,20,67,.12)'); topGlow.addColorStop(1,'rgba(5,5,6,0)');
    g.fillStyle=topGlow; g.fillRect(0,0,1200,1500);
    const edgeGlow=g.createRadialGradient(600,1180,10,600,1180,620);
    edgeGlow.addColorStop(0,'rgba(95,43,142,.11)'); edgeGlow.addColorStop(1,'rgba(0,0,0,0)');
    g.fillStyle=edgeGlow; g.fillRect(0,0,1200,1500);

    g.textAlign='center'; g.textBaseline='middle';
    g.fillStyle='#c8a8ff'; g.font='800 22px Manrope, sans-serif';
    if ('letterSpacing' in g) g.letterSpacing='5px';
    const header = pickMessage('shareHeaders');
    g.fillText(header,600,105);
    g.fillStyle='#f7f2ff'; g.font='400 72px "Berkshire Swash", cursive';
    if ('letterSpacing' in g) g.letterSpacing='0px';
    g.fillText('Whimfate',600,190);
    g.fillStyle='#a99bb8'; g.font='700 18px Manrope, sans-serif';
    if ('letterSpacing' in g) g.letterSpacing='2px';
    g.fillText('A PURPLE COIN · A VERY OFFICIAL UNOFFICIAL VERDICT',600,246);

    drawCoinArt(g,1200,1500,angle,0,{radiusFactor:.255,centerY:625,exportMode:true,clear:false});

    g.textAlign='center'; g.textBaseline='middle';
    g.fillStyle=lastResult==='HEADS'?'#d8bdff':'#a5efd4';
    g.font='800 25px Manrope, sans-serif';
    if ('letterSpacing' in g) g.letterSpacing='7px';
    g.fillText(lastResult,600,975);
    g.fillStyle='#f7f2ff'; g.font='400 53px "Berkshire Swash", cursive';
    if ('letterSpacing' in g) g.letterSpacing='0px';
    wrapCanvasText(g,lastVerdict,600,1040,1010,58,2);
    g.fillStyle='#cfc2df'; g.font='600 23px Manrope, sans-serif';
    wrapCanvasText(g,lastMessage,600,1155,950,32,2);
    g.fillStyle='#b9adca'; g.font='500 21px Manrope, sans-serif';
    wrapCanvasText(g,shareLine,600,1260,940,30,2);

    g.fillStyle='#93869f'; g.font='800 19px Manrope, sans-serif';
    if ('letterSpacing' in g) g.letterSpacing='4px';
    g.fillText('WIMFATE.COM',600,1410);
    g.fillStyle='#635b6c'; g.font='500 17px Manrope, sans-serif';
    if ('letterSpacing' in g) g.letterSpacing='1px';
    g.fillText('THE FATE IS SEALED · wimfate.com/coin-flip/',600,1450);
    return card;
  }

  function canvasToBlob(card) {
    return new Promise((resolve,reject) => card.toBlob(blob => blob ? resolve(blob) : reject(new Error('Could not create a PNG card.')), 'image/png'));
  }

  function downloadBlob(blob, filename) {
    const url=URL.createObjectURL(blob); const a=document.createElement('a');
    a.href=url; a.download=filename; a.style.display='none'; document.body.append(a); a.click(); a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  async function downloadResultCard(silent=false, shareLine) {
    const card=await makeResultCard(shareLine || pickMessage('share')); const blob=await canvasToBlob(card);
    downloadBlob(blob,`whimfate-coin-${(lastResult||'flip').toLowerCase()}.png`);
    if (!silent) els.feedback.textContent='High-res result card downloaded. The coin insists on being shared.';
    return blob;
  }

  async function shareResult() {
    if (!lastResult || busy) return;
    els.share.disabled = true;
    try {
      const shareLine = pickMessage('share');
      const card = await makeResultCard(shareLine);
      const blob = await canvasToBlob(card);
      const file = new File([blob], `whimfate-coin-${lastResult.toLowerCase()}.png`, { type: 'image/png' });
      if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: `Whimfate Coin Flip — ${lastResult}`,
          text: getShareText(shareLine),
          files: [file]
        });
        els.feedback.textContent = 'The coin card has been dispatched. Fate accepts no appeals.';
      } else {
        els.feedback.textContent = 'This browser cannot send image files directly to social apps. Use Download image, then attach the PNG wherever you post.';
        els.socialFeedback.textContent = 'Choose a network to share the text and link. Download the image separately to attach the actual coin card.';
        document.querySelector('.wf-share-section')?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'nearest' });
      }
    } catch (error) {
      if (error?.name === 'AbortError') return;
      els.feedback.textContent = 'Image sharing was unavailable. Use Download image to save the coin card.';
    } finally {
      els.share.disabled = false;
    }
  }

  function openShareWindow(url) {
    // Open synchronously during the click so browser popup blockers are less likely to interfere.
    window.open(url,'_blank','noopener,noreferrer');
  }

  async function shareTo(platform) {
    const shareLine=lastResult ? pickMessage('share') : '';
    const text=getShareText(shareLine || undefined);
    let url='';
    if (platform==='x') url=`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
    else if (platform==='telegram') url=`https://t.me/share/url?url=${encodeURIComponent(COIN_URL)}&text=${encodeURIComponent(text)}`;
    else if (platform==='reddit') url=`https://www.reddit.com/submit?url=${encodeURIComponent(COIN_URL)}&title=${encodeURIComponent(lastResult?`${lastResult} — Whimfate Coin Flip`:'Let fate decide')}`;
    else if (platform==='whatsapp') url=`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
    else if (platform==='facebook') url=`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(COIN_URL)}&quote=${encodeURIComponent(text)}`;
    if (platform==='discord') {
      openShareWindow('https://discord.com/app');
      try { await copyText(text); }
      catch (_) { /* the caption remains available via Share text */ }
      els.socialFeedback.textContent='Caption copied. Paste it in Discord; use Download image separately if you want the coin card.';
      return;
    }
    if (platform==='copy') {
      try { await copyText(COIN_URL); els.socialFeedback.textContent='Link copied. Go forth and end a debate.'; }
      catch (_) { els.socialFeedback.textContent=`Copy this link: ${COIN_URL}`; }
      return;
    }
    openShareWindow(url);
    if (lastResult) {
      els.socialFeedback.textContent='Share window opened with the result text and link. Use Download image separately if you want to attach the coin card.';
    } else {
      els.socialFeedback.textContent='Share window opened. Flip first to create a result card worth arguing about.';
    }
  }

  function finish(next) {
    lastResult=next;
    lastVerdict=pickMessage(next==='HEADS'?'verdictHeads':'verdictTails');
    lastMessage=pickMessage(next==='HEADS'?'heads':'tails');
    flips++;
    if (next==='HEADS') heads++; else tails++;
    records.unshift({result:next}); records=records.slice(0,8);
    els.result.textContent=lastVerdict;
    els.subline.textContent=`${next} · ${lastMessage}`;
    canvas.setAttribute('aria-label',next==='HEADS'
      ? 'Purple coin landed on heads. The face is clearly marked HEADS.'
      : 'Purple coin landed on tails. The face is clearly marked TAILS.');
    refreshStats(); renderHistory();
    els.copy.disabled=false; els.share.disabled=false; els.download.disabled=false; els.flip.disabled=false;
    els.ready.textContent='VERDICT'; els.ready.classList.remove('is-flipping');
    busy=false; els.feedback.textContent='';
    console.info(`[Whimfate Coin Flip] ${next} — ${lastMessage}`);
  }

  async function flip() {
    if (busy) return;
    busy=true; els.flip.disabled=true; els.copy.disabled=true; els.share.disabled=true; els.download.disabled=true;
    els.ready.textContent='IN FLIGHT'; els.ready.classList.add('is-flipping');
    els.feedback.textContent=pickMessage('spin');
    els.result.textContent='THE COIN IS AIRBORNE';
    els.subline.textContent='Entropy is writing the minutes…';
    await messagesReady;
    const next=randomBit()===0?'HEADS':'TAILS';
    const targetPhase=next==='HEADS'?0:Math.PI;
    const turns=6+randomInt(4);
    const startAngle=angle;
    let endAngle=Math.ceil((startAngle+turns*TAU-targetPhase)/TAU)*TAU+targetPhase;
    if (endAngle<startAngle+5*TAU) endAngle+=TAU;

    if (reduceMotion) {
      angle=endAngle; drawCoinArt(ctx,canvasW,canvasH,angle,0,{radiusFactor:.395});
      els.feedback.textContent=pickMessage('suspense');
      settleTimer=window.setTimeout(()=>finish(next),320);
      return;
    }

    const started=performance.now();
    const duration=2350+randomInt(451);
    const animate=(now)=>{
      const progress=Math.min(1,(now-started)/duration);
      const eased=1-Math.pow(1-progress,4.0);
      angle=startAngle+(endAngle-startAngle)*eased;
      const bounce=Math.sin(progress*Math.PI*7.2)*(1-progress)*canvasH*.035;
      drawCoinArt(ctx,canvasW,canvasH,angle,bounce,{radiusFactor:.395});
      if (progress<1) rafId=window.requestAnimationFrame(animate);
      else {
        angle=endAngle; drawCoinArt(ctx,canvasW,canvasH,angle,0,{radiusFactor:.395}); rafId=0;
        els.feedback.textContent=pickMessage('suspense');
        els.ready.textContent='LANDED';
        // The coin lands first; the verdict waits an extra beat for a little drama.
        settleTimer=window.setTimeout(()=>finish(next),760);
      }
    };
    rafId=window.requestAnimationFrame(animate);
  }

  els.flip.addEventListener('click',flip);
  els.copy.addEventListener('click',async()=>{
    if (!lastResult) return;
    const text = getShareText();
    try {
      if (navigator.share) {
        await navigator.share({ title: `Whimfate Coin Flip — ${lastResult}`, text, url: COIN_URL });
        els.feedback.textContent = 'Verdict shared. The group chat may now proceed.';
      } else {
        await copyText(text);
        els.feedback.textContent = 'Result text copied. Pick a network below or paste it into the group chat.';
        els.socialFeedback.textContent = 'Result text copied. Choose a network below to open its share composer.';
      }
    } catch (error) {
      if (error?.name === 'AbortError') return;
      try { await copyText(text); els.feedback.textContent='Native share unavailable. Result text copied instead.'; }
      catch (_) { els.feedback.textContent='Could not share or copy the result in this browser.'; }
    }
  });
  els.share.addEventListener('click',shareResult);
  els.download.addEventListener('click',async()=>{
    if (!lastResult || busy) return;
    els.download.disabled=true;
    try { await downloadResultCard(); }
    catch (_) { els.feedback.textContent='Could not export the PNG in this browser.'; }
    finally { els.download.disabled=false; }
  });
  els.reset.addEventListener('click',()=>{
    if (busy) return;
    heads=0; tails=0; flips=0; lastResult=''; lastVerdict=''; lastMessage=''; records=[]; angle=0;
    drawCoinArt(ctx,canvasW,canvasH,angle,0,{radiusFactor:.395});
    canvas.setAttribute('aria-label','Purple coin showing HEADS on one side and TAILS on the other.');
    els.result.textContent='The universe is waiting for your input.';
    els.subline.textContent='No pressure. It\'s only the timeline.';
    els.copy.disabled=true; els.share.disabled=true; els.download.disabled=true;
    els.ready.textContent='READY'; els.ready.classList.remove('is-flipping');
    refreshStats(); renderHistory(); els.feedback.textContent='Stats reset. The coin has a clean slate.';
  });
  document.querySelectorAll('[data-share]').forEach(button=>button.addEventListener('click',()=>shareTo(button.dataset.share)));
  window.addEventListener('resize',resizeCanvas,{passive:true});
  if ('ResizeObserver' in window) new ResizeObserver(resizeCanvas).observe(canvas);
  if (document.fonts?.ready) document.fonts.ready.then(resizeCanvas).catch(()=>{});
  resizeCanvas(); refreshStats(); renderHistory();
})();
