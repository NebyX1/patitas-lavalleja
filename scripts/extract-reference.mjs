// One-time migration helper. The original sketch remains intact for comparison.
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';

const html = fs.readFileSync(
  'Patitas_Lavalleja_Boceto_Interactivo.html',
  'utf8',
);
const write = (file, value) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, value);
};
const rawPhotos = html.match(/const PHOTOS = (\{[\s\S]*?\n\});/)[1];
const rawPets = html.match(/const PETS = (\[[\s\S]*?\n\]);/)[1];
const pets = vm.runInNewContext(`(${rawPets})`);
const photos = vm.runInNewContext(`(${rawPhotos})`);
write(
  'src/data/pets.ts',
  `import type { Pet } from '../types/pet';\n\nexport const pets: Pet[] = ${JSON.stringify(pets, null, 2)};\n\nexport const locations = [...new Set(pets.map(p => p.location))];\nexport const petById = (id: string) => pets.find(p => p.id === id);\n`,
);
write('src/data/photo-sources.json', JSON.stringify(photos, null, 2));
const css = html.match(/<style>([\s\S]*?)<\/style>/)[1];
const parts = css.split(
  /\/\* (Masthead|Hero: editorial type \+ floating photographic cards|Catalog|Discover section|Journey \+ story|Community, faq, footer|Shared image transitions \+ modal profiles|Secondary dialogs|Responsive) \*\//,
);
const names = [
  'base',
  'navigation',
  'hero',
  'catalog',
  'match',
  'journey',
  'community',
  'profile',
  'dialogs',
  'responsive',
];
write(
  'src/styles/base.css',
  parts[0].replace(
    /\/\*[\s\S]*?\*\//,
    '/* Shared design tokens and primitives from the original Patitas sketch. */',
  ),
);
for (let i = 1; i < names.length; i++)
  write(`src/styles/${names[i]}.css`, parts[i * 2] || '');
const sprite =
  html.match(/<svg[^>]*style="position:absolute[^>]*>[\s\S]*?<\/svg>/)?.[0] ||
  html.match(/<svg[^>]*aria-hidden="true"[^>]*>[\s\S]*?<\/defs><\/svg>/)?.[0];
if (!sprite) throw new Error('Icon sprite missing');
const moon =
  '<symbol id="i-moon" viewBox="0 0 24 24"><path d="M21 13a9 9 0 0 1-10-10 9 9 0 1 0 10 10Z"/></symbol>';
write(
  'src/components/decorative/IconSprite.astro',
  sprite.replace('</defs>', `${moon}</defs>`),
);

function section(start, end = '</section>') {
  const offset = html.indexOf(start);
  if (offset < 0) throw new Error(`Section missing: ${start}`);
  return html.slice(offset, html.indexOf(end, offset) + end.length);
}
function transform(markup) {
  return markup
    .replace(
      /<img data-photo="([a-z]+)"/g,
      (_, key) =>
        `<img src="/images/pets/${key}-960.webp" width="960" height="960"`,
    )
    .replace(/href="#adopcion"/g, 'href="/adopcion/"')
    .replace(/href="#(inicio|como-funciona|historias|sumate)"/g, 'href="/#$1"')
    .replace(
      /<button([^>]*?)data-action="quiz"([^>]*)>([\s\S]*?)<\/button>/g,
      '<a$1href="/tu-match/"$2>$3</a>',
    )
    .replace(
      /<button([^>]*?)data-help="(transit|volunteer|share)"([^>]*)>([\s\S]*?)<\/button>/g,
      (_, a, kind, b, inner) =>
        `<a${a}href="${kind === 'share' ? '/adopcion/' : `/sumate/?tipo=${kind}`}"${b}>${inner}</a>`,
    );
}
write(
  'src/components/sections/Match.astro',
  transform(section('<section class="match-section')),
);
const journey = transform(section('<section class="journey'));
const steps = [
  ...journey.matchAll(/<article class="step reveal">([\s\S]*?)<\/article>/g),
].map((x) => x[1]);
write(
  'src/components/cards/JourneyStep.astro',
  '---\ninterface Props { number: string; icon: string; title: string; description: string; }\nconst { number, icon, title, description } = Astro.props;\n---\n<article class="step reveal"><div class="step-top"><span class="step-num">{number}</span><span class="step-icon"><svg class="icon" aria-hidden="true"><use href={`#i-${icon}`} /></svg></span></div><h3>{title}</h3><p>{description}</p></article>',
);
write(
  'src/components/sections/Journey.astro',
  '---\nimport JourneyStep from "../cards/JourneyStep.astro";\nconst steps = ' +
    JSON.stringify(
      steps.map((s, i) => ({
        number: `0${i + 1}`,
        icon: s.match(/href="#i-([a-z]+)"/)[1],
        title: s.match(/<h3>(.*?)<\/h3>/)[1],
        description: s.match(/<p>(.*?)<\/p>/)[1],
      })),
      null,
      2,
    ) +
    ';\n---\n' +
    journey.replace(
      /<div class="steps">[\s\S]*?<\/div><\/section>$/,
      '<div class="steps">{steps.map(step => <JourneyStep {...step} />)}</div></section>',
    ),
);
const community = transform(section('<section class="community'));
const help = [
  ...community.matchAll(
    /<a class="help-card reveal"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g,
  ),
].map((x) => ({
  href: x[1],
  icon: x[2].match(/href="#i-([a-z]+)"/)[1],
  title: x[2].match(/<h3>(.*?)<\/h3>/)[1],
  description: x[2].match(/<p>(.*?)<\/p>/)[1],
}));
write(
  'src/components/cards/HelpCard.astro',
  '---\ninterface Props { href: string; icon: string; title: string; description: string; }\nconst { href, icon, title, description } = Astro.props;\n---\n<a class="help-card reveal" href={href}><svg class="icon" aria-hidden="true"><use href={`#i-${icon}`} /></svg><svg class="icon help-arrow" aria-hidden="true"><use href="#i-arrow-up" /></svg><h3>{title}</h3><p>{description}</p></a>',
);
write(
  'src/components/sections/Community.astro',
  '---\nimport HelpCard from "../cards/HelpCard.astro";\nconst ways = ' +
    JSON.stringify(help, null, 2) +
    ';\n---\n' +
    community.replace(
      /<div class="help-grid">[\s\S]*?<\/div><\/section>$/,
      '<div class="help-grid">{ways.map(way => <HelpCard {...way} />)}</div></section>',
    ),
);
const faqs = [
  ...section('<section class="faq').matchAll(
    /<summary>([^<]+)[\s\S]*?<\/summary><p>(.*?)<\/p>/g,
  ),
].map((x) => ({
  question: x[1],
  answer: x[2]
    .replace(/este boceto/g, 'esta versión de demostración')
    .replace(
      /Esta página es un prototipo de diseño/g,
      'Esta versión contiene datos de demostración',
    ),
}));
write(
  'src/data/faqs.ts',
  'export const faqs = ' + JSON.stringify(faqs, null, 2) + ';\n',
);
write(
  'src/components/sections/Faq.astro',
  '---\nimport { faqs } from "../../data/faqs";\n---\n' +
    section('<section class="faq').replace(
      /<div class="faq-list reveal">[\s\S]*?<\/div><\/section>$/,
      '<div class="faq-list reveal">{faqs.map(({question,answer}) => <details><summary>{question}<svg class="icon" aria-hidden="true"><use href="#i-plus" /></svg></summary><p>{answer}</p></details>)}</div></section>',
    ),
);
const hero = transform(section('<section class="hero wrap'));
write(
  'src/components/sections/Hero.astro',
  '---\nimport HeroGallery from "../islands/HeroGallery";\n---\n' +
    hero.replace(
      /<div class="hero-art"[\s\S]*?<\/div>\n<\/div><div class="hero-bottom">/,
      '<HeroGallery client:load />\n</div><div class="hero-bottom">',
    ),
);
const marquee = html.slice(
  html.indexOf('<div class="marquee"'),
  html.indexOf('<section class="catalog'),
);
write('src/components/decorative/Marquee.astro', marquee);
console.log('Migrated data, CSS, icons, and static sections.');
