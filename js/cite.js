import { config } from './config.js';
const today = new Date();
const date = [today.getFullYear(), String(today.getMonth() + 1).padStart(2, '0'), String(today.getDate()).padStart(2, '0')].join('-');
const access = document.getElementById('access-date');
access.textContent = today.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }); access.dateTime = date;
document.getElementById('aligned-citation').append(` Accessed ${date}.`);
const item = `https://ucmerced.maps.arcgis.com/home/item.html?id=${config.itemId}`;
const paperAuthors = ['Bennett, James S.', 'Mutch, Erin', 'Tollefson, Andrew', 'Chalstrey, Ed', 'Benam, Majid', 'Cioni, Enrico', 'Reddish, Jenny', 'Zsambok, Jakob', 'Levine, Jill', 'Cook, C. Justin', 'Francois, Pieter', 'Hoyer, Daniel', 'Turchin, Peter'];
const title = 'Cliopatria - A geospatial database of world-wide political entities from 3400BCE to 2024CE';
const bibtex = `@misc{ucmerced2026aligned,
  author = {{GIS Center and Geospatial Services, UC Merced University Library}},
  title = {Aligned Cliopatria (v1.2)},
  year = {2026},
  url = {${item}},
  urldate = {${date}},
  note = {Aligned and reviewed by Erin Mutch. Coverage: 3400 BCE to 2024 CE. Suggested citation; publisher approval pending.}
}

@article{bennett2025cliopatria,
  author = {${paperAuthors.join(' and ')}},
  title = {${title}},
  journal = {Scientific Data},
  year = {2025},
  volume = {12},
  pages = {247},
  doi = {10.1038/s41597-025-04516-9}
}

@misc{seshat2026cliopatria,
  author = {{Seshat Global History Databank}},
  title = {Cliopatria (v0.2.1)},
  year = {2026},
  publisher = {GitHub},
  url = {https://github.com/Seshat-Global-History-Databank/cliopatria/releases/tag/v0.2.1}
}
`;
const ris = `TY  - DATA
AU  - GIS Center and Geospatial Services, UC Merced University Library
TI  - Aligned Cliopatria
ET  - v1.2
PY  - 2026
UR  - ${item}
Y2  - ${date.replaceAll('-', '/')}
N1  - Aligned and reviewed by Erin Mutch. Coverage: 3400 BCE to 2024 CE. Suggested citation; publisher approval pending.
ER  -

TY  - JOUR
${paperAuthors.map(author => `AU  - ${author}`).join('\n')}
TI  - ${title}
JO  - Scientific Data
VL  - 12
SP  - 247
PY  - 2025
DO  - 10.1038/s41597-025-04516-9
ER  -

TY  - DATA
AU  - Seshat Global History Databank
TI  - Cliopatria
ET  - v0.2.1
PY  - 2026
PB  - GitHub
UR  - https://github.com/Seshat-Global-History-Databank/cliopatria/releases/tag/v0.2.1
ER  -
`;
function download(text, extension, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement('a'); link.href = url; link.download = `cliopatria-citations.${extension}`;
  document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  document.getElementById('citation-status').textContent = `${extension.toUpperCase()} citation file prepared.`;
}
document.getElementById('copy-citation').addEventListener('click', async () => {
  const text = ['aligned-citation', 'paper-citation', 'source-citation'].map(id => document.getElementById(id).textContent).join('\n\n');
  try { await navigator.clipboard.writeText(text); document.getElementById('citation-status').textContent = 'Citations copied.'; }
  catch { document.getElementById('citation-status').textContent = 'Clipboard access is unavailable. Select and copy the citation text above.'; document.getElementById('aligned-citation').focus(); }
});
document.getElementById('download-bibtex').addEventListener('click', () => download(bibtex, 'bib', 'application/x-bibtex'));
document.getElementById('download-ris').addEventListener('click', () => download(ris, 'ris', 'application/x-research-info-systems'));
