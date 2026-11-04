/** The logos in public/brands. Remove a line here to take that brand off the home page. */
const BRANDS: [file: string, name: string][] = [
  ["01", "Ripuraj"], ["02", "Clocera"], ["03", "JW Prime Institute"], ["04", "NIA Skyline"], ["05", "Bhuli Devi Caterers"],
  ["06", "Globe Marketing Flagwale"], ["07", "Ather"], ["08", "Kohira"], ["09", "OPPO"], ["10", "Nothing"],
  ["11", "Sunfeast"], ["12", "Ajjas"], ["13", "Bisk Farm"], ["14", "TVS"], ["15", "LG"],
  ["16", "Bingo!"], ["17", "realme"], ["18", "Savitri Electricals"], ["19", "Ripuraj Synergy Summit 2024"], ["20", "Channel Partner"],
  ["21", "Aarize"], ["22", "Mahagun"], ["23", "Saya"], ["24", "Brand logo"], ["25", "Seth M.R. Jaipuria School"],
  ["26", "Valmiki Yatra"], ["27", "VLCC"], ["28", "Prepster Education"], ["29", "Hawelia Group"], ["30", "Jawed Habib"],
  ["31", "Arora Zaika"], ["32", "Globenir"], ["33", "Brand logo"], ["34", "St. Michael English School"], ["35", "School logo"],
  ["36", "International School of London"], ["37", "School logo"], ["38", "School logo"], ["39", "Madhuban Central School"], ["40", "Edunovate"],
  ["41", "Entertainment Magazine"], ["42", "The Warden Company"], ["43", "D’ Nature Eatery"], ["44", "Devdutt Exports Bharat"], ["45", "Minar"],
  ["46", "Inrext"], ["47", "APIT"], ["48", "Profitium"], ["49", "Gardentea"], ["50", "School logo"],
  ["51", "Mente Asia"], ["52", "Bodhi Tree"], ["53", "Sanjay Timber House"], ["54", "Zein Marine"], ["55", "UCTPL"],
  ["56", "Ultimate Dreamers"],
];

const half = Math.ceil(BRANDS.length / 2);
const ROWS = [BRANDS.slice(0, half), BRANDS.slice(half)];

function Tiles({ brands, copy }: { brands: typeof BRANDS; copy?: boolean }) {
  return brands.map(([file, name]) => (
    <span key={file} className="brand-tile">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/brands/${file}.png`} alt={copy ? "" : name} width={150} height={84} loading="lazy" decoding="async" />
    </span>
  ));
}

/** The section under the home hero: two rows of logos drifting opposite ways on a smoked-glass slab. */
export function BrandLogos() {
  return (
    <section className="brand-section" aria-labelledby="brands-heading">
      <div className="brand-slab">
        <header className="brand-head">
          <p className="brand-eyebrow">FROM LOCAL NAMES TO NATIONAL ONES</p>
          <h2 id="brands-heading" className="brand-title">
            WORKED WITH THESE BRANDS
          </h2>
        </header>
        <div className="brand-rows">
          {ROWS.map((row, i) => (
            <div key={i} className={`brand-row${i % 2 ? " brand-row-reverse" : ""}`}>
              {/* The second copy makes the loop seamless; screen readers skip it. */}
              <div className="brand-track">
                <div className="brand-set">
                  <Tiles brands={row} />
                </div>
                <div className="brand-set brand-set-copy" aria-hidden="true">
                  <Tiles brands={row} copy />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
