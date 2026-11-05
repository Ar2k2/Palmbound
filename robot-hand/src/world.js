// The whole world as a tile grid. Everything starts as rock; rooms are carved out of it.
// Tile units (1 tile = 40px). x = column, y = row (down). No three.js in here so it can run in node.
export const TILE = 40;
export const COLS = 250;
export const ROWS = 120;
export const AIR = 0, ROCK = 1, SLICK = 2, SPIKE = 3, CRACK = 4, BRICK = 5;
// slick = needs Suction to grip · spike = hurts · crack = Dash breaks it · brick = a Slam from above breaks it

export const grid = new Uint8Array(COLS * ROWS).fill(ROCK);
export const tileAt = (c, r) => (c < 0 || r < 0 || c >= COLS || r >= ROWS ? ROCK : grid[r * COLS + c]);

const put = (c, r, w, h, t) => { for (let y = r; y < r + h; y++) for (let x = c; x < c + w; x++) grid[y * COLS + x] = t; };
const carve = (c, r, w, h) => put(c, r, w, h, AIR);
const solid = (c, r, w = 1, h = 1, t = ROCK) => put(c, r, w, h, t);
// turn plain rock in a rectangle slick (leaves air and spikes alone)
const slick = (c, r, w, h) => { for (let y = r; y < r + h; y++) for (let x = c; x < c + w; x++) if (grid[y * COLS + x] === ROCK) grid[y * COLS + x] = SLICK; };

// ---------------- START: crawl, climb, hang ----------------
carve(2, 48, 18, 9);            // tall first room
solid(12, 51, 2, 6);            // climb this wall
carve(20, 53, 26, 4);           // low tunnel
solid(26, 54, 1, 3);            // climb into the ceiling corner...
carve(30, 57, 10, 2);           // ...to hang across this pit
solid(30, 58, 10, 1, SPIKE);
slick(29, 57, 1, 2); slick(40, 57, 1, 2);
carve(43, 57, 2, 2);            // a hole in the floor: the sewer, a pipe under the hub to its far side
carve(45, 58, 29, 1);
carve(60, 57, 2, 1); carve(72, 57, 2, 1);

// the west wall of the first room climbs forever, until it turns slick: Suction wing is up there
carve(2, 9, 6, 39);
slick(1, 9, 1, 28); slick(8, 9, 1, 28);

// ---------------- HUB ----------------
carve(46, 41, 30, 16);
solid(52, 41, 6, 16);           // the tower: its face is the right wall of the shaft above the west half
carve(46, 28, 6, 13);           // shaft up to the sky hall
solid(66, 48, 4, 9);            // perch

// east gate: a one-tile slick step, only Hop (or Suction) gets past
carve(76, 53, 10, 4);
solid(79, 56, 1, 1, SLICK);
slick(75, 52, 12, 1); slick(75, 57, 12, 1);

// ---------------- D WING (east, low): Dash lives here ----------------
carve(86, 50, 8, 7);
solid(89, 53, 2, 4);
carve(94, 46, 12, 11);          // big room: hang from the ceiling across the spikes
solid(96, 47, 2, 10);
solid(98, 56, 4, 1, SPIKE);
solid(102, 50, 4, 7);           // the far perch

// ---------------- SKY HALL ----------------
carve(40, 22, 40, 7);
solid(70, 24, 6, 5);            // perch
solid(46, 22, 2, 3);            // stalactites
solid(64, 22, 2, 2);
// west gate: cracked wall, only a Dash breaks it
carve(32, 25, 8, 4);
solid(38, 25, 2, 4, CRACK);
slick(32, 24, 8, 1); slick(32, 29, 8, 1);

// ---------------- G WING (west): Glide lives here ----------------
carve(22, 22, 10, 10);
solid(28, 25, 2, 7);            // tower with a gift on top
carve(10, 28, 12, 4);           // tunnel: spikes on the floor, cross by hanging
solid(14, 31, 4, 1, SPIKE);
solid(19, 29, 1, 3);
carve(10, 32, 5, 9);
carve(10, 36, 14, 5);           // shrine room
carve(16, 41, 2, 2);
solid(16, 42, 2, 1, SPIKE);   // pit before the shrine

// ---------------- CHASM: only Glide gets across ----------------
carve(80, 22, 13, 26);
solid(80, 46, 13, 2, SPIKE);
slick(79, 21, 16, 28);

// ---------------- S WING (east, mid): Suction lives here ----------------
carve(93, 30, 13, 7);           // landing cave
carve(99, 37, 6, 6);            // shaft down to the shrine
solid(99, 42, 2, 1, SPIKE);
// one-way route home so you are never stuck on this side
carve(102, 14, 4, 16);
carve(80, 14, 26, 3);
carve(76, 14, 4, 8);
slick(75, 14, 1, 8); slick(80, 17, 1, 5);

// ---------------- H WING (north): Hop lives here ----------------
carve(2, 5, 42, 4);             // sky path: from the top of the slick wall all the way east
solid(17, 6, 1, 3);             // climb, hang from the ceiling over the spikes below
carve(21, 9, 8, 2);
solid(21, 10, 8, 1, SPIKE);
carve(44, 4, 36, 6);
solid(66, 9, 6, 1, SPIKE);
solid(65, 5, 1, 5);             // climb up and hang over the spikes
solid(50, 6, 4, 4);

// ---------------- THE CORE: needs everything ----------------
carve(80, 5, 26, 4);
slick(80, 4, 26, 1); slick(80, 9, 26, 1);
solid(84, 8, 1, 1, SLICK);
solid(90, 5, 2, 4, CRACK);
carve(94, 9, 5, 2);
solid(94, 10, 5, 1, SPIKE);
slick(93, 9, 1, 2); slick(99, 9, 1, 2);
carve(100, 3, 6, 6);

// ---------------- THE CITADEL: Big Sprocket's arena, and the Core behind it ----------------
carve(106,5,8,5);               // passage east out of the old core room
carve(114,2,34,8);              // the arena: floor on row 10
solid(124,6,5,1); solid(134,6,5,1);   // two floating slabs to dodge around

// ---------------- THE FOUNDRY (east of the S wing): needs the whole hand ----------------
solid(106,34,1,3,CRACK);        // the door: only a Dash breaks it
carve(107,33,6,4);              // antechamber
carve(113,33,33,4);             // long hall
solid(118,34,1,3);              // climb into the ceiling corner...
solid(120,37,11,1,SPIKE);       // ...and hang across the spike floor
carve(143,22,3,11);             // dead end: the wall climbs on up a slick shaft
slick(146,22,1,11);
solid(146,33,2,4,CRACK);        // a second cracked wall ahead
carve(148,33,20,4);             // the far hall
carve(165,37,3,13);             // a hole in its floor, down to the Underworks

// ---------------- THE UNDERWORKS: one huge chamber to fall and glide through ----------------
carve(146,50,22,26);
solid(146,75,22,1,SPIKE);
solid(146,64,6,1);              // west ledge: only a glide gets there
solid(160,70,8,6);              // east ledge: the way back up is the east wall

// ---------------- SPROCKET YARD (off the D wing): Big Sprocket guards the Blaster ----------------
solid(106,47,1,3,CRACK);        // door, off the far perch: a Dash opens it
carve(107,47,6,3);
carve(113,44,28,14);            // the arena: floor on row 58
solid(118,52,5,1); solid(130,52,5,1); solid(124,48,4,1);

// ---------------- RUMBLE PIT (east of the Underworks): Old Rumble guards the Slam ----------------
solid(168,69,2,1,CRACK);        // door in the east wall, level with the east ledge
carve(170,67,8,3);
carve(178,60,34,10);            // the arena: floor on row 70
solid(195,70,4,1,BRICK);        // a patch of brick in the floor: a Slam goes straight through

// ---------------- THE CELLAR (under the brick): everything in here wants to bite ----------------
carve(195,71,4,9);
carve(176,80,64,18);
solid(205,97,12,1,SPIKE); solid(203,92,1,5);       // climb the pillar, hang over the spikes
solid(226,97,7,1,SPIKE); solid(224,92,1,5);

// ---------------- THE HOLLOWS (under the glide shrine): caves full of crawlers ----------------
carve(22,41,2,22);             // a hole in the shrine room floor, down through the start tunnel
solid(22,52,2,1,BRICK);        // ...but the shaft is bricked at the tunnel's ceiling (from below it is just more ceiling, so nobody climbs up into the G wing early)
solid(22,57,2,1,BRICK);        // ...and at the tunnel's floor: only a Slam gets you down, so nobody falls in early
carve(22,63,28,10);            // the cave starts at the shaft's foot, so its west wall is a straight climb back up
solid(26,72,6,1,SPIKE);
solid(35,67,1,6); solid(37,72,10,1,SPIKE);
carve(50,68,30,5);
carve(80,62,22,11);
carve(98,73,3,12);             // down again
carve(60,85,80,14);            // the deep hollows
solid(75,98,8,1,SPIKE);
solid(105,98,10,1,SPIKE); solid(103,93,1,5);
solid(122,98,8,1,SPIKE); solid(120,93,1,5);

// ---------------- THINGS IN THE WORLD ----------------
export const SPAWN = { c: 4, r: 56 };

export const CHECKPOINTS = [
  [4, 56], [41, 56], [64, 56], [44, 28], [94, 56], [104, 49], [12, 40], [102, 42], [47, 9], [9, 8], [82, 8],
  [95, 36], [24, 31], [77, 28], [110, 9], [110, 36], [149, 36], [162, 69],
  [110, 49], [172, 69], [182, 97], [24, 72], [90, 72], [64, 98], [234, 97],
];

// [id, column, row] (row = the tile the item floats in)
export const ITEMS = [
  ['dash', 103, 49], ['glide', 21, 40], ['suction', 101, 42], ['hop', 71, 55],
  ['overclock', 55, 58], ['gripgel', 58, 42], ['scanner', 72, 23],
  ['dashcharge', 28, 24], ['armor1', 89, 52],   // Twin Thrusters: the gift on the G-wing tower, behind the Dash-only cracked wall
  ['longfins', 92, 33], ['magnet', 12, 40],      // Long Fins: at the chasm's far mouth, 12 tiles out and below the lip: only a Glide gets there
  ['armor2', 103, 37], ['capacitor', 100, 33],
  ['airhop', 51, 5], ['knees', 77, 8],
  ['afterburner', 145, 25], ['armor3', 158, 36], ['coil', 164, 69], ['widefins', 148, 63],
  ['blaster', 138, 57], ['slam', 209, 69],
  ['rapid', 60, 72], ['triple', 96, 72], ['quake', 236, 97], ['armor4', 136, 98],
  ['core', 146, 9],
];

// [type, column, row, range in tiles]: crawlers walk the floor tile in that row, turrets stand on it, divers hang under the ceiling
export const ENEMIES = [
  ['crawler', 52, 72, 10], ['crawler', 33, 72, 1], ['crawler', 88, 72, 6], ['crawler', 70, 98, 6], ['crawler', 88, 98, 6], ['crawler', 132, 98, 3],
  ['crawler', 182, 97, 4], ['crawler', 221, 97, 3], ['crawler', 137, 36, 4], ['crawler', 155, 36, 6], ['crawler', 92, 56, 1.5],
  ['turret', 140, 36], ['turret', 160, 36], ['turret', 200, 97], ['turret', 234, 97], ['turret', 118, 98], ['turret', 96, 98], ['turret', 48, 72],
  ['diver', 31, 63], ['diver', 40, 63], ['diver', 65, 68], ['diver', 80, 85], ['diver', 110, 85], ['diver', 130, 85],
  ['diver', 190, 80], ['diver', 214, 80], ['diver', 135, 33], ['diver', 150, 33],
];

// the bosses: arenas in tiles, and the item each one guards (it stays hidden until the boss is down)
export const BOSSES = [
  { id: 'sprocket', name: 'BIG SPROCKET', kind: 'flyer', hp: 5, x0: 114, x1: 140, top: 45, floor: 58, reward: 'blaster', hue: 0xc23a46, aura: 0xff2a3a,
    intro: 'BIG SPROCKET\nWhen it is dizzy on the floor, Dash into it.', win: 'Big Sprocket powers down.\nIt was guarding something.' },
  { id: 'rumble', name: 'OLD RUMBLE', kind: 'roller', hp: 10, x0: 179, x1: 211, top: 60, floor: 70, reward: 'slam', hue: 0x5a6a8a, aura: 0xffa13d,
    intro: 'OLD RUMBLE\nIts armour shrugs off a Dash. Shoot it when it is dizzy!', win: 'Old Rumble stops rumbling.\nIt was guarding something.' },
  { id: 'keeper', name: 'THE KEEPER', kind: 'flyer', hp: 8, x0: 115, x1: 147, top: 3, floor: 10, reward: 'core', hue: 0x5a3acf, aura: 0x8a5aff, hard: true,
    intro: 'THE KEEPER\nIt guards the Core. Dash it when it falls, or shoot it.', win: 'The Keeper falls.\nThe Core is exposed.' },
];

// [column, row, 'x' | 'y', amplitude in tiles, speed]
export const FLOATERS = [
  [50, 28, 'x', 3, 1.3], [61, 28, 'x', 2, 1.1],
  [26, 27, 'y', 3, 1.4],
  [128, 33, 'x', 3, 1.1], [156, 35, 'x', 4, 1.3],
  [156, 58, 'x', 5, 0.8],
  [102, 38, 'y', 3, 1.2],
  [101, 32, 'x', 2, 1.5],
  [58, 6, 'y', 1.5, 1.3],
];

export const HINTS = [
  [3, 50, 'Crawl with ← →'],
  [8, 49, 'Hold toward a wall\nand press ↑ to climb'],
  [20, 54, 'Climb the block, and keep ↑ held\nat the top to catch the ceiling.\nThen ← → to hang across.'],
  [47, 42, 'This place is a mess.\nFour doors. Nothing fits yet.'],
  [78, 50, 'A tiny ledge.\nSo small...'],
  [41, 23, 'Cracked. Hit it hard.'],
  [3, 33, 'Smooth as ice up there.\nNothing to hold on to...'],
  [74, 19, 'A chasm. Too wide to cross?'],
  [66, 25, 'Walk off the edge,\nthen hold Space / Z.'],
  [97, 31, 'Another cracked wall.\nThis one leads somewhere new.'],
  [108, 30, 'The Foundry.\nOnly a whole hand gets through.'],
  [107, 6, 'Something big\nis asleep in there.'],
  [96, 47, 'Another cracked wall,\nhigh on the perch.'], [172, 64, 'Rumbling.'], [196, 66, 'Bricks. Something heavy\nwould go right through.'],
  [24, 44, 'A long drop, and bricks\nat the bottom. Something heavy\nwould go right through.'],
  [22, 56, 'Bricks in the floor.\nSomething heavy would go through.'], // low, so it never overlaps the ceiling-corner hint at (20,54)
];

// [col0, row0, col1, row1, 0xRRGGBB] colours the back wall so each region feels different
export const TINTS = [
  [0, 0, COLS, ROWS, 0x1a1d29],
  [76, 44, 110, 60, 0x2a1d24],   // dash wing
  [0, 14, 40, 44, 0x1a2a24],     // glide wing
  [80, 12, 110, 50, 0x1a2530],   // suction wing
  [0, 0, 80, 14, 0x2b2540],     // hop wing
  [80, 0, 110, 12, 0x30221e],    // core
  [0, 44, 76, 60, 0x1c2030],
  [106, 0, 170, 21, 0x301a22],   // citadel
  [106, 21, 170, 46, 0x2e1c14],  // foundry
  [106, 46, 170, 80, 0x1a1c34],  // underworks
  [106, 43, 146, 60, 0x2c2616],  // sprocket yard
  [168, 56, 250, 80, 0x2a1a2e],  // rumble pit
  [168, 80, 250, 120, 0x12282e], // cellar
  [0, 60, 106, 120, 0x182a1c],   // hollows
];
