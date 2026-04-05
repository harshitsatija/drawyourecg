(() => {
  'use strict';

  const HASH = {
    '#normal': 'normal',
    '#atrial-fibrillation': 'atrialFibrillation',
    '#atrial-flutter': 'atrialFlutter',
    '#av-block': 'avBlock',
    '#ventricular-tachycardia': 'ventricularTachycardia',
  };

  const INFO = {
    normal:                  { name: 'Normal Sinus Rhythm',      desc: 'The <strong>P wave</strong> marks atrial depolarization. The <strong>T wave</strong> marks ventricular repolarization, and the <strong>QT interval</strong> shows ventricular depolarization.<br><br><strong>PR interval:</strong> 120–200 ms &bull; <strong>QRS:</strong> up to 120 ms &bull; <strong>QT:</strong> up to 440 ms' },
    atrialFibrillation:      { name: 'Atrial Fibrillation',      desc: '<strong>Atrial fibrillation</strong> — disorganized, rapid, irregular atrial activation.<br><br>&bull; Irregularly irregular R-R intervals<br>&bull; No distinct P waves<br>&bull; Fibrillatory baseline<br>&bull; Variable ventricular rate' },
    atrialFlutter:           { name: 'Atrial Flutter',            desc: '<strong>Atrial flutter</strong> — characteristic sawtooth pattern.<br><br>&bull; Regular atrial activity ~300 bpm<br>&bull; Sawtooth F waves<br>&bull; Usually 2:1 conduction<br>&bull; Ventricular rate ~150 bpm' },
    avBlock:                 { name: 'AV Block (3rd Degree)',     desc: '<strong>Complete heart block</strong> — atria and ventricles beat independently.<br><br>&bull; P waves and QRS dissociated<br>&bull; Regular P-P and R-R intervals<br>&bull; No P-QRS relationship' },
    ventricularTachycardia:  { name: 'Ventricular Tachycardia',  desc: '<strong>V-Tach</strong> — rapid rhythm from ventricles, wide QRS complexes.<br><br>&bull; Wide QRS (>120 ms)<br>&bull; Rate 150–300 bpm<br>&bull; Regular rhythm<br>&bull; AV dissociation possible' },
  };

  const VB = { x: 0, y: 350, w: 1100, h: 500 };
  // Split mode offsets — same as the original
  const SPLIT_TX = [0, -320, -160, 160, 320]; // g, g1, g2, g3, g4

  // Per-rhythm split mode config (from the original code)
  // animateCenter: whether #g gets animated in split mode
  // animateHearts: which numbered hearts (1-4) get animated
  // splitDuration: animation duration in split mode
  const SPLIT_CFG = {
    normal:                 { splitDuration: 1000, animateCenter: true,  animateHearts: [1,2,3,4] },
    atrialFibrillation:     { splitDuration: 400,  animateCenter: true,  animateHearts: [1,2,3,4] },
    atrialFlutter:          { splitDuration: 2000, animateCenter: true,  animateHearts: [1,2,3,4] },
    avBlock:                { splitDuration: 2000, animateCenter: true,  animateHearts: [1,3] },      // only g1 & g3 animate
    ventricularTachycardia: { splitDuration: 600,  animateCenter: false, animateHearts: [1,2,3,4] },
  };

  let combinedAnims = [];
  let splitAnims = [];
  let drawing = false;
  let activeHandle = 0;
  let pts1 = [], pts2 = [];
  let isSplit = false;

  const $ = s => document.querySelector(s);
  const getKey = () => HASH[location.hash] || 'normal';
  const wrap = a => a.map(v => ({ value: v }));

  // ── Animation helpers ──────────────────────
  function runAnims(configs) {
    const out = [];
    if (!configs) return out;
    Object.values(configs).forEach(cfg => {
      if (!cfg || !cfg.target || cfg.commentedOut) return;
      if (!document.querySelector(cfg.target)) return;
      const o = { targets: cfg.target, easing: cfg.easing || 'easeOutQuad', duration: cfg.duration || 2000, loop: cfg.loop !== false };
      if (cfg.d) o.d = wrap(cfg.d);
      if (cfg.cx) { o.cx = wrap(cfg.cx); o.cy = wrap(cfg.cy); o.r = wrap(cfg.r); }
      try { out.push(anime(o)); } catch (_) {}
    });
    return out;
  }

  function clearAnims(arr) {
    arr.forEach(a => { a.pause(); try { anime.remove(a.animatables.map(x => x.target)); } catch (_) {} });
    arr.length = 0;
  }

  // ── Combined mode ──────────────────────────
  function startCombined(rhythm) {
    clearAnims(combinedAnims);
    clearAnims(splitAnims);
    isSplit = false;

    // Show #g, hide g1–g4
    anime({ targets: '#g', opacity: 1, translateX: 0, duration: 400, easing: 'easeOutQuad' });
    ['#g1','#g2','#g3','#g4'].forEach(s => anime({ targets: s, opacity: 0, translateX: 0, duration: 400, easing: 'easeOutQuad' }));
    [1,2,3,4].forEach(i => { const el = document.querySelector('#sepline'+i); if (el) el.setAttribute('opacity','0'); });

    // Reset all circles to their default position
    document.querySelectorAll('[id^="right"], [id^="left"]').forEach(el => {
      el.setAttribute('cx', '498.51');
      el.setAttribute('cy', '116.47');
      el.setAttribute('r', '0.24');
    });

    // Start combined heart animation
    combinedAnims = runAnims(rhythm.animations);
  }

  // ── Split mode ─────────────────────────────
  // Each heart (including #g) shows a DIFFERENT 2-keyframe phase
  // of the cardiac cycle at 1000ms, matching the original behavior.
  //
  // From the original code, the 8 combined keyframes are distributed:
  //   g1 (heart1): frames 1,2   — early contraction
  //   g2 (heart2): frames 2,3   — mid contraction
  //   g  (center): frames 3,4   — peak contraction
  //   g3 (heart3): frames 4,5   — early relaxation
  //   g4 (heart4): frames 6,7   — late relaxation/recovery
  //
  // Mapping: [g1, g2, g(center), g3, g4] → frame offsets [1, 2, 3, 4, 6]
  function pickTwo(arr, startIdx) {
    const n = arr.length;
    if (n <= 2) return arr.slice();
    const i = Math.min(startIdx, n - 2);
    return [arr[i], arr[i + 1]];
  }

  // Which frame offset each heart uses: g1→1, g2→2, g→3, g3→4, g4→6
  const SPLIT_FRAME_OFFSETS = {
    1: 1, // g1
    2: 2, // g2
    0: 3, // g (combined, center heart)
    3: 4, // g3
    4: 6, // g4
  };

  function startSplit(rhythm, rhythmKey) {
    clearAnims(combinedAnims);
    clearAnims(splitAnims);
    isSplit = true;

    const cfg = SPLIT_CFG[rhythmKey] || SPLIT_CFG.normal;
    const anims = rhythm.animations || {};
    const nFrames = anims['#ventri'] ? anims['#ventri'].d.length : 8;

    // Show all groups spread apart
    ['#g','#g1','#g2','#g3','#g4'].forEach((s, i) => {
      anime({ targets: s, opacity: 1, translateX: SPLIT_TX[i], duration: 500, easing: 'easeOutQuad' });
    });

    // Show separation lines
    [1,2,3,4].forEach(i => anime({ targets: '#sepline'+i, opacity: 1, duration: 300, easing: 'easeOutQuad' }));

    // Build the list of hearts to animate: [heartNum, frameOffset]
    // heartNum 0 = #g (center), 1-4 = #g1-#g4
    const heartsToAnimate = [];

    // Add numbered hearts
    cfg.animateHearts.forEach((h, idx) => {
      // Distribute frame offsets evenly across available keyframes
      const offset = Math.floor((idx / cfg.animateHearts.length) * nFrames);
      heartsToAnimate.push([h, offset]);
    });

    // Add center heart if configured
    if (cfg.animateCenter) {
      // Center gets a mid-point offset
      const centerOffset = Math.floor(nFrames * 0.4);
      heartsToAnimate.push([0, centerOffset]);
    }

    // Animate each heart
    heartsToAnimate.forEach(([h, frameOffset]) => {
      const suffix = h === 0 ? '' : String(h);

      Object.values(anims).forEach(src => {
        if (!src || !src.target || src.commentedOut) return;
        const target = src.target + suffix;
        if (!document.querySelector(target)) return;

        const o = {
          targets: target,
          easing: src.easing || 'easeOutQuad',
          duration: cfg.splitDuration,
          loop: true,
        };

        if (src.d) {
          o.d = wrap(pickTwo(src.d, frameOffset));
        }
        if (src.cx) {
          const cxSlice = pickTwo(src.cx, frameOffset);
          const cySlice = pickTwo(src.cy, frameOffset);
          const rSlice  = pickTwo(src.r,  frameOffset);
          o.cx = wrap(cxSlice);
          o.cy = wrap(cySlice);
          o.r  = wrap(rSlice);
          // Set circle initial position to its phase start
          const el = document.querySelector(target);
          if (el) {
            el.setAttribute('cx', cxSlice[0]);
            el.setAttribute('cy', cySlice[0]);
            el.setAttribute('r', rSlice[0]);
          }
        }

        try { splitAnims.push(anime(o)); } catch (_) {}
      });
    });
  }

  // ── Drawing strip ──────────────────────────
  function setupStrip(rhythm) {
    const svg = d3.select('#stripSvg');
    svg.selectAll('*').remove();

    // ECG grid
    const g = svg.append('g');
    for (let x = VB.x; x <= VB.x + VB.w; x += 20) {
      g.append('line').attr('class', (x - VB.x) % 100 === 0 ? 'grid-bold' : 'grid-line')
        .attr('x1', x).attr('y1', VB.y).attr('x2', x).attr('y2', VB.y + VB.h);
    }
    for (let y = VB.y; y <= VB.y + VB.h; y += 20) {
      g.append('line').attr('class', (y - VB.y) % 100 === 0 ? 'grid-bold' : 'grid-line')
        .attr('x1', VB.x).attr('y1', y).attr('x2', VB.x + VB.w).attr('y2', y);
    }

    // Reference waveform
    const bands = rhythm.defaultBands || {};
    ['defaultband','defaultband2','defaultband3'].forEach(k => {
      if (bands[k]) svg.append('path').attr('class', 'ref-wave').attr('d', bands[k]).attr('fill', 'none');
    });

    // Answer lines (hidden)
    const lines = rhythm.defaultLines || {};
    if (lines.defaultline) svg.append('path').attr('id', 'ansLine1').attr('class', 'answer').attr('d', lines.defaultline.initial).attr('fill', 'none');
    if (lines.defaultline2) svg.append('path').attr('id', 'ansLine2').attr('class', 'answer').attr('d', lines.defaultline2.initial).attr('fill', 'none');

    // Drawn paths
    svg.append('path').attr('id', 'drawnPath1').attr('class', 'drawn').attr('d', '').attr('fill', 'none');
    svg.append('path').attr('id', 'drawnPath2').attr('class', 'drawn').attr('d', '').attr('fill', 'none');

    // Handles
    const drag = rhythm.dragPositions || {};
    const d1 = drag.drag1 || { cx:'176.5', cy:'570' };
    const d2 = drag.drag2 || { cx:'525.5', cy:'588' };
    const h1x = +d1.cx, h1y = +d1.cy, h2x = +d2.cx, h2y = +d2.cy;

    const dot1 = svg.append('circle').attr('class','start-dot').attr('cx',h1x).attr('cy',h1y).attr('r',10)
      .attr('fill', rhythm.color||'#449364').attr('stroke','#fff').attr('stroke-width',2);
    const dot2 = svg.append('circle').attr('class','start-dot').attr('cx',h2x).attr('cy',h2y).attr('r',10)
      .attr('fill', rhythm.color||'#449364').attr('stroke','#fff').attr('stroke-width',2);

    const lineGen = d3.line().x(d=>d[0]).y(d=>d[1]).curve(d3.curveCatmullRom.alpha(0.5));
    const svgEl = document.getElementById('stripSvg');
    const MIN_DIST = 2.5;

    function toSVG(evt) {
      const pt = svgEl.createSVGPoint();
      pt.x = evt.clientX; pt.y = evt.clientY;
      return pt.matrixTransform(svgEl.getScreenCTM().inverse());
    }

    function beginDraw(handle, hx, hy) {
      d3.event.preventDefault();
      drawing = true; activeHandle = handle;
      if (handle === 1) { pts1 = [[hx,hy]]; d3.select('#drawnPath1').attr('d',''); }
      else              { pts2 = [[hx,hy]]; d3.select('#drawnPath2').attr('d',''); }
    }

    dot1.on('mousedown', () => { beginDraw(1,h1x,h1y); dot1.attr('opacity',0.3); });
    dot2.on('mousedown', () => { beginDraw(2,h2x,h2y); dot2.attr('opacity',0.3); });

    svg.on('mousemove', function() {
      if (!drawing) return;
      d3.event.preventDefault();
      const s = toSVG(d3.event);
      const p = [s.x, s.y];
      const arr = activeHandle === 1 ? pts1 : pts2;
      const last = arr[arr.length-1];
      if (Math.hypot(p[0]-last[0], p[1]-last[1]) >= MIN_DIST) {
        arr.push(p);
        d3.select(activeHandle===1 ? '#drawnPath1' : '#drawnPath2').attr('d', lineGen(arr));
      }
    });

    function endDraw() {
      if (!drawing) return;
      drawing = false; activeHandle = 0;
      if (pts1.length > 3 || pts2.length > 3) $('#btnCheck').style.display = 'inline-block';
    }
    svg.on('mouseup', endDraw);
    svg.on('mouseleave', endDraw);
  }

  // ── Reveal / Reset ─────────────────────────
  function reveal(rhythm) {
    const lines = rhythm.defaultLines || {};
    if (lines.defaultline) d3.select('#ansLine1').transition().duration(600).attr('d', lines.defaultline.transition||lines.defaultline.initial).style('opacity',1);
    if (lines.defaultline2) d3.select('#ansLine2').transition().duration(600).attr('d', lines.defaultline2.transition||lines.defaultline2.initial).style('opacity',1);
    drawing = false;
  }

  function reset(rhythm) {
    drawing = false; pts1 = []; pts2 = [];
    d3.select('#drawnPath1').attr('d','');
    d3.select('#drawnPath2').attr('d','');
    d3.select('#ansLine1').style('opacity',0);
    d3.select('#ansLine2').style('opacity',0);
    const lines = rhythm.defaultLines || {};
    if (lines.defaultline) d3.select('#ansLine1').attr('d', lines.defaultline.initial);
    if (lines.defaultline2) d3.select('#ansLine2').attr('d', lines.defaultline2.initial);
    d3.selectAll('.start-dot').attr('opacity',1);
    $('#btnCheck').style.display = 'none';
  }

  const PARAMS = {
    normal:                 { params: [['PR Interval','120-200','ms'],['QRS Complex','<120','ms'],['QTc Interval','360-440','ms'],['Heart Rate','60-100','bpm']], insight: 'The P wave should be upright in leads I, II, and aVF for normal sinus rhythm.' },
    atrialFibrillation:     { params: [['Rhythm','Irregularly','irregular'],['P Waves','Absent','—'],['Baseline','Fibrillatory','—'],['Vent. Rate','Variable','bpm']], insight: 'Look for the absence of organized P waves and an irregularly irregular rhythm.' },
    atrialFlutter:          { params: [['Atrial Rate','~300','bpm'],['F Waves','Sawtooth','pattern'],['Conduction','2:1','ratio'],['Vent. Rate','~150','bpm']], insight: 'The sawtooth flutter waves are best seen in leads II, III, aVF, and V1.' },
    avBlock:                { params: [['P-QRS','Dissociated','—'],['P-P Interval','Regular','—'],['R-R Interval','Regular','—'],['Vent. Rate','25-40','bpm']], insight: 'In complete heart block, the atria and ventricles beat completely independently.' },
    ventricularTachycardia: { params: [['QRS Width','>120','ms'],['Rate','150-300','bpm'],['Rhythm','Regular','—'],['AV Dissoc.','Possible','—']], insight: 'Wide complex tachycardia should be treated as V-Tach until proven otherwise.' },
  };

  // ── UI ─────────────────────────────────────
  function updateUI(k, rhythm) {
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('on', t.dataset.k === k));
    const info = INFO[k] || {};
    $('#rName').textContent = info.name || k;
    $('#rDesc').innerHTML = info.desc || '';
    document.body.style.setProperty('--accent', rhythm.color || '#449364');
    document.body.style.setProperty('--primary', rhythm.color || '#5eead4');
    $('#btnCheck').style.display = 'none';
    $('#bFull').classList.add('on');
    $('#bSplit').classList.remove('on');

    // Update sidebar params
    const p = PARAMS[k] || PARAMS.normal;
    const paramList = $('#paramList');
    if (paramList) {
      paramList.innerHTML = p.params.map((r, i) =>
        `<div class="param-item${i===0?' first':''}"><div class="param-label">${r[0]}</div><div class="param-value">${r[1]}<span class="param-unit">${r[2]}</span></div></div>`
      ).join('');
    }
    const insight = $('#insightText');
    if (insight) insight.textContent = p.insight;
  }

  // ── Init ───────────────────────────────────
  function init(k) {
    const rhythm = RHYTHMS[k];
    if (!rhythm) return;

    updateUI(k, rhythm);
    setupStrip(rhythm);
    startCombined(rhythm);

    // Wire controls
    ['btnCheck','btnReset','bFull','bSplit'].forEach(id => {
      const el = $('#'+id); if (!el) return;
      const cl = el.cloneNode(true);
      el.parentNode.replaceChild(cl, el);
    });

    $('#btnCheck').addEventListener('click', () => reveal(rhythm));
    $('#btnReset').addEventListener('click', () => reset(rhythm));
    $('#bFull').addEventListener('click', () => {
      $('#bFull').classList.add('on'); $('#bSplit').classList.remove('on');
      startCombined(rhythm);
    });
    $('#bSplit').addEventListener('click', () => {
      $('#bSplit').classList.add('on'); $('#bFull').classList.remove('on');
      startSplit(rhythm, k);
    });
  }

  // ── Boot ───────────────────────────────────
  document.addEventListener('DOMContentLoaded', () => {
    if (!location.hash) location.hash = '#normal';
    init(getKey());
  });
  window.addEventListener('hashchange', () => init(getKey()));
})();
