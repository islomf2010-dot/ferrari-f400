/**
 * Every word on the site lives here.
 *
 * Figures are for the European-specification road F40 built 1987–1992, checked
 * against Ferrari's own published specification sheet and the factory data
 * published with the car. Where sources disagree — and for this car they do —
 * the factory figure is the one used and the disagreement is not printed.
 *
 *   Engine          Tipo F120A · 2,936 cc (2.9 L) · 90° V8 · twin turbocharged,
 *                   intercooled · IHI units · four valves per cylinder, twin
 *                   overhead camshafts per bank · compression 7.7 : 1
 *   Output          478 PS (352 kW) at 7,000 rpm · 577 N·m at 4,000 rpm
 *                   (484 PS for the US specification)
 *   Performance     324 km/h · 0–100 km/h 4.1 s · 0–400 m 11.9 s
 *   Mass            1,100 kg dry
 *   Body            L 4,358 · W 1,970 · H 1,124 mm · wheelbase 2,450 mm
 *   Tyres           245/40 ZR17 front · 335/35 ZR17 rear
 *   Transmission    five-speed manual transaxle, rear wheels
 *   Production      1,311 cars, 1987–1992
 *
 * Note on one commonly repeated error: the F40's V8 has FOUR valves per
 * cylinder, not five. The five-valve cylinder head belongs to the 288 GTO
 * series and the racing F40 LM. The road car's larger capacity, higher boost
 * and higher compression ratio are where its power came from.
 */

export interface Spec {
  value: string;
  unit?: string;
  label: string;
}

export const SITE = {
  marque: 'Ferrari',
  model: 'F40',
  year: '1987',
  place: 'Maranello, Italy',
  tagline: 'Born to be driven.',
  /** Where the footage came from, so the provenance travels with the build. */
  footage: 'Cinematic study — Google Flow, 18 October 2026',
} as const;

export const NAV = [
  { id: 'reveal', label: 'The Reveal' },
  { id: 'machine', label: 'The Machine' },
  { id: 'story', label: 'The Story' },
] as const;

// ---------------------------------------------------------------------------
// THE MACHINE
// ---------------------------------------------------------------------------

export const MACHINE_SPECS: Spec[] = [
  { value: '2,936', unit: 'cc', label: 'V8, twin turbocharged' },
  { value: '478', unit: 'PS', label: 'At 7,000 rpm' },
  { value: '577', unit: 'N·m', label: 'At 4,000 rpm' },
  { value: '4.1', unit: 's', label: '0–100 km/h' },
  { value: '324', unit: 'km/h', label: 'Top speed' },
  { value: '1,100', unit: 'kg', label: 'Dry weight' },
];

export interface Chapter {
  id: string;
  index: string;
  kicker: string;
  title: string[];
  body: string[];
  figure?: {
    src: string;
    alt: string;
    /** Caption set beneath the plate. */
    caption: string;
    /** Which way the plate sits relative to the copy column. */
    side: 'left' | 'right';
  };
  specs?: Spec[];
}

export const CHAPTERS: Chapter[] = [
  {
    id: 'arrival',
    index: '01',
    kicker: 'Bologna, September 1987',
    title: ['Forty years,', 'in one car.'],
    body: [
      'Ferrari was founded in 1947. In September 1987 the company turned forty, and chose to mark it with a car rather than a celebration: the F40, presented at the Bologna Motor Show to an audience that had no idea yet what it was looking at.',
      'It arrived as the successor to the 288 GTO, but it was not a restyled one. Three years of work had gone into an engine two years old, a body eleven panels long, and a car that weighed almost nothing. The name was the brief. Everything else was the argument.',
    ],
    figure: {
      src: 'media/still/studio-haze.jpg',
      alt: 'A red Ferrari F40 under overhead spotlights, haze suspended in a dark studio.',
      caption: 'Front three-quarter, under the studio lights.',
      side: 'right',
    },
  },
  {
    id: 'engine',
    index: '02',
    kicker: 'The power unit',
    title: ['Two turbos.', 'No carpet.'],
    body: [
      'The Tipo F120A is a 2,936 cc 90° V8 — a 2.9-litre enlargement of the 288 GTO’s twin-turbocharged unit, fed by two IHI turbochargers and an intercooler. Compression went up to 7.7 : 1, boost went up from 0.8 to 1.1 bar, and each cylinder got a second injector. The result was 478 PS at 7,000 rpm and 577 N·m at 4,000.',
      'There is no fuel injection warm-up theatrics, no engine cover, and nowhere for the heat of two turbos and five exhaust runners to go except out through the louvred deck behind the seats. Dry-sump lubrication keeps the oil where the oil is when the car is on a circuit.',
    ],
    figure: {
      src: 'media/still/studio-profile.jpg',
      alt: 'The flank of a red Ferrari F40 in a dark studio, the side intake cutting into the door.',
      caption: 'The side intake, cut into the door skin.',
      side: 'left',
    },
    specs: [
      { value: '4', unit: 'valves/cyl', label: 'Twin overhead camshafts per bank' },
      { value: '1.1', unit: 'bar', label: 'Boost pressure' },
      { value: '7.7', unit: ': 1', label: 'Compression ratio' },
      { value: '32', unit: 'valves', label: 'In the entire V8' },
    ],
  },
  {
    id: 'construction',
    index: '03',
    kicker: 'The lightness',
    title: ['Eleven panels.', 'One thousand kilos.'],
    body: [
      'The body is carbon, Kevlar and aramid composite over a tubular steel frame with a bonded composite tub — the first Ferrari road car to be built mainly from composite. Large single sections front and rear meant the whole skin could be eleven panels rather than dozens of stamped ones.',
      'Every kilogram removed is a kilogram the engine does not have to lift. There is no carpet, no side trim, no door handles to catch the light. The F40’s dry weight is 1,100 kg, and almost nothing else on the road weighed that little while making this much noise.',
    ],
    figure: {
      src: 'media/still/wheel-badge.jpg',
      alt: 'Close detail of a five-spoke wheel with an F40 badge pressed into the bodywork behind it.',
      caption: 'F40 pressed into the flank above the front wheel.',
      side: 'right',
    },
  },
  {
    id: 'racing',
    index: '04',
    kicker: 'The competition line',
    title: ['A road car', 'racing first.'],
    body: [
      'Nearly everything on the F40 began on a circuit. The twin-turbo V8 came from Ferrari’s endurance programme. The NACA ducts, the flat floor, the louvred engine deck and the strut-mounted rear aerofoil are all heat-management and downforce devices — none of them are styling, and all of them work.',
      'The two-seater cabin is a road car only in the sense that it has a roof, a stereo and a road-type interior. Everything else — the pedal box, the shell, the visibility through a letterbox screen — was signed off by the same people who signed off the race cars.',
    ],
    figure: {
      src: 'media/still/rear-smoke.jpg',
      alt: 'The rear of a red Ferrari F40 in a dark workshop, tail lamps lit, smoke drifting past.',
      caption: 'Tail lamps lit, smoke in the workshop.',
      side: 'left',
    },
    specs: [
      { value: '335', unit: 'mm', label: 'Rear tyre section' },
      { value: '245', unit: 'mm', label: 'Front tyre section' },
      { value: '5', label: 'Speed, forward only' },
    ],
  },
];

// ---------------------------------------------------------------------------
// THE STORY
// ---------------------------------------------------------------------------

export interface LegacyMoment {
  year: string;
  title: string;
  body: string;
}

export const LEGACY: LegacyMoment[] = [
  {
    year: '1987',
    title: 'Bologna',
    body: 'Shown at the Bologna Motor Show in September 1987 to mark Ferrari’s fortieth anniversary — and named for it. Designed at Pininfarina, engineered by Nicola Materazzi. The last Ferrari to be launched while Enzo Ferrari was alive; the last road car he signed off personally.',
  },
  {
    year: '1992',
    title: 'The last one',
    body: 'Production ended in 1992 after 1,311 cars. By then the shape was already unmistakable — a wedge with one enormous rear wing, a single intake cut into each door, and nothing whatsoever on it that was there for decoration.',
  },
  {
    year: 'Today',
    title: 'Still the benchmark',
    body: 'No traction control, no manettino, no electronics of any kind between the right foot and the throttle. Everything Ferrari has built since has been faster and far more capable — and none of it has been simpler. The F40 is not a historical curiosity; it is the last time the company decided that subtraction was the whole answer.',
  },
];

export const STORY_COPY = {
  kicker: 'The significance',
  title: ['A landmark,', 'not a supercar.'],
  lede: 'The F40 is remembered not because it was the fastest thing Ferrari built, but because it was the last one built on a simple, expensive idea: take a car that works, take away everything that does not help, and give what is left to the driver.',
  footnote: 'European specification, 1987–1992 · 1,311 built',
};

export const COLOPHON = {
  lines: [
    'Cinematic footage generated in Google Flow, 18 October 2026.',
    'Edited, encoded and scrubbed frame-by-frame in the browser — no autoplay, no 3D, no cut.',
  ],
  source: 'Scuderia Ferrari · Maranello',
};