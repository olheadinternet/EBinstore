// Basic client-side app to list Drawings/ and Fonts/ from this GitHub repo
// and build a 360x120mm SVG combining a selected drawing (centered at x=90mm)
// and rendered single-stroke text centered around x=270mm.

const config = {
  owner: 'olheadinternet',
  repo: 'EBinstore',
  branch: 'main',
  drawingsPath: 'Drawings',
  fontsPath: 'Fonts'
};

const apiBase = `https://api.github.com/repos/${config.owner}/${config.repo}/contents`;

async function listFiles(path) {
  const url = `${apiBase}/${path}?ref=${config.branch}`;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error('not ok');
    const data = await res.json();
    return data.filter(f => f.type === 'file');
  } catch (e) {
    console.warn('Could not fetch via GitHub API, falling back: ', e);
    return [];
  }
}

function rawUrl(path) {
  // Prefer relative paths so the site can load assets from the same Pages host.
  // This works for local dev (python -m http.server) and GitHub Pages hosting.
  try {
    if (typeof window !== 'undefined' && window && window.location) {
      // Use relative path so Drawings/... and Fonts/... resolve under the site root.
      return path;
    }
  } catch (e) {}
  // Fallback to raw.githubusercontent if window isn't available.
  return `https://raw.githubusercontent.com/${config.owner}/${config.repo}/${config.branch}/${path}`;
}

// simple debounce utility to avoid spamming rebuilds while typing
function debounce(fn, wait){
  let t = null;
  return (...args)=>{
    if (t) clearTimeout(t);
    t = setTimeout(()=>{ t = null; fn(...args); }, wait);
  };
}

async function init() {
  const drawings = await listFiles(config.drawingsPath);
  const fonts = await listFiles(config.fontsPath);

  populateDrawings(drawings);
  populateFonts(fonts);

  // wire actions
  document.getElementById('previewBtn').addEventListener('click', buildPreview);
  document.getElementById('downloadBtn').addEventListener('click', downloadSVG);

  // auto-preview when user switches drawings, types, or adjusts controls
  const debounced = debounce(()=>{ buildPreview().catch(()=>{}); }, 250);
  const drawingSelect = document.getElementById('drawingSelect');
  if (drawingSelect) drawingSelect.addEventListener('change', debounced);
  const msg = document.getElementById('message');
  if (msg) msg.addEventListener('input', debounced);
  const fontSize = document.getElementById('fontSize');
  if (fontSize) fontSize.addEventListener('input', debounced);
  const kerning = document.getElementById('kerning');
  if (kerning) kerning.addEventListener('input', debounced);
  const fontSelect = document.getElementById('fontSelect');
  if (fontSelect) fontSelect.addEventListener('change', debounced);
}

function populateDrawings(list) {
  const sel = document.getElementById('drawingSelect');
  const thumb = document.getElementById('drawingThumb');
  sel.innerHTML = '';
  thumb.src = '';
  thumb.alt = '';
  const none = document.createElement('option'); none.value = ''; none.textContent = '— select drawing —'; sel.appendChild(none);
  if (list.length === 0) {
    const opt = document.createElement('option'); opt.value=''; opt.textContent='No drawings found (place SVGs in Drawings/)'; sel.appendChild(opt);
    thumb.style.display = 'none';
    return;
  }

  list.forEach(f => {
    const o = document.createElement('option');
    o.value = f.path;
    o.textContent = f.name;
    o.dataset.thumb = rawUrl(f.path);
    sel.appendChild(o);
  });

  // show thumbnail for current selection
  sel.addEventListener('change', ()=>{
    const v = sel.value;
    if (!v) { thumb.style.display = 'none'; thumb.src = ''; thumb.alt = ''; return; }
    const option = sel.querySelector(`option[value="${v}"]`);
    const src = option?.dataset?.thumb || rawUrl(v);
    thumb.src = src; thumb.alt = option?.textContent || v; thumb.style.display = '';
  });

  // select first drawing by default
  sel.selectedIndex = 0;
  // if there is a first real option, pick it and update thumb
  if (sel.options.length > 1) {
    sel.selectedIndex = 1;
    const evt = new Event('change');
    sel.dispatchEvent(evt);
  } else {
    thumb.style.display = 'none';
  }
}

function populateFonts(list) {
  const sel = document.getElementById('fontSelect');
  sel.innerHTML = '';
  const none = document.createElement('option'); none.value=''; none.textContent='— select font —'; sel.appendChild(none);
  if (list.length === 0) {
    const opt = document.createElement('option'); opt.value=''; opt.textContent='No fonts found (place SVG fonts in Fonts/)'; sel.appendChild(opt);
    return;
  }
  list.forEach(f=>{
    const o = document.createElement('option'); o.value = f.path; o.textContent = f.name; sel.appendChild(o);
  });
}

async function fetchText(url){
  const res = await fetch(url);
  if (!res.ok) throw new Error('fetch failed');
  return await res.text();
}

async function buildPreview(){
  const drawingSelectEl = document.getElementById('drawingSelect');
  const drawingPath = drawingSelectEl ? (drawingSelectEl.value || null) : null;
  const fontPath = document.getElementById('fontSelect').value;
  const message = document.getElementById('message').value || '';
  const fontSize = Number(document.getElementById('fontSize').value) || 24;
  const kerning = Number(document.getElementById('kerning').value) || 0;

  // create base svg
  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS,'svg');
  svg.setAttribute('width','360mm');
  svg.setAttribute('height','120mm');
  svg.setAttribute('viewBox','0 0 360 120');
  svg.classList.add('canvas');

  // add a preview-only background (will be removed from the downloaded SVG)
  const bg = document.createElementNS(svgNS,'rect');
  bg.setAttribute('x','0'); bg.setAttribute('y','0'); bg.setAttribute('width','360'); bg.setAttribute('height','120');
  bg.setAttribute('fill','white');
  bg.setAttribute('data-eggbot-preview','true');
  svg.appendChild(bg);

  // insert drawing if selected
  if (drawingPath) {
    try {
      const raw = await fetchText(rawUrl(drawingPath));
      // parse drawing svg and import its contents without modifying positioning
      const parser = new DOMParser();
      const doc = parser.parseFromString(raw,'image/svg+xml');
      const inner = doc.documentElement;
      const g = document.createElementNS(svgNS,'g');
      // determine viewBox of the incoming drawing so we can filter out editor helper rectangles
      let vb = inner.getAttribute('viewBox');
      let vbW = 360, vbH = 120;
      if (vb) {
        const parts = vb.split(/\s+/).map(Number);
        if (parts.length === 4) { vbW = parts[2]; vbH = parts[3]; }
      } else {
        // fallback to width/height attributes (may include 'mm')
        const w = inner.getAttribute('width') || '360';
        const h = inner.getAttribute('height') || '120';
        vbW = Number(w.replace(/[^0-9.\-]/g,'')) || vbW;
        vbH = Number(h.replace(/[^0-9.\-]/g,'')) || vbH;
      }

      // copy children but filter out metadata, inkscape helpers and large background rects
      Array.from(inner.childNodes).forEach(n=>{
        if (n.nodeType !== Node.ELEMENT_NODE) return;
        const tag = n.tagName.toLowerCase();
        // skip editor metadata and defs
        if (tag === 'metadata' || tag === 'defs' || tag.indexOf('namedview') !== -1) return;
        // filter out large rects that are likely page/background artifacts
        if (tag === 'rect') {
          const rx = Number(n.getAttribute('x') || 0);
          const ry = Number(n.getAttribute('y') || 0);
          const rw = Number((n.getAttribute('width')||'0').replace(/[^0-9.\-]/g,''));
          const rh = Number((n.getAttribute('height')||'0').replace(/[^0-9.\-]/g,''));
          // remove rects that are larger than the drawing dimensions or positioned far outside
          if (rw >= vbW - 0.1 && rh >= vbH - 0.1) return;
          if (Math.abs(rx) > vbW*2 || Math.abs(ry) > vbH*2) return;
        }

        // import the node
        try {
          g.appendChild(document.importNode(n,true));
        } catch(e){
          // ignore nodes that can't be imported
        }
      });
      svg.appendChild(g);
    } catch(e){
      console.error('drawing load failed', e);
    }
  }

  // render text using an SVG font file (parse glyphs)
  if (fontPath && message.trim().length>0) {
    try {
      const raw = await fetchText(rawUrl(fontPath));
      const parser = new DOMParser();
      const doc = parser.parseFromString(raw,'image/svg+xml');
      const fontEl = doc.querySelector('font');
      const fontFace = doc.querySelector('font-face');
      if (!fontEl) throw new Error('No <font> element found');

      const unitsPerEm = Number(fontFace?.getAttribute('units-per-em')||1024);
      const ascent = Number(fontFace?.getAttribute('ascent')||800);
      const descent = Number(fontFace?.getAttribute('descent')||0);

      const glyphs = {};
      doc.querySelectorAll('glyph').forEach(g=>{
        const u = g.getAttribute('unicode');
        const d = g.getAttribute('d');
        const adv = Number(g.getAttribute('horiz-adv-x') || fontEl.getAttribute('horiz-adv-x') || 0);
        if (u && d) glyphs[u] = {d, adv};
      });
      console.log('Loaded font glyphs:', Object.keys(glyphs).length);

      // Build group of glyph paths at baseline y=0
  const gGroup = document.createElementNS(svgNS,'g');
  // mark glyph group so it's easy to find during debugging/export
  gGroup.setAttribute('data-eggbot-glyphs','true');
  let cursor = 0;
  // mm per font unit
  const scale = fontSize / unitsPerEm;
  console.log('font unitsPerEm, ascent, descent, scale:', unitsPerEm, ascent, descent, scale);
      for (const ch of message) {
        const gly = glyphs[ch] || glyphs[ch.toLowerCase()] || null;
        if (!gly) {
          // skip or leave a spacer
          cursor += 10 + kerning;
          continue;
        }
        const p = document.createElementNS(svgNS,'path');
        p.setAttribute('d', gly.d);
    // place glyph at cursor and scale by font units to mm (positive scaling)
    // we'll flip the whole glyph group vertically (y) using the font ascent
    const t = `translate(${cursor},0) scale(${scale} ${scale})`;
    p.setAttribute('transform', t);
    p.setAttribute('fill','none');
  p.setAttribute('stroke','#000');
  // baseline stroke width (export-safe, small). We'll apply a thicker preview-only stroke via inline styles
  const baseStrokeMM = Math.max(0.12, fontSize / 96);
  p.setAttribute('stroke-width', String(baseStrokeMM));
  // mark this path as part of preview-only styling so we can strip styles before export
  p.setAttribute('data-eggbot-preview-stroke','true');
  // apply preview-only inline styles to make strokes visible during preview
  // use non-scaling stroke so the visual thickness is independent of path scaling
  const previewStrokeMM = Math.max(0.6, fontSize / 24);
  p.style.strokeWidth = previewStrokeMM + 'mm';
  p.style.vectorEffect = 'non-scaling-stroke';
        p.setAttribute('stroke-linecap','round');
        p.setAttribute('stroke-linejoin','round');
        gGroup.appendChild(p);
        cursor += (gly.adv || 600) * scale + kerning; // adv in font units
      }

  // flip the whole glyph group vertically so font y-up coordinates map to SVG y-down
  // translate by ascent*scale to align the font baseline at y=0, then flip
  const flip = `translate(0 ${ascent * scale}) scale(1 -1)`;
  // if there was any group-level transform already, keep it and append the flip
  const existingGroupTransform = gGroup.getAttribute('transform') || '';
  gGroup.setAttribute('transform', (existingGroupTransform ? existingGroupTransform + ' ' : '') + flip);

  // append to SVG but we need to center the text group horizontally at x=270 and vertically at y=60
  svg.appendChild(gGroup);

      // append to DOM preview first so we can measure bbox
      const previewContainer = document.getElementById('previewContainer');
      previewContainer.innerHTML = '';
      previewContainer.appendChild(svg);

  // measure bbox and translate so center aligns
      // allow browser to compute bbox (small timeout)
      await new Promise(r=>setTimeout(r,30));
  const bbox = gGroup.getBBox();
  console.log('glyph group bbox:', bbox);
      const glyphCenterX = bbox.x + bbox.width/2;
      const glyphCenterY = bbox.y + bbox.height/2;
      const desiredCenterX = 270; // mm
      const desiredCenterY = 60; // mm
      const dx = desiredCenterX - glyphCenterX;
      const dy = desiredCenterY - glyphCenterY;
      const finalTransform = `translate(${dx} ${dy})`;
      gGroup.setAttribute('transform', finalTransform + (gGroup.getAttribute('transform')? ' ' + gGroup.getAttribute('transform') : ''));

      // if the glyph bbox is empty (width or height zero) warn the user
      if (!bbox || bbox.width === 0 || bbox.height === 0) {
        console.warn('Rendered glyph group has empty bbox; glyph paths may not have visible strokes or may be outside viewBox.');
        const previewContainer = document.getElementById('previewContainer');
        const hint = document.createElement('div');
        hint.className = 'note';
        hint.textContent = 'Warning: font glyphs did not produce a visible bbox. Check the font file format or open the browser console for details.';
        previewContainer.appendChild(hint);
      }

      // done — preview is already in container
      return;
    } catch(e){
      console.error('font render failed', e);
    }
  }

  // fallback: just show svg
  const previewContainer = document.getElementById('previewContainer');
  previewContainer.innerHTML = '';
  previewContainer.appendChild(svg);
}

function downloadSVG(){
  const container = document.getElementById('previewContainer');
  const svg = container.querySelector('svg');
  if (!svg) { alert('No preview to download'); return; }
  // clone and remove preview-only elements (background etc.) before serializing
  const clone = svg.cloneNode(true);
  // remove any preview-only rects or elements marked with data-eggbot-preview
  Array.from(clone.querySelectorAll('[data-eggbot-preview]')).forEach(n=>n.remove());
  // remove preview-only stroke styles we applied to glyph paths so export uses baseline strokes
  Array.from(clone.querySelectorAll('[data-eggbot-preview-stroke]')).forEach(el=>{
    // remove the inline style applied for preview visibility
    el.removeAttribute('style');
    // remove our preview marker attribute
    el.removeAttribute('data-eggbot-preview-stroke');
  });

  // Make sure elements that had both fill="none" and stroke="none" are visible in Inkscape.
  // Some SVGs (or editors) place both to hide elements from viewers; Inkscape can ignore them.
  // We convert those to single-stroke shapes so they show up: stroke="#000000" and fill="none".
  const shapeSelectors = ['path','circle','ellipse','rect','line','polyline','polygon'];
  shapeSelectors.forEach(sel => {
    Array.from(clone.querySelectorAll(sel)).forEach(el => {
      const style = (el.getAttribute('style')||'');
      const styleHasFillNone = /(?:^|;)\s*fill\s*:\s*none(?:;|$)/i.test(style) || el.getAttribute('fill') === 'none';
      const styleHasStrokeNone = /(?:^|;)\s*stroke\s*:\s*none(?:;|$)/i.test(style) || el.getAttribute('stroke') === 'none';
      if (styleHasFillNone && styleHasStrokeNone) {
        // remove only the fill:none and stroke:none declarations from style
        let newStyle = style.replace(/(?:^|;)\s*fill\s*:\s*none;?/ig,'').replace(/(?:^|;)\s*stroke\s*:\s*none;?/ig,'').trim();
        if (newStyle === '' ) el.removeAttribute('style'); else el.setAttribute('style', newStyle);

        // set a visible single-stroke so Inkscape will render it
        el.setAttribute('stroke','#000000');
        el.setAttribute('fill','none');
        if (!el.getAttribute('stroke-width')) el.setAttribute('stroke-width','0.25mm');
      }
    });
  });

  // Second pass: ensure elements that lack any explicit fill/stroke (unset paint) get a visible stroke
  const allShapes = Array.from(clone.querySelectorAll(shapeSelectors.join(',')));
  allShapes.forEach(el => {
    const style = (el.getAttribute('style')||'');
    const hasFillAttr = el.hasAttribute('fill') && el.getAttribute('fill') !== 'none';
    const hasStrokeAttr = el.hasAttribute('stroke') && el.getAttribute('stroke') !== 'none';
    const styleSpecifiesFill = /(?:^|;)\s*fill\s*:/i.test(style);
    const styleSpecifiesStroke = /(?:^|;)\s*stroke\s*:/i.test(style);
    // if neither fill nor stroke is specified anywhere, mark it with a visible stroke
    if (!hasFillAttr && !hasStrokeAttr && !styleSpecifiesFill && !styleSpecifiesStroke) {
      el.setAttribute('stroke','#000000');
      el.setAttribute('fill','none');
      el.setAttribute('stroke-opacity','1');
      if (!el.getAttribute('stroke-width')) el.setAttribute('stroke-width','0.25mm');
    }
  });

  // Ensure stroke widths are not vanishingly small in Inkscape: enforce a minimum visible stroke
  const MIN_STROKE_MM = 0.05; // minimum stroke thickness in mm for export
  Array.from(clone.querySelectorAll(shapeSelectors.join(','))).forEach(el => {
    const sw = el.getAttribute('stroke-width');
    if (sw) {
      // parse numeric value (allow units); convert values like '0.006' or '0.006mm'
      const m = sw.match(/^\s*([0-9.]+)\s*(mm)?\s*$/);
      if (m) {
        const val = Number(m[1]);
        // if value is less than minimum, set to minimum (with mm units)
        if (val < MIN_STROKE_MM) {
          el.setAttribute('stroke-width', String(MIN_STROKE_MM) + 'mm');
          el.setAttribute('vector-effect','non-scaling-stroke');
        }
      } else {
        // if stroke-width is in other units or complex, ensure a safe explicit mm stroke
        el.setAttribute('stroke-width', String(MIN_STROKE_MM) + 'mm');
        el.setAttribute('vector-effect','non-scaling-stroke');
      }
    }
  });

  // Ensure glyph paths specifically use non-scaling strokes and a sensible minimum width so
  // transforms applied to glyphs (scale/flip) don't visually shrink the stroke in Inkscape.
  const glyphPaths = Array.from(clone.querySelectorAll('[data-eggbot-glyphs] path'));
  glyphPaths.forEach(p => {
    // ensure stroke exists
    if (!p.getAttribute('stroke')) p.setAttribute('stroke', '#000000');
    // parse existing stroke-width or set minimum
    const sw = p.getAttribute('stroke-width');
    let newSw = null;
    if (sw) {
      const m = sw.match(/^\s*([0-9.]+)\s*(mm)?\s*$/);
      if (m) {
        const val = Number(m[1]);
        newSw = (val < MIN_STROKE_MM) ? (String(MIN_STROKE_MM) + 'mm') : (m[2] ? sw : (String(val) + 'mm'));
      } else {
        newSw = String(MIN_STROKE_MM) + 'mm';
      }
    } else {
      newSw = String(MIN_STROKE_MM) + 'mm';
    }
    if (newSw) p.setAttribute('stroke-width', newSw);
    p.setAttribute('vector-effect','non-scaling-stroke');
  });
  // also remove any full-canvas rects that likely come from editor background artifacts (sized near the viewBox)
  const viewBox = (clone.getAttribute('viewBox')||'0 0 360 120').split(/\s+/).map(Number);
  const vbW = viewBox[2]||360, vbH = viewBox[3]||120;
  Array.from(clone.querySelectorAll('rect')).forEach(r=>{
    const rw = Number((r.getAttribute('width')||'0').replace(/[^0-9.\-]/g,''));
    const rh = Number((r.getAttribute('height')||'0').replace(/[^0-9.\-]/g,''));
    if (rw >= vbW*0.95 && rh >= vbH*0.95) {
      r.remove();
    }
  });
  const xml = new XMLSerializer().serializeToString(clone);
  const blob = new Blob([xml],{type:'image/svg+xml'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'eggbot-ornament.svg'; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}

// initialize on load
window.addEventListener('DOMContentLoaded', ()=>{
  init().catch(e=>console.error(e));
});
