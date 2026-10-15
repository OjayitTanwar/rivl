import { mkdir, writeFile } from 'node:fs/promises';
import { Resvg } from '@resvg/resvg-js';
const out = 'artifacts/logo-refresh';
await mkdir(out, { recursive: true });
const ink = '#101114', coral = '#FF4B35', warm = '#F5F4EF';
const marks = {
  switchback: '<path fill-rule="evenodd" d="M264 770 366 254H587C736 254 794 320 770 443 751 532 695 580 599 595L735 770H591L438 566 398 770ZM453 365 424 513H566C623 513 654 489 663 443 673 393 646 365 590 365ZM470 526H650L635 550H466Z"/>',
  trail: '<path d="M280 755 370 286H566C678 286 735 336 714 441 696 531 636 560 542 560H335M514 560 691 755" fill="none" stroke="currentColor" stroke-width="100" stroke-linecap="round" stroke-linejoin="round"/><path d="M474 302 438 479" fill="none" stroke="#FF4B35" stroke-width="25"/>',
};
const svg = (mark, color, bg) => `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024" color="${color}">${bg ? `<rect width="1024" height="1024" fill="${bg}"/>` : ''}<g fill="${color}">${marks[mark]}</g></svg>`;
for (const name of Object.keys(marks)) {
  for (const [variant,color,bg] of [['app',ink,coral],['light',ink,null],['dark',warm,null]]) {
    const source=svg(name,color,bg);
    await writeFile(`${out}/${name}-${variant}.svg`,source);
    await writeFile(`${out}/${name}-${variant}.png`,new Resvg(source).render().asPng());
    await writeFile(`${out}/${name}-${variant}.png.json`,JSON.stringify({prompt:`Origin: original RIVL ${name} vector concept, rendered from ${name}-${variant}.svg. Hand-authored geometric paths; existing RIVL Coral/Ink/Warm palette.`},null,2));
  }
}
const board=`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800">
<rect width="1200" height="800" fill="${warm}"/>
<text x="58" y="67" fill="${ink}" font-family="Helvetica Neue,Arial" font-size="22" font-weight="700" letter-spacing="3">RIVL / MARK STUDIES</text>
<line x1="600" y1="130" x2="600" y2="742" stroke="#E3E3DA"/>
${Object.keys(marks).map((name,i)=>`<g transform="translate(${i*600},0)"><rect x="160" y="155" width="280" height="280" rx="62" fill="${coral}"/><g transform="translate(160,155) scale(.2734375)" fill="${ink}" color="${ink}">${marks[name]}</g><text x="60" y="510" fill="${ink}" font-family="Helvetica Neue,Arial" font-size="29" font-weight="700">${i?'02 / TRAIL':'01 / SWITCHBACK'}</text><text x="60" y="546" fill="#676A68" font-family="Helvetica Neue,Arial" font-size="18">${i?'A softer route drawn into an R.':'A bold R with a forward-moving cut.'}</text><g transform="translate(55,590) scale(.075)" fill="${ink}" color="${ink}">${marks[name]}</g><rect x="176" y="590" width="78" height="78" rx="18" fill="${ink}"/><g transform="translate(176,590) scale(.076171875)" fill="${warm}" color="${warm}">${marks[name]}</g><rect x="300" y="608" width="40" height="40" rx="9" fill="${coral}"/><g transform="translate(300,608) scale(.0390625)" fill="${ink}" color="${ink}">${marks[name]}</g><text x="60" y="720" fill="#676A68" font-family="Helvetica Neue,Arial" font-size="16">${i?'Rounded / open / approachable':'Recommended / distinctive / strong at small sizes'}</text></g>`).join('')}</svg>`;
await writeFile(`${out}/concepts.svg`,board);
await writeFile(`${out}/concepts.png`,new Resvg(board,{font:{loadSystemFonts:true}}).render().asPng());
await writeFile(`${out}/concepts.png.json`,JSON.stringify({prompt:'Origin: original vector logo concept comparison, rendered from concepts.svg. Two original RIVL monograms with app-icon and scale studies.'},null,2));
