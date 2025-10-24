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
  return `https://raw.githubusercontent.com/${config.owner}/${config.repo}/${config.branch}/${path}`;
}

async function init() {
  const drawings = await listFiles(config.drawingsPath);
  const fonts = await listFiles(config.fontsPath);

  populateDrawings(drawings);
  populateFonts(fonts);

  document.getElementById('previewBtn').addEventListener('click', buildPreview);
  document.getElementById('downloadBtn').addEventListener('click', downloadSVG);
}

function populateDrawings(list) {
  const container = document.getElementById('drawings');
  container.innerHTML = '';
  if (list.length === 0) container.innerHTML = '<div class="note">No drawings found (place SVGs in Drawings/)</div>';
  list.forEach(f => {
    const btn = document.createElement('button');
    btn.dataset.path = f.path;
    const img = document.createElement('img');
    // use raw svg as image (browsers will render it)
    img.src = rawUrl(f.path);
    img.alt = f.name;
    btn.appendChild(img);
    const span = document.createElement('div');
    span.textContent = f.name;
    btn.appendChild(span);
    btn.addEventListener('click', ()=> {
      document.querySelectorAll('#drawings button').forEach(b=>b.classList.remove('selected'));
      btn.classList.add('selected');
    });
    container.appendChild(btn);
  });
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
  const selected = document.querySelector('#drawings button.selected');
  const drawingPath = selected ? selected.dataset.path : null;
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
  let cursor = 0;
  const scale = fontSize / unitsPerEm; // mm per font unit
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
        // place glyph at cursor; also scale by font units to mm
        const t = `translate(${cursor},0) scale(${scale} ${-scale})`;
        // note: scale Y negative because font glyphs use y-up coordinates; we flip
        p.setAttribute('transform', t);
        p.setAttribute('fill','none');
  p.setAttribute('stroke','#000');
  // stroke width in mm (preview uses mm units). Scale it reasonably with font size.
  const strokeMM = Math.max(0.2, fontSize / 48);
  p.setAttribute('stroke-width', String(strokeMM));
        p.setAttribute('stroke-linecap','round');
        p.setAttribute('stroke-linejoin','round');
        gGroup.appendChild(p);
        cursor += (gly.adv || 600) * scale + kerning; // adv in font units
      }

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
