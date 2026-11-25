// noprotect
// (tells the p5.js web editor not to insert loop-protection code, which would slow the heavy painting loops)
//
// ACKNOWLEDGEMENT OF AI USE
// I used Claude (Anthropic 2026) to help write and revise the JavaScript in this file.
// Claude wrote draft code from my written instructions and my reference drawings, and rewrote parts of it when I asked for changes. The idea, the look and the decisions are mine:
//   - I sketched the drawing and wrote the brief for this piece.
//   - I decided on the three palettes (aqua/lilac, rose/celadon, blue/blush).
//   - I asked for each change over many rounds and tested every version in the p5.js web editor.
//   - I asked for the animation (strokes on the main wave appear gradually, layer on top of each other, and a new pattern on every refresh); Claude wrote the recording and playback code for it.
//   - I asked for the background to fade in gradually along the ribbon; Claude wrote the mask and timing code, which I tested and tuned.
//   - I asked for the painting to be embedded in my webpage; Claude wrote the small WEBPAGE hooks listed below, which I tested in the browser.
//   - I picked which versions to keep, tuned the settings, and edited and commented the code.
// Claude's output was not used without checking.
// Reference list entry:
//   Anthropic (2026) Claude [Large language model], accessed 17 November 2026. https://claude.ai
//
// Author: Nguyen Hoang Tue Minh, s4183536 - COMM2754 Assignment 1
//
// HOW THE PIECE WORKS (overview)
//   1. A random seed picks a palette and a random S-shaped curve across the canvas.
//   2. Widths are added to the spine to make a ribbon (the silk wave), and a ripple is added along it.
//   3. The ribbon is painted with thousands of bristle-brush strokes in layers. Every stroke is queued (recorded) with a time instead of being drawn, so it can be played back as an animation.
//   4. The marbled background, the background waves and the lotus leaves are painted around the ribbon.
//   5. draw() plays the queue back over time onto a hidden canvas and shows it on screen through a fade-in mask.
//   6. Weaving: strokes on the two halves of the ribbon are two "threads". In each band along the ribbon one thread is "over" and paints a little later, so it lands on top of the other thread. The bands alternate, like a weave.
//
// Layout of this file: settings, palettes, helpers, ribbon, brush and paint layers, background, background waves, shading, leaves, flowers, animation, p5 setup and draw.

// ======================================================================
// SETTINGS
// All tuning values are collected here. Names starting RB_ belong to the ribbon, WV_ to the background waves.
// ======================================================================

// The seed drives every random choice, so the same seed always gives the same painting.
let rbSeed = Math.floor(Math.random() * 1e6);
// -1 = pick a random palette per load; 0, 1 or 2 forces one palette (useful while tuning)
const RB_FORCE_THEME = -1;

// --- ribbon shape ---
const RB_THICK   = 1.0;    // ribbon width multiplier
const RB_WAVE    = 9;      // ripple amplitude (px)
const RB_WAVE_GROW = 0.0025; // ripple gets slightly bigger further from the spine
const RB_WAVE_LAG  = 0.06;   // ripple is delayed with distance from the spine, so outer lines trail behind
const RB_CALM    = 0.3;    // calms the ripple at tight bends
const RB_CALM_R0 = 60;     // bend radius (px) below which the ripple is fully calmed
const RB_CALM_R1 = 260;    // bend radius (px) above which the ripple is untouched

// --- stroke density and look ---
const RB_COVER   = 1.0;    // base stroke density
const RB_LAYERS  = 0.5;    // density of the extra colour layers
const RB_POPNESS = 0.2;    // opacity of the extra layers
const RB_LEN     = 3;      // stroke length multiplier
const RB_DRY     = 1.0;    // dry-brush gaps (0 = solid)
const RB_STREAKS = 0.5;    // density of the faint vertical paper streaks
const RB_GAP     = 40;     // min gap between two parts of the ribbon that pass near each other

// --- curve-following background (washes hugging the ribbon) ---
const RB_BG = 1.0;         // density of the curve-following background
const RB_BG_REACH = 340;   // how far from the ribbon (px) these washes reach
const RB_BG_TUCK   = 0.5;  // how far a wash may tuck under the ribbon edge
const RB_BG_HALO   = 0.22; // strength of the soft halo rings
const RB_BG_BANDS  = 1.0;  // strength of the colour bands
const RB_BG_SMOOTH = 10;   // smoothing window of background strokes
const RB_BG_SQUEEZE = 0.99; // strokes where the bend squeezes more than this are skipped (avoids folded strokes)

// --- lotus flowers on the ribbon ---
const RB_LOTUS   = 1;      // 0 hides the lotus flowers on the ribbon
const RB_LOTUS_SHADOW = 0.5;   // chance that a flower casts a shadow
const RB_LOTUS_SHADOW_A = 0.3; // opacity of that shadow

// speed: highest pixel density used for the hidden painting layer.
// WEBPAGE: 1, because the canvas is already rendered at 1920 px wide and CSS scales it.
const RB_MAX_DPR = 1;

// --- animation: the ribbon is painted stroke by stroke ---
const RB_ANIM         = 1;         // 0 shows the finished picture at once
const RB_ANIM_SECONDS = [10, 16];  // how long the ribbon takes to paint (random per load)
const RB_LEAF_ANIM    = 0;         // 1 also grows the leaves and their flowers; 0 paints them at once
const RB_FRAME_MS     = 8;         // max milliseconds spent painting per frame (WEBPAGE: was 14; a smaller share leaves the browser time to scroll)
// WEBPAGE: the whole painting now finishes inside the painting time instead of running past it.
// The stroke layers (the last ones are the shading texture) overlap more and end at RB_STROKES_END, then the glaze and the
// flowers are added one after another while the wave is almost finished. The flowers must come after the last strokes,
// otherwise those strokes would paint over them. Times are shares of the painting time (RB_ANIM_SECONDS).
const RB_STROKES_END  = 0.85;      // the last wave and texture strokes end here
const RB_GLAZE_AT     = 0.86;      // the soft colour glaze
const RB_FINISH_FROM  = 0.88;      // the ribbon flowers appear one after another between these two times
const RB_FINISH_TO    = 0.98;
const RB_SCROLL_MS    = 3;         // WEBPAGE: painting budget per frame while the visitor is scrolling
const RB_SCROLL_IDLE_MS = 160;     // WEBPAGE: scrolling counts as stopped after this many ms without a scroll event
const RB_FPS          = 30;        // WEBPAGE: the animation redraws 30 times a second, not 60, so page scrolling stays smooth

// --- weaving: alternating over/under between the two halves of the ribbon ---
const RB_WEAVE       = 0.12; // how late (share of a layer's reveal window) the "over" strokes paint; 0 = off
const RB_WEAVE_BANDS = 7;    // number of over/under swaps along the ribbon

// --- animation of the background: it fades in along the ribbon ---
const RB_BG_ANIM   = 1;     // 0 shows the background at once
const RB_BG_FADE   = 0.25;  // how long each spot takes to fade in (share of the background time)
const RB_BG_SPEED  = 0.3;   // background takes this share of the ribbon's paint time (smaller = faster)
const RB_BG_HEAD   = 1.0;   // ribbon starts when this share of the background time has passed (1 = after, 0.8 = slight overlap)
const RB_BG_LAG    = 0.28;  // how much distance from the ribbon delays a spot (0 = pure thread order)
const RB_BG_LAGPX  = 450;   // distance (px) at which that delay is at its maximum
const RB_BG_RIBBON_PAD = 8; // the ribbon plus this margin is never hidden

// --- background waves: bands that echo the main wave ---
const WV_ON    = 1;    // 0 switches the background waves off
const WV_REACH = 1000; // max distance (px) a band may extend from the ribbon
const WV_BAND  = 75;   // target thickness (px) of one band
const WV_OVER  = 28;   // how far the outermost band overshoots, so its edge is irregular
const WV_COVER = 1.2;  // stroke density inside bands
const WV_MIN   = 14;   // smallest free space (px) that is still worth painting
const WV_OWN   = 45;   // a band stops if another part of the ribbon "owns" the spot (index distance)
const WV_EDGE  = 0.22; // opacity of the pigment pooling on the outer edge of a band
const WV_ALPHA = 0.6;  // overall opacity of band strokes
const WV_SOFT  = 7;    // blur (px) of the wet wash under a band
const WV_FOLD  = 0.92; // stop before the inner side of a bend folds over itself
const WV_LOOSEN = 200; // distance over which bands stop following the exact ribbon and loosen up
const WV_DRIFT  = 0.6; // how much the loosened bands drift sideways
const WV_CELL = 8, WV_PAD = 40; // cell size and edge padding of the "nearest ribbon sample" grid

// --- wave shading (light and shadow on the ribbon) ---
const RB_SHADE        = 0.2;  // master strength of all shading
const RB_SHADE_DEPTH  = 0.20; // how deep the shadow band along each bank is
const RB_SHADE_IRID   = 0.1;  // how much iridescent colour mixes into the shading
const RB_SHADE_RIPPLE = 0;    // ripple-based shading (0 = off)
const RB_SHADE_BODY   = 0.2;  // strength of the shading strokes on the ribbon body
const RB_SHADE_DROP   = 1.0;  // strength of the ribbon's drop shadow
// WEBPAGE: the shading strokes are almost transparent (alpha about 0.005), so blurring each one is invisible but very slow.
// 0 = no blur on them (fast), 1 = blur as before.
const RB_SHADE_SOFT   = 0;
const RB_LIGHT = [-0.55, -0.83];   // direction toward the light (upper left)

// --- background colour ---
const RB_RICH       = 1.0;  // master strength of the marbled colour
const RB_BG_FLUID   = 1.0;  // marbled colour field
const RB_BG_SWIRL   = 260;  // size of the marbling pattern
const RB_BG_SWIRLS  = 1.4;  // number of soft curling swirls
const RB_BG_PATCH   = 1.0;  // number of big blurred colour drifts
const RB_BG_VIGNETTE = 0.10; // darkening toward the corners
const RB_BG_BLUR    = true;  // canvas blur filter (Safari ignores it)

// The painting is designed on a 1136 x 640 grid; everything is scaled up to the real canvas size at render time.
const RB_W = 1136, RB_H = 640, RB_ASPECT = RB_W / RB_H;
const RB_RENDER_W = 1920;   // WEBPAGE: the painting is rendered once at this width (brief: 1920 x 1080); CSS scales the canvas

// ======================================================================
// PALETTES
// Every colour comes from the active theme. Colours are [r, g, b].
// Key fields of a theme:
//   paper       - background paper colour
//   fam         - colour families used for the ribbon body (teal banks, fin/egg/green/mint centre, leaf)
//   pop, popW   - colour groups for the extra layers, and how often each group is picked
//   shadow/edge - colours of the ribbon's depth strokes and edge lines
//   irid        - colour ramp (position 0-1) for the marbled background and shading
//   wv          - palettes of the background wave bands
//   leafPals / leafIrids - base and accent palettes for the lotus leaves
//   halo, vignette, glaze, drop, bankShadow, bankLight, deep, pale, leafEdge ... - single-purpose colours
//   lotus       - petal, inner, stamen and shadow colours of the flowers
// ======================================================================
const RB_THEMES = [
  // 0 aqua
  {
    name: 'aqua',
    paper: [228, 242, 238],
    fam: {
      teal:  [[74, 166, 172], [96, 180, 184], [130, 196, 206], [150, 190, 222]],
      strip: [[84, 156, 180], [110, 176, 196], [140, 196, 212]],
      fin:   [[150, 168, 214], [188, 190, 230], [226, 206, 230], [240, 222, 234], [250, 236, 240]],
      egg:   [[170, 186, 226], [200, 212, 240], [226, 230, 238], [238, 234, 224], [210, 226, 226]],
      green: [[96, 190, 196], [120, 204, 186], [168, 222, 170], [214, 230, 150], [150, 214, 200]],
      mint:  [[150, 200, 214], [186, 224, 214], [214, 236, 222]],
      leaf:  [[40, 160, 160], [60, 178, 172], [100, 200, 190]],
    },
    pop: [
      [[74, 166, 172], [96, 180, 184], [130, 196, 206], [150, 190, 222]],
      [[96, 190, 196], [120, 204, 186], [150, 214, 200]],
      [[150, 200, 214], [186, 224, 214], [214, 236, 222]],
      [[150, 168, 214], [188, 190, 230], [226, 206, 230]],
      [[226, 206, 230], [240, 222, 234], [250, 236, 240]],
      [[170, 186, 226], [200, 212, 240], [238, 234, 224]],
      [[168, 222, 170], [214, 230, 150], [150, 214, 200]],
    ],
    popW: [3, 3, 2, 2, 1.2, 1.5, 1.2],
    shadow: [[74, 166, 172], [84, 156, 180], [60, 150, 164]],
    edge: [60, 140, 150],
    irid: [[0.00, [208, 238, 226]], [0.20, [120, 196, 200]], [0.40, [112, 204, 224]],
           [0.60, [138, 172, 222]], [0.80, [196, 184, 236]], [1.00, [240, 214, 232]]],
    wv: [
      [[92, 176, 184], [120, 194, 200], [150, 206, 212]],
      [[120, 204, 186], [150, 214, 200], [186, 224, 214]],
      [[170, 214, 214], [196, 228, 226], [214, 236, 230]],
      [[176, 190, 228], [200, 208, 238], [226, 222, 240]],
      [[196, 226, 196], [214, 234, 208], [226, 242, 226]],
    ],
    leafPals: [
      [[112, 192, 182], [136, 206, 194], [162, 220, 206]],
      [[108, 188, 202], [134, 204, 214], [164, 218, 224]],
      [[122, 176, 208], [148, 192, 220], [176, 208, 228]],
      [[132, 204, 178], [160, 218, 190], [188, 228, 202]],
    ],
    leafIrids: [
      [[150, 190, 222], [184, 190, 234], [226, 208, 236]],
      [[150, 204, 214], [190, 198, 232], [238, 214, 232]],
    ],
    base: [140, 204, 208],
    halo: [[200, 232, 226], [186, 224, 222], [170, 216, 218], [160, 208, 216], [150, 200, 214], [140, 196, 210], [130, 190, 206]],
    vignette: [70, 150, 165],
    glaze: [[255, 236, 244], [170, 236, 232], [200, 220, 255]],
    drop: [62, 128, 150], bankShadow: [64, 128, 152], bankLight: [214, 240, 240],
    deep: [66, 128, 152], deepIr: [96, 124, 196], pale: [226, 246, 244],
    leafEdge: [100, 164, 176], leafDrop: [84, 150, 172], leafShade: [96, 156, 178], vein: [244, 252, 250],
    streak: [[255, 255, 255], [190, 236, 232], [150, 210, 214], [232, 224, 244], [246, 226, 236]],
    hi: [[240, 248, 248], [248, 240, 248], [236, 246, 240]],
    accG: [[214, 232, 120], [236, 240, 170], [130, 210, 190]],
    accO: [[150, 166, 222], [176, 186, 232], [255, 250, 246], [244, 214, 232]],
    dry: [[255, 255, 255], [255, 255, 255], [210, 242, 238], [230, 226, 244], [190, 236, 232]],
    accW: [[250, 254, 252], [250, 254, 252], [226, 232, 248], [214, 236, 226]],
    lotus: { petals: [[214, 226, 240], [246, 244, 248], [255, 252, 248]], inner: [244, 214, 226],
             stamen: [[226, 220, 150], [214, 226, 140], [240, 236, 190]], shadow: [52, 116, 140] },
  },

  // 1 antique rose + celadon
  // (also uses famW = extra weight per colour family, and leafAcc = how often leaves use their accent palette)
  {
    name: 'antique rose + celadon',
    paper: [238, 228, 210],
    fam: {
      teal:  [[201, 149, 130], [190, 136, 118], [217, 181, 160], [201, 160, 140]],
      strip: [[190, 138, 120], [201, 149, 130], [217, 181, 160]],
      fin:   [[217, 181, 160], [225, 196, 172], [230, 213, 185], [236, 224, 200], [240, 232, 214]],
      egg:   [[217, 181, 160], [222, 190, 168], [230, 213, 185], [232, 220, 196], [226, 206, 180]],
      green: [[190, 190, 160], [168, 182, 160], [150, 172, 150], [196, 200, 170], [217, 181, 160]],
      mint:  [[190, 190, 164], [205, 198, 172], [225, 208, 180]],
      leaf:  [[201, 149, 130], [190, 140, 120], [217, 181, 160]],
    },
    pop: [
      [[201, 149, 130], [217, 181, 160], [190, 140, 120], [210, 165, 145]],
      [[190, 134, 112], [201, 149, 130], [212, 168, 148]],
      [[230, 213, 185], [222, 200, 172], [217, 181, 160]],
      [[168, 182, 160], [190, 198, 170], [217, 206, 178]],
      [[230, 213, 185], [236, 224, 200], [217, 181, 160]],
      [[226, 206, 180], [236, 224, 200], [230, 213, 185]],
      [[168, 182, 160], [185, 190, 160], [217, 181, 160]],
    ],
    popW: [3, 3, 2, 2.2, 1.4, 1.5, 2.2],
    famW: { green: 2.6, mint: 1.6 },
    leafAcc: 1.5,
    shadow: [[168, 120, 104], [158, 110, 94], [148, 102, 88]],
    edge: [140, 98, 84],
    irid: [[0.00, [236, 226, 208]], [0.20, [226, 198, 176]], [0.40, [217, 181, 160]],
           [0.55, [190, 186, 160]], [0.66, [172, 186, 162]], [0.78, [212, 198, 172]],
           [0.90, [226, 204, 182]], [1.00, [230, 213, 185]]],
    wv: [
      [[201, 149, 130], [210, 165, 145], [217, 181, 160]],
      [[168, 182, 160], [184, 194, 164], [200, 204, 176]],
      [[230, 213, 185], [234, 220, 196], [238, 228, 206]],
      [[150, 172, 150], [176, 190, 162], [200, 206, 178]],
      [[226, 196, 174], [230, 208, 184], [234, 220, 198]],
    ],
    leafPals: [
      [[82, 107, 91], [113, 143, 125], [140, 163, 146]],
      [[113, 143, 125], [168, 170, 150], [201, 160, 140]],
      [[201, 149, 130], [217, 181, 160], [225, 196, 172]],
      [[190, 138, 118], [205, 155, 135], [217, 175, 155]],
    ],
    leafIrids: [
      [[201, 149, 130], [217, 181, 160], [225, 196, 172]],
      [[217, 181, 160], [230, 213, 185], [210, 170, 150]],
    ],
    base: [217, 181, 160],
    halo: [[232, 222, 204], [230, 214, 192], [228, 206, 182], [224, 198, 174], [220, 190, 168], [214, 180, 158], [208, 170, 148]],
    vignette: [150, 110, 90],
    glaze: [[250, 236, 214], [222, 228, 204], [244, 214, 196]],
    drop: [120, 80, 66], bankShadow: [150, 100, 84], bankLight: [244, 232, 212],
    deep: [160, 108, 92], deepIr: [150, 140, 112], pale: [240, 226, 204],
    leafEdge: [120, 98, 84], leafDrop: [110, 84, 70], leafShade: [110, 92, 78], vein: [244, 238, 222],
    streak: [[250, 244, 230], [236, 222, 200], [226, 206, 180], [214, 208, 184], [236, 214, 198]],
    hi: [[246, 238, 222], [250, 242, 230], [238, 236, 218]],
    accG: [[168, 182, 160], [190, 196, 168], [206, 206, 176]],
    accO: [[201, 149, 130], [230, 213, 185], [250, 242, 230], [217, 181, 160]],
    dry: [[250, 244, 232], [250, 244, 232], [236, 226, 206], [226, 214, 190], [214, 208, 184]],
    accW: [[250, 244, 232], [250, 244, 232], [236, 226, 206], [214, 214, 188]],
    lotus: { petals: [[232, 214, 206], [246, 238, 228], [252, 246, 238]], inner: [226, 180, 168],
             stamen: [[226, 200, 130], [214, 190, 120], [236, 214, 160]], shadow: [110, 76, 64] },
  },

  // 2 antique blue + blush
  // (irAlpha = custom opacity curve for the marbled field of this palette)
  {
    name: 'antique blue + blush',
    paper: [232, 226, 212],
    fam: {
      teal:  [[64, 94, 120], [78, 110, 134], [100, 134, 154], [88, 124, 146]],
      strip: [[64, 94, 120], [100, 134, 154], [150, 150, 170]],
      fin:   [[100, 134, 154], [130, 160, 176], [154, 183, 192], [216, 181, 173], [233, 214, 195]],
      egg:   [[100, 134, 154], [154, 183, 192], [216, 181, 173], [226, 196, 188], [233, 214, 195]],
      green: [[84, 126, 142], [110, 150, 160], [154, 183, 192], [216, 181, 173], [210, 196, 190]],
      mint:  [[154, 183, 192], [196, 196, 198], [216, 181, 173]],
      leaf:  [[64, 94, 120], [56, 88, 110], [84, 116, 138]],
    },
    pop: [
      [[64, 94, 120], [100, 134, 154], [84, 118, 140], [100, 134, 154]],
      [[88, 132, 146], [100, 146, 156], [120, 158, 168]],
      [[154, 183, 192], [180, 198, 200], [196, 208, 200]],
      [[64, 94, 120], [72, 100, 130], [100, 134, 154]],
      [[216, 181, 173], [226, 200, 188], [233, 214, 195]],
      [[196, 208, 200], [220, 214, 200], [233, 214, 195]],
      [[110, 150, 158], [154, 183, 192], [216, 181, 173]],
    ],
    popW: [3, 3, 2, 1.5, 3.4, 1.5, 1.6],
    famW: { fin: 1.7, egg: 2.1, green: 2.5, mint: 1.5 },
    leafAcc: 1.9,
    irAlpha: u => Math.min(1, Math.max(0.5, u < 0.1 ? 0.5 + 5 * u : 1 - 0.3 * Math.max(0, u - 0.8))),
    shadow: [[52, 80, 104], [58, 86, 110], [46, 74, 98]],
    edge: [44, 72, 94],
    irid: [[0.00, [233, 214, 195]], [0.16, [196, 208, 200]], [0.34, [154, 183, 192]],
           [0.50, [118, 150, 166]], [0.62, [216, 181, 173]], [0.74, [154, 183, 192]],
           [0.86, [222, 188, 182]], [1.00, [233, 214, 195]]],
    wv: [
      [[84, 118, 142], [100, 134, 154], [126, 156, 172]],
      [[120, 158, 170], [154, 183, 192], [180, 198, 200]],
      [[196, 208, 200], [214, 200, 196], [226, 200, 190]],
      [[160, 176, 190], [196, 186, 190], [216, 181, 173]],
      [[212, 172, 166], [220, 186, 178], [230, 204, 190]],
    ],
    leafPals: [
      [[100, 134, 154], [120, 152, 166], [146, 174, 184]],
      [[64, 94, 120], [84, 116, 140], [110, 140, 158]],
      [[110, 150, 156], [134, 168, 170], [160, 186, 184]],
      [[150, 168, 172], [190, 180, 180], [216, 190, 182]],
    ],
    leafIrids: [
      [[120, 152, 166], [190, 170, 176], [216, 181, 173]],
      [[154, 183, 192], [216, 181, 173], [226, 196, 188]],
    ],
    base: [100, 134, 154],
    halo: [[232, 218, 206], [222, 212, 204], [200, 212, 208], [184, 206, 206], [166, 194, 200], [146, 180, 192], [124, 158, 176]],
    vignette: [60, 90, 110],
    glaze: [[246, 222, 210], [190, 214, 214], [232, 200, 192]],
    drop: [40, 66, 90], bankShadow: [48, 76, 100], bankLight: [226, 230, 222],
    deep: [48, 76, 100], deepIr: [90, 110, 150], pale: [226, 230, 222],
    leafEdge: [64, 94, 120], leafDrop: [48, 74, 96], leafShade: [52, 80, 104], vein: [236, 242, 238],
    streak: [[248, 242, 230], [196, 208, 200], [154, 183, 192], [226, 190, 184], [233, 214, 195]],
    hi: [[236, 240, 236], [244, 226, 220], [226, 236, 234]],
    accG: [[110, 150, 156], [154, 183, 192], [196, 208, 200]],
    accO: [[64, 94, 120], [154, 183, 192], [250, 244, 234], [216, 181, 173]],
    dry: [[248, 244, 236], [248, 244, 236], [214, 222, 214], [196, 208, 200], [233, 214, 195]],
    accW: [[248, 244, 236], [240, 214, 206], [214, 222, 214], [233, 200, 192]],
    lotus: { petals: [[222, 216, 214], [246, 240, 232], [252, 248, 240]], inner: [216, 181, 173],
             stamen: [[226, 200, 130], [214, 190, 120], [236, 214, 160]], shadow: [44, 70, 92] },
  },
];

// The active theme. rbApplyTheme copies the chosen theme's fields into short global names
// so the painting code can read them directly (RB_PAPER, RB_FAM ...).
let TH, RB_PAPER, RB_FAM, RB_POP, RB_POP_W, RB_SHADOW, RB_EDGE, RB_IRID, WV_PALS, RB_LEAF_PALS, RB_LEAF_IRIDS;
let rbThemeIdx = RB_FORCE_THEME >= 0 ? RB_FORCE_THEME % RB_THEMES.length : Math.floor(Math.random() * RB_THEMES.length);
function rbApplyTheme(k) {
  TH = RB_THEMES[k];
  RB_PAPER = TH.paper; RB_FAM = TH.fam; RB_POP = TH.pop; RB_POP_W = TH.popW; RB_SHADOW = TH.shadow; RB_EDGE = TH.edge;
  RB_IRID = TH.irid; WV_PALS = TH.wv; RB_LEAF_PALS = TH.leafPals; RB_LEAF_IRIDS = TH.leafIrids;
}
rbApplyTheme(rbThemeIdx);

// Shared drawing state:
//   rbCw/rbCh  - real canvas size in px        rbCtx - 2D context of the hidden painting canvas
//   rbSC       - scale from the 1136 x 640 design grid to the canvas
//   rbBL       - scale applied to blur radii so blur looks the same at any canvas size
let rbCw, rbCh, rbCtx, rbSC, rbBL;
let rbEdgeGrid = null;          // spatial grid of ribbon outline points, used by rbEdgeDist
const RB_EDGE_CELL = 70;        // grid cell size (px)
let wvGrid = null;              // grid of "nearest ribbon sample" for every spot of the canvas (see wvBuildGrid)

// ======================================================================
// HELPERS: random numbers, noise, colour and maths
// All names start with rb so they cannot clash with p5 functions.
// ======================================================================

// runs fn n times (long while/for loops can trip the p5 editor's loop guard)
const rbRepeat = (n, fn) => Array.from({ length: Math.max(0, Math.round(n)) }, (_, q) => fn(q));

// Seeded random generator (mulberry32). Using our own generator instead of p5's random()
// makes a painting repeatable from its seed, and lets steps use separate random streams.
let rbRS = 1;                    // current state of the generator
function rbRnd() {
  rbRS = (rbRS + 0x6D2B79F5) | 0;
  let t = Math.imul(rbRS ^ (rbRS >>> 15), 1 | rbRS);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const rbR       = (a, b) => a + (b - a) * rbRnd();                     // random number between a and b
const rbPick    = arr => arr[Math.floor(rbRnd() * arr.length)];        // random element of an array
const rbSeedInt = () => Math.floor(rbR(1, 100000));                    // fresh sub-seed for a noise function
const rbCl      = (v, a, b) => Math.min(b, Math.max(a, v));            // clamp v into [a, b]
const rbMix     = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);    // blend two colours (or vectors) by t
const rbRgba    = (c, a) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`; // colour array -> canvas colour string
const rbTint    = (c, j) => { const d = rbR(-j, j); return c.map(v => rbCl(v + d + rbR(-j / 3, j / 3), 0, 255)); }; // small random colour variation (jitter j)
// samples a colour ramp (array of colours) at position t in 0-1
function rbGrad(pal, t) {
  t = rbCl(t, 0, 0.9999) * (pal.length - 1);
  const k = Math.floor(t);
  return rbMix(pal[k], pal[k + 1], t - k);
}
// integer hash -> number in 0-1. Same input always gives the same output.
function rbHash(i, s) {
  let h = Math.imul(i | 0, 374761393) ^ Math.imul(s | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
// 1D value noise: smoothly interpolated hash values. Used for gentle random variation along the ribbon.
function rbN(x, s) {
  const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f);
  return rbHash(i, s) * (1 - u) + rbHash(i + 1, s) * u;
}
// 1D fractal noise: three octaves of rbN, contrast-stretched around 0.5
function rbFbm(x, s) {
  const v = 0.6 * rbN(x, s) + 0.3 * rbN(x * 2.1, s + 17) + 0.1 * rbN(x * 4.3, s + 31);
  return rbCl(0.5 + (v - 0.5) * 1.7, 0, 1);
}
// 2D value noise and 2D fractal noise (used for the marbled background and the reveal mask)
function rbN2(x, y, s) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const h = (a, b) => rbHash(a + b * 7919, s);
  const a = h(ix, iy), b = h(ix + 1, iy), c = h(ix, iy + 1), d = h(ix + 1, iy + 1);
  return (a * (1 - ux) + b * ux) * (1 - uy) + (c * (1 - ux) + d * ux) * uy;
}
function rbFbm2(x, y, s) {
  return 0.55 * rbN2(x, y, s) + 0.3 * rbN2(x * 2.1, y * 2.1, s + 11) + 0.15 * rbN2(x * 4.3, y * 4.3, s + 23);
}
const rbSm = x => { x = rbCl(x, 0, 1); return x * x * (3 - 2 * x); };   // smoothstep: eases 0-1 with soft ends

// ======================================================================
// PATH TOOLS: turning a few control points into a smooth, evenly spaced curve
// ======================================================================

// Catmull-Rom spline: a smooth curve through the control points, sampled at n points
function rbSpline(ctrl, n) {
  const M = ctrl.length, out = [];
  for (let i = 0; i < n; i++) {
    const f = (i / (n - 1)) * (M - 1), k = Math.min(M - 2, Math.floor(f)), u = f - k;
    const p0 = ctrl[Math.max(k - 1, 0)], p1 = ctrl[k], p2 = ctrl[k + 1], p3 = ctrl[Math.min(k + 2, M - 1)];
    const cr = c => 0.5 * ((2 * p1[c]) + (-p0[c] + p2[c]) * u +
      (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * u * u +
      (-p0[c] + 3 * p1[c] - 3 * p2[c] + p3[c]) * u * u * u);
    out.push([cr(0), cr(1)]);
  }
  return out;
}
// unit normal (perpendicular direction) at every point of a path
function rbNorms(pts) {
  return pts.map((p, i) => {
    const a = pts[Math.max(i - 1, 0)], b = pts[Math.min(i + 1, pts.length - 1)];
    const dx = b[0] - a[0], dy = b[1] - a[1], m = Math.hypot(dx, dy) || 1;
    return [-dy / m, dx / m];
  });
}
// re-samples a path so consecutive points are about ds px apart
function rbResample(pts, ds) {
  const cum = rbCumDist(pts), total = cum[cum.length - 1];
  const n = Math.max(8, Math.round(total / ds) + 1), out = [];
  let j = 0;
  for (let k = 0; k < n; k++) {
    const s = (total * k) / (n - 1);
    while (j < cum.length - 2 && cum[j + 1] < s) { j++; }
    const f = (s - cum[j]) / ((cum[j + 1] - cum[j]) || 1);
    out.push([pts[j][0] + (pts[j + 1][0] - pts[j][0]) * f, pts[j][1] + (pts[j + 1][1] - pts[j][1]) * f]);
  }
  return out;
}
// distance travelled along the path up to each point
function rbCumDist(pts) {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) {
    cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  }
  return cum;
}
// moving-average smoothing of a path (w = window half-size, passes = repeats). End points stay fixed.
function rbSmoothPts(p, w, passes) {
  let cur = p;
  for (let ps = 0; ps < passes; ps++) { cur = cur.map((q, i) => rbSmoothAt(cur, i, w)); }
  return cur;
}
// average of the points within w steps of point i (the end points stay where they are)
function rbSmoothAt(cur, i, w) {
  if (i === 0 || i === cur.length - 1) return cur[i];
  let sx = 0, sy = 0, c = 0;
  for (let k = -w; k <= w; k++) {
    const j = i + k;
    if (j >= 0 && j < cur.length) { sx += cur[j][0]; sy += cur[j][1]; c++; }
  }
  return [sx / c, sy / c];
}
// same moving-average smoothing for a plain number array (changes the array in place)
function rbSmoothArr(a, w, passes) {
  const n = a.length;
  for (let p = 0; p < passes; p++) {
    const t = Float32Array.from(a);
    for (let i = 0; i < n; i++) {
      let sum = 0, cnt = 0;
      for (let k = -w; k <= w; k++) { const j = i + k; if (j >= 0 && j < n) { sum += t[j]; cnt++; } }
      a[i] = sum / cnt;
    }
  }
}

// ======================================================================
// THE RIBBON: spine, bend limits, ripple and widths
// "sys" is the ribbon coordinate system: C = spine points, N = normals, limP/limN = how far
// the ribbon may extend on each side before the inside of a tight bend would fold over itself,
// micro = the ripple, calm = how strongly the ripple is allowed at each point.
// ======================================================================

// Computes, for every spine point: the normal, a smoothed curvature, and from it the largest
// sideways distance (limP / limN, one per side) that is still free of folding.
function rbFrenet(C) {
  const { N, th, s } = rbDirAngles(C);
  rbUnwrapAngles(th);
  const [tmpP, tmpN] = rbBendRadii(rbCurvature(th, s));
  return { N, limP: rbWindowAvg(tmpP, 8), limN: rbWindowAvg(tmpN, 8) };
}
// normal, heading angle (th) and distance travelled (s) at every spine point
function rbDirAngles(C) {
  const n = C.length, N = [], th = new Float32Array(n), s = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = C[Math.max(i - 2, 0)], b = C[Math.min(i + 2, n - 1)];
    const tx = b[0] - a[0], ty = b[1] - a[1], m = Math.hypot(tx, ty) || 1;
    N.push([-ty / m, tx / m]);
    th[i] = Math.atan2(ty, tx);
    if (i) s[i] = s[i - 1] + Math.hypot(C[i][0] - C[i - 1][0], C[i][1] - C[i - 1][1]);
  }
  return { N, th, s };
}
// removes the 2*PI jumps of the heading angle (in place)
function rbUnwrapAngles(th) {
  for (let i = 1; i < th.length; i++) {
    while (th[i] - th[i - 1] > Math.PI) { th[i] -= 2 * Math.PI; }
    while (th[i] - th[i - 1] < -Math.PI) { th[i] += 2 * Math.PI; }
  }
}
// curvature = change of heading per distance, lightly smoothed
function rbCurvature(th, s) {
  const n = th.length, raw = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = Math.max(i - 2, 0), b = Math.min(i + 2, n - 1);
    raw[i] = (th[b] - th[a]) / ((s[b] - s[a]) || 1);
  }
  return rbWindowAvg(raw, 3);
}
// smallest bend radius (1 / curvature) within 14 samples, separately for left (positive) and right (negative) bends
function rbBendRadii(kap) {
  const n = kap.length, mp = new Float32Array(n), mn = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let p = 4000, q = 4000;
    for (let k = -14; k <= 14; k++) {
      const j = Math.min(n - 1, Math.max(0, i + k));
      if (kap[j] > 1e-4) p = Math.min(p, 1 / kap[j]);
      if (kap[j] < -1e-4) q = Math.min(q, -1 / kap[j]);
    }
    mp[i] = p; mn[i] = q;
  }
  return [mp, mn];
}
// moving average of a number array (window of +-w), returned as a new array
function rbWindowAvg(src, w) {
  const n = src.length, out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let sum = 0, cnt = 0;
    for (let k = -w; k <= w; k++) { const j = i + k; if (j >= 0 && j < n) { sum += src[j]; cnt++; } }
    out[i] = sum / cnt;
  }
  return out;
}
// The ripple shared by the ribbon and everything around it: a sine wave whose wavelength and
// strength wander with noise, so it looks hand-made rather than mechanical.
function rbMakeMicro(n) {
  const m = new Float32Array(n), sd = rbSeedInt();
  let ph = rbR(0, 6.28);
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1), lam = 34 + 12 * rbFbm(u * 2 + 1.7, sd);
    ph += (2 * Math.PI) / lam;
    const env = 0.6 + 0.4 * rbFbm(u * 1.6 + 4.1, sd + 9);
    m[i] = (env * (Math.sin(ph) + 0.04 * Math.sin(2 * ph + 1.1))) / 1.04;
  }
  rbSmoothArr(m, 2, 2);
  return m;
}
// ripple value at a (fractional) spine index x
function rbMicroAt(sys, x) {
  const n = sys.n, xc = rbCl(x, 0, n - 1), k = Math.min(n - 2, Math.floor(xc)), f = xc - k;
  return sys.micro[k] * (1 - f) + sys.micro[k + 1] * f;
}
// THE KEY MAPPING: converts (spine sample i, sideways distance v) to a canvas position.
// - the distance is squeezed with an exponential curve so the inner side of a tight bend never folds
// - then the ripple is added (unless flat = true)
function rbPos(sys, i, v, flat) {
  let w = v;
  if (v > 0) { const L = sys.limP[i] * 1.25; w = L * (1 - Math.exp(-v / L)); }
  else if (v < 0) { const L = sys.limN[i] * 1.25; w = -L * (1 - Math.exp(v / L)); }
  if (!flat) {
    const d = Math.abs(w);
    w += RB_WAVE * sys.calm[i] * (1 + RB_WAVE_GROW * d) * rbMicroAt(sys, i - RB_WAVE_LAG * d);
  }
  return [sys.C[i][0] + sys.N[i][0] * w, sys.C[i][1] + sys.N[i][1] * w];
}

// The hand-drawn spine: control points of the S-shaped wave on the 1136 x 640 grid.
const RB_SPINE = [[240, -65], [210, 15], [110, 105], [80, 205], [140, 275], [250, 280], [370, 275], [480, 315],
                  [580, 395], [670, 475], [770, 585], [880, 615], [990, 590], [1080, 535], [1180, 445]];
// Width keys: [position along the ribbon 0-1, half-width on the + side, half-width on the - side].
// They give the ribbon its swelling and narrowing shape.
const RB_KEYS = [[0, 150, 140], [0.052, 150, 140], [0.135, 100, 85], [0.2, 78, 86], [0.256, 68, 70], [0.323, 55, 65],
                 [0.397, 95, 70], [0.469, 150, 120], [0.548, 140, 245], [0.621, 165, 105], [0.713, 120, 85],
                 [0.783, 80, 72], [0.853, 85, 72], [0.917, 100, 70], [1, 110, 75]];

// Makes a new random version of the spine: random flips, stretch, small rotation,
// and every control point nudged. This is why each load is different.
function rbMakeSpine() {
  const flipX = rbRnd() < 0.5, flipY = rbRnd() < 0.5;
  const amp = rbR(0.85, 1.25), rot = rbR(-0.07, 0.07);
  const pts = RB_SPINE.map((p, i) => rbSpinePoint(p, i, { flipX, flipY, amp, rot }));
  return rbExtendEnds(pts);
}
// one random version of a spine control point: jitter, optional flip, vertical stretch, small rotation about the centre
function rbSpinePoint(p, i, o) {
  const cx = RB_W / 2, cy = RB_H / 2, last = RB_SPINE.length - 1;
  const j = (i < 2 || i > last - 2) ? 20 : 50;   // end points move less than middle points
  let x = p[0] + rbR(-j, j), y = cy + (p[1] + rbR(-j, j) - cy) * o.amp;
  if (o.flipX) x = RB_W - x;
  if (o.flipY) y = RB_H - y;
  const dx = x - cx, dy = y - cy, cr = Math.cos(o.rot), sr = Math.sin(o.rot);
  return [cx + dx * cr - dy * sr, cy + dx * sr + dy * cr];
}
// extends both ends of the spine straight outward until they are well past the canvas,
// so the ribbon always enters and leaves the picture. u0/u1 = where the visible part starts/ends (0-1).
function rbExtendEnds(pts) {
  const head = rbExtendEnd(pts[0], pts[1]), tail = rbExtendEnd(pts[pts.length - 1], pts[pts.length - 2]);
  const all = head.reverse().concat(pts, tail);
  let total = 0;
  for (let i = 1; i < all.length; i++) { total += Math.hypot(all[i][0] - all[i - 1][0], all[i][1] - all[i - 1][1]); }
  return { pts: all, u0: (head.length * RB_EXT_STEP) / total, u1: 1 - (tail.length * RB_EXT_STEP) / total };
}
const RB_EXT_STEP = 70;   // distance between the extra spine points added past each end
// extra points that continue the spine end `a` (coming from `b`) until it is well outside the canvas
function rbExtendEnd(a, b) {
  const M = 380, [dx, dy] = rbExtendDir(a, b), out = [];
  const outside = p => p[0] < -M || p[0] > RB_W + M || p[1] < -M || p[1] > RB_H + M;
  let p = a;
  for (let s = 0; s < 40 && !outside(p); s++) { p = [p[0] + dx * RB_EXT_STEP, p[1] + dy * RB_EXT_STEP]; out.push(p); }
  return out;
}
// direction to extend in: straight on, unless that points back toward the canvas centre
function rbExtendDir(a, b) {
  const cx = RB_W / 2, cy = RB_H / 2;
  let dx = a[0] - b[0], dy = a[1] - b[1], m = Math.hypot(dx, dy) || 1;
  dx /= m; dy /= m;
  if (dx * (a[0] - cx) + dy * (a[1] - cy) < 0) {
    dx = a[0] - cx; dy = a[1] - cy; m = Math.hypot(dx, dy) || 1; dx /= m; dy /= m;
  }
  return [dx, dy];
}
// Builds the whole ribbon coordinate system: spline through the spine, small noise wobble,
// resample to 4 px spacing, bend limits, ripple calming and ripple.
function rbMakeSys() {
  const sp = rbMakeSpine(), dense = rbSpline(sp.pts, sp.pts.length * 30), sd = rbSeedInt();
  const C = rbResample(rbSmoothPts(rbWobbleSpine(dense, sd), 6, 3), 4), fr = rbFrenet(C);
  const sys = { n: C.length, C, N: fr.N, limP: fr.limP, limN: fr.limN, u0: sp.u0, u1: sp.u1 };
  sys.calm = rbCalmArray(sys);
  sys.micro = rbMakeMicro(sys.n);
  return sys;
}
// nudges every spine point sideways by a small noise amount so the curve is not perfectly smooth
function rbWobbleSpine(dense, sd) {
  const dn = rbNorms(dense);
  return dense.map((p, k) => {
    const u = k / (dense.length - 1), a = 2.5 * (2 * rbFbm(u * 5, sd) - 1) * (0.4 + 0.6 * rbN(u * 3.1, sd + 7));
    return [p[0] + dn[k][0] * a, p[1] + dn[k][1] * a];
  });
}
// calm factor: 1 on gentle stretches, lower on tight bends
function rbCalmArray(sys) {
  const calm = new Float32Array(sys.n);
  for (let i = 0; i < sys.n; i++) {
    const r = Math.min(sys.limP[i], sys.limN[i]);
    const t = rbSm((r - RB_CALM_R0) / (RB_CALM_R1 - RB_CALM_R0));
    calm[i] = rbCl(1 - RB_CALM * (1 - t), 0.1, 1);
  }
  rbSmoothArr(calm, 10, 3);
  return calm;
}
// Width of each side of the ribbon at every spine point: interpolates RB_KEYS (with random
// variation), adds a few random bulges, then smooths. Returns hp (+ side) and hm (- side).
function rbMakeWidths(sys) {
  const n = sys.n, hp = new Float32Array(n), hm = new Float32Array(n), sd = rbSeedInt();
  rbBaseWidths(sys, hp, hm);
  rbWidthBulges(sys, hp, hm);
  rbWidthNoise(hp, hm, sd);
  rbSmoothArr(hp, 14, 5);
  rbSmoothArr(hm, 14, 5);
  return { hp, hm };
}
// fills both half-width arrays from RB_KEYS (each key randomly varied), eased between keys
function rbBaseWidths(sys, hp, hm) {
  const n = sys.n, span = sys.u1 - sys.u0;
  const KEYS = RB_KEYS.map(k => [k[0], k[1] * rbR(0.88, 1.15), k[2] * rbR(0.88, 1.15)]);
  for (let i = 0; i < n; i++) {
    const uo = rbCl((i / (n - 1) - sys.u0) / span, 0, 1);
    let k = 0;
    while (k < KEYS.length - 2 && uo > KEYS[k + 1][0]) { k++; }
    const f = rbCl((uo - KEYS[k][0]) / (KEYS[k + 1][0] - KEYS[k][0]), 0, 1), s = f * f * (3 - 2 * f);
    hp[i] = KEYS[k][1] + (KEYS[k + 1][1] - KEYS[k][1]) * s;
    hm[i] = KEYS[k][2] + (KEYS[k + 1][2] - KEYS[k][2]) * s;
  }
}
// nine random bulges (or pinches) on one side of the ribbon
function rbWidthBulges(sys, hp, hm) {
  const n = sys.n, span = sys.u1 - sys.u0;
  for (let q = 0; q < 9; q++) {
    const c = sys.u0 + rbR(0.04, 0.96) * span, sg = rbR(0.02, 0.045) * span;
    const h = rbR(0.04, 0.12) * (rbRnd() < 0.3 ? -0.6 : 1), arr = rbRnd() < 0.5 ? hp : hm;
    for (let i = 0; i < n; i++) { arr[i] *= 1 + h * Math.exp(-Math.pow((i / (n - 1) - c) / sg, 2)); }
  }
}
// slow noise on both widths
function rbWidthNoise(hp, hm, sd) {
  const n = hp.length;
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1);
    hp[i] *= RB_THICK * (1 + 0.07 * (2 * rbFbm(u * 9, sd) - 1));
    hm[i] *= RB_THICK * (1 + 0.07 * (2 * rbFbm(u * 9 + 5, sd + 3) - 1));
  }
}

// ---- checking a ribbon ----
// Scores a candidate ribbon. Returns -1 if its ends are visible inside the canvas (it must run
// off the canvas at both ends), otherwise the closest distance between two distant parts of the
// ribbon (bigger = the ribbon does not touch or overlap itself).
function rbCheck(sys, wd) {
  const n = sys.n, poly = rbOutline(sys, wd, 0, 12, 0);
  if (rbEndsInside(poly, n)) return -1;
  const P = rbGapPoints(poly, n), grid = rbGapGrid(P);
  return P.reduce((best, q) => Math.min(best, rbNearestOther(P, grid, q)), 999);
}
// true if either end cap of the outline is visible inside the canvas
function rbEndsInside(poly, n) {
  for (const [a, b] of [[poly[0], poly[2 * n - 1]], [poly[n - 1], poly[n]]]) {
    for (let t = 0; t <= 12; t++) {
      const x = a[0] + (b[0] - a[0]) * t / 12, y = a[1] + (b[1] - a[1]) * t / 12;
      if (x > -6 && x < RB_W + 6 && y > -6 && y < RB_H + 6) return true;
    }
  }
  return false;
}
const rbGridKey = (cx, cy) => (cx + 100) * 1000 + (cy + 100);
// every second outline point near the canvas, with the spine index it belongs to
function rbGapPoints(poly, n) {
  const P = [];
  for (let i = 0; i < 2 * n; i += 2) {
    const p = poly[i];
    if (p[0] < -60 || p[0] > RB_W + 60 || p[1] < -60 || p[1] > RB_H + 60) continue;
    P.push([p[0], p[1], i < n ? i : 2 * n - 1 - i]);
  }
  return P;
}
// spatial grid of those points (cell size RB_GAP) for fast neighbour search
function rbGapGrid(P) {
  const G = RB_GAP, grid = new Map();
  P.forEach((q, k) => {
    const key = rbGridKey(Math.floor(q[0] / G), Math.floor(q[1] / G));
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key).push(k);
  });
  return grid;
}
// distance to the nearest outline point that belongs to a far-away part of the ribbon (index distance >= 40)
function rbNearestOther(P, grid, q) {
  const G = RB_GAP, cx = Math.floor(q[0] / G), cy = Math.floor(q[1] / G);
  let best = 999;
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      for (const k of grid.get(rbGridKey(cx + dx, cy + dy)) || []) {
        if (Math.abs(P[k][2] - q[2]) < 40) continue;
        best = Math.min(best, Math.hypot(P[k][0] - q[0], P[k][1] - q[1]));
      }
    }
  }
  return best;
}
// Tries up to 80 random ribbons and keeps the best one (stops early once one has a gap of at least RB_GAP).
function rbBuild() {
  let best = null;
  rbRepeat(80, () => {
    if (best && best.score >= RB_GAP) return;
    const sys = rbMakeSys(), wd = rbMakeWidths(sys), score = rbCheck(sys, wd);
    if (!best || score > best.score) best = { sys, wd, score };
  });
  return best;
}

// ======================================================================
// BRISTLE BRUSH
// Every stroke in the painting is made by rbBrush: a bundle of thin parallel lines (bristles)
// that follow a path, with width taper, random dry gaps and colour jitter.
// While the animation is being recorded (rbRecording), a stroke is queued instead of drawn.
// Speed: the values that only depend on the point (normal, width, taper, dry-gap chance) are worked out once
// per stroke and shared by all bristles. The random numbers are used in the same order as before.
// pts = path points; wv = stroke width (number or one per point); col = colour; a = opacity
// o = options: dry (gap chance), taper (thin ends), jit (colour jitter), col2 (end colour of a gradient),
//     mode (blend mode), smooth (no gaps/ripple, curved through midpoints)
// ======================================================================
function rbBrush(pts, wv, col, a, o) {
  if (rbRecording) { rbRecordStroke(pts, wv, col, a, o); return; }
  o = o || {};
  if (pts.length < 2) return;
  const c = rbCtx, B = rbBrushGeom(pts, wv, o);
  rbBrushState(c, o);
  const S = rbBrushScratch(c, pts, B);
  try {
    rbRepeat(B.k, q => rbBristle(c, S, pts, B, q, col, a, o));
  } finally { if (S) { rbScratchClose(S); } }
}
// Values that depend only on the stroke, worked out once and shared by all bristles:
// k = number of bristles, lw = width of one bristle, and per point: normal (nx, ny), width (wa), taper (tw), dry-gap chance (thr).
function rbBrushGeom(pts, wv, o) {
  const n = pts.length, wAt = i => (typeof wv === 'number' ? wv : wv[i]);
  let avg = 0;
  for (let i = 0; i < n; i++) { avg += wAt(i); }
  avg /= n;
  const dry = (o.dry === undefined ? 0.06 : o.dry) * RB_DRY;
  const G = { n, k: Math.max(2, Math.min(12, Math.round(avg / 2.2))), nx: [], ny: [], wa: [], tw: [], thr: [] };
  G.lw = Math.max(0.6, (avg / G.k) * 1.7);
  for (let i = 0; i < n; i++) { rbBrushPoint(G, pts, i, wAt(i), o, dry); }
  return G;
}
// adds the per-point values of point i to G
function rbBrushPoint(G, pts, i, w, o, dry) {
  const n = pts.length, p = pts[Math.max(i - 1, 0)], q = pts[Math.min(i + 1, n - 1)];
  const dx = q[0] - p[0], dy = q[1] - p[1], m = Math.hypot(dx, dy) || 1, t = i / (n - 1);
  G.nx.push(-dy / m); G.ny.push(dx / m);
  G.wa.push(w);
  G.tw.push(o.taper ? Math.pow(Math.sin(Math.PI * rbCl(t, 0.04, 0.96)), o.taper) : 1);
  G.thr.push(dry * (0.2 + 0.9 * t) * 0.3);
}
function rbBrushState(c, o) {
  c.globalCompositeOperation = o.mode || 'source-over';
  c.lineCap = 'round';
  c.lineJoin = 'round';
}
// opens the scratch canvas when this stroke is blurred (see rbScratchOpen); null = draw directly on the painting
function rbBrushScratch(c, pts, B) {
  if (!(rbBlurPx > 0 && RB_FAST_BLUR)) { return null; }
  return rbScratchOpen(c, pts, B.wa.reduce((m, v) => Math.max(m, v), 0) * 0.55 + B.lw);
}
// draws bristle number q: pick its colour, build its path, stroke it (on the scratch canvas if one is open, then copy it over)
function rbBristle(c, S, pts, B, q, col, a, o) {
  const tc = S ? S.ctx : c;
  if (S) { rbScratchClear(S); }
  tc.strokeStyle = rbBristleStyle(tc, pts, col, a, o);
  tc.lineWidth = B.lw;
  tc.beginPath();
  rbBristlePath(tc, pts, B, q / (B.k - 1) - 0.5, q, o);
  tc.stroke();
  if (S) { rbScratchPut(c, S); }
}
// stroke colour of one bristle: slightly jittered, or a gradient from col to o.col2 along the stroke
function rbBristleStyle(tc, pts, col, a, o) {
  const j = o.jit === undefined ? 6 : o.jit;
  if (!o.col2) { return rbRgba(rbTint(col, j), a * rbR(0.55, 1)); }
  const c1 = rbTint(col, j), c2 = rbTint(o.col2, j), aa = a * rbR(0.55, 1), e = pts[pts.length - 1];
  const g = tc.createLinearGradient(pts[0][0], pts[0][1], e[0], e[1]);
  g.addColorStop(0, rbRgba(c1, aa));
  g.addColorStop(1, rbRgba(c2, aa));
  return g;
}
// path of one bristle: the stroke shifted sideways by off. Normal bristles lift the pen at random (dry-brush gaps).
function rbBristlePath(tc, pts, B, off, q, o) {
  if (o.smooth) { rbSmoothBristle(tc, pts, B.nx, B.ny, B.wa, B.tw, off); return; }
  let pen = false;
  for (let i = 0; i < B.n; i++) {
    const o2 = off * B.wa[i] * B.tw[i] * (1 + 0.08 * Math.sin(i * 1.3 + q * 2.1));
    const x = pts[i][0] + B.nx[i] * o2, y = pts[i][1] + B.ny[i] * o2;
    if (rbRnd() < B.thr[i]) { pen = false; continue; }
    if (!pen) { tc.moveTo(x, y); pen = true; } else { tc.lineTo(x, y); }
  }
}
// ---- scratch canvas for blurred bristles (WEBPAGE speed) ----
// The scratch canvas has the same transform as the painting, shifted by a whole number of pixels, so a bristle is drawn
// with exactly the same geometry. It is blurred there with the same blur as before, then copied to the painting 1:1
// (same clip, same blend mode, same opacity). RB_FAST_BLUR = 0 switches this off and blurs on the painting as before.
const RB_FAST_BLUR = 1;
let rbBlurPx = 0;     // blur radius (canvas pixels) of the enclosing rbBlurred, 0 = none
let rbSB = null;      // the shared scratch canvas
// Opens the scratch canvas for one stroke: works out the small rectangle the stroke covers (plus blur margin)
// and sets up a clip and transform so drawing there matches the painting exactly.
// Returns null if the fast path cannot be used (then the stroke is blurred directly on the painting).
function rbScratchOpen(c, pts, ext) {
  const m = c.getTransform(), cw = c.canvas.width, ch = c.canvas.height;
  if (!m || m.b !== 0 || m.c !== 0 || m.a <= 0 || m.d <= 0) { return null; }   // unusual transform: blur on the painting as before
  const r = rbScratchRect(m, pts, ext, cw, ch);
  if (r.w * r.h > 1400 * 1000) { return null; }                                  // very large stroke: blur it on the painting as before
  const sc = rbScratchCtx(cw, ch);
  const S = { ctx: sc, cv: rbSB.cv, ox: r.ox, oy: r.oy, w: r.w, h: r.h, m, fs: 'blur(' + rbBlurPx.toFixed(2) + 'px)' };
  rbScratchSetup(S);
  return S;
}
// the part of the painting (in canvas pixels) that the stroke and its blur can touch
function rbScratchRect(m, pts, ext, cw, ch) {
  const b = rbPointsBounds(pts), pad = Math.ceil(3.5 * rbBlurPx) + 3;
  let ox = Math.floor((b.x0 - ext) * m.a + m.e - pad), oy = Math.floor((b.y0 - ext) * m.d + m.f - pad);
  let ex = Math.ceil((b.x1 + ext) * m.a + m.e + pad), ey = Math.ceil((b.y1 + ext) * m.d + m.f + pad);
  ox = Math.max(0, ox); oy = Math.max(0, oy); ex = Math.min(cw, ex); ey = Math.min(ch, ey);
  if (ex <= ox || ey <= oy) { ox = 0; oy = 0; ex = 1; ey = 1; }   // nothing of this stroke is on the canvas
  return { ox, oy, w: ex - ox, h: ey - oy };
}
function rbPointsBounds(pts) {
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (let i = 0; i < pts.length; i++) {
    x0 = Math.min(x0, pts[i][0]); x1 = Math.max(x1, pts[i][0]);
    y0 = Math.min(y0, pts[i][1]); y1 = Math.max(y1, pts[i][1]);
  }
  return { x0, y0, x1, y1 };
}
// the shared scratch canvas (created, or recreated when the painting size changes)
function rbScratchCtx(cw, ch) {
  if (!rbSB || rbSB.cv.width !== cw || rbSB.cv.height !== ch) {
    const cv = document.createElement('canvas');
    cv.width = cw; cv.height = ch;
    rbSB = { cv, ctx: cv.getContext('2d') };
  }
  return rbSB.ctx;
}
// resets the scratch canvas, clips it to the stroke's rectangle and gives it the painting's transform (shifted by the rectangle's corner)
function rbScratchSetup(S) {
  const sc = S.ctx, m = S.m;
  sc.setTransform(1, 0, 0, 1, 0, 0);
  sc.filter = 'none'; sc.globalAlpha = 1; sc.globalCompositeOperation = 'source-over';
  sc.save();
  sc.beginPath(); sc.rect(0, 0, S.w, S.h); sc.clip();   // keeps the blurred area as small as the stroke
  sc.setTransform(m.a, 0, 0, m.d, m.e - S.ox, m.f - S.oy);
  sc.lineCap = 'round'; sc.lineJoin = 'round';
}
// empties the scratch canvas before each bristle and switches the blur on
function rbScratchClear(S) {
  const sc = S.ctx, m = S.m;
  sc.setTransform(1, 0, 0, 1, 0, 0);
  sc.filter = 'none';
  sc.clearRect(0, 0, S.w, S.h);
  sc.setTransform(m.a, 0, 0, m.d, m.e - S.ox, m.f - S.oy);
  try { sc.filter = S.fs; } catch (e) { /* no filter support: stay crisp */ }
}
// copies the blurred bristle from the scratch canvas onto the painting
function rbScratchPut(c, S) {
  c.save();
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.filter = 'none';
  c.drawImage(S.cv, 0, 0, S.w, S.h, S.ox, S.oy, S.w, S.h);
  c.restore();
}
function rbScratchClose(S) {
  S.ctx.restore();
  S.ctx.filter = 'none';
}
// smooth bristle: no ripple, no gaps, curves through the midpoints
// (used for background strokes and leaves, where gaps would look like errors)
function rbSmoothBristle(c, pts, nx, ny, wa, tw, off) {
  const n = pts.length;
  const P = pts.map((p, i) => [p[0] + nx[i] * off * wa[i] * tw[i], p[1] + ny[i] * off * wa[i] * tw[i]]);
  c.moveTo(P[0][0], P[0][1]);
  for (let i = 1; i < n - 1; i++) {
    c.quadraticCurveTo(P[i][0], P[i][1], (P[i][0] + P[i + 1][0]) / 2, (P[i][1] + P[i + 1][1]) / 2);
  }
  c.lineTo(P[n - 1][0], P[n - 1][1]);
}

// ======================================================================
// PAINTING THE RIBBON
// ======================================================================

// outline of both banks as one closed polygon (+ side forward, then - side backward), smoothed extra hard.
// rough = edge irregularity, inset = shrinks the outline toward the spine
function rbOutline(sys, wd, rough, seed, inset) {
  const A = [], B = [];
  for (let i = 0; i < sys.n; i++) {
    const dh = ((0.7 * rbN(i * 0.15, seed) + 0.3 * rbN(i * 0.6, seed + 4)) - 0.5) * 2 * rough,
          dl = ((0.7 * rbN(i * 0.15 + 40, seed + 9) + 0.3 * rbN(i * 0.6 + 40, seed + 13)) - 0.5) * 2 * rough;
    A.push(rbPos(sys, i, wd.hp[i] * (1 - inset) + dh));
    B.push(rbPos(sys, i, -wd.hm[i] * (1 - inset) + dl));
  }
  const As = rbSmoothPts(A, 5, 4), Bs = rbSmoothPts(B, 5, 4);
  return As.concat(Bs.reverse());
}
// traces a closed polygon as a smooth curve on the canvas (does not fill it; the caller fills or clips)
function rbPath(pts) {
  const c = rbCtx, n = pts.length;
  const mid = (p, q) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
  const m0 = mid(pts[n - 1], pts[0]);
  c.beginPath();
  c.moveTo(m0[0], m0[1]);
  for (let i = 0; i < n; i++) {
    const m = mid(pts[i], pts[(i + 1) % n]);
    c.quadraticCurveTo(pts[i][0], pts[i][1], m[0], m[1]);
  }
  c.closePath();
}
// a stroke along the ribbon from sample i0 to i1 at cross-position f0 (0 = - bank, 1 = + bank), drifting by wob
function rbLine(sys, wd, i0, i1, f0, wob, w, col, a, o) {
  if (i1 - i0 < 6) return;
  const pts = [], wv = [], sd = rbSeedInt();
  for (let i = i0; i <= i1; i++) {
    const f = rbCl(f0 + wob * (2 * rbFbm(i * 0.012 + sd * 0.01, sd) - 1), 0.01, 0.99);
    pts.push(rbPos(sys, i, -wd.hm[i] + f * (wd.hm[i] + wd.hp[i])));
    wv.push(w * (0.7 + 0.3 * rbFbm(i * 0.03, sd + 3)));
  }
  rbBrush(pts, wv, col, a, o);
}
// faint vertical streaks over the paper, painted first
function rbStreaks() {
  const cols = TH.streak;
  rbRepeat(120 * RB_STREAKS, () => {
    const x = rbR(0, RB_W), y0 = rbR(-100, RB_H - 100), len = rbR(220, 480), pts = [];
    for (let y = y0; y < y0 + len; y += 14) { pts.push([x + 6 * Math.sin(y * 0.01 + x), y]); }
    rbBrush(pts, rbR(14, 30), rbPick(cols), 0.1, { dry: 0.2, taper: 0.3, jit: 4 });
  });
}
// Picks the colour for a base stroke at cross-position f and position u along the ribbon.
// The bank colours (teal, strip, leaf) dominate near the edges; fin/egg/green/mint dominate the centre.
// Noise decides which family wins where, and the result is a weighted average of the families' colours.
function rbColor(f, u, sd) {
  const w = rbColorWeights(f, u, sd);
  let sum = 0, r = 0, g = 0, bl = 0, k = 0;
  for (const fk in w) {
    k++;
    const t = rbCl((rbFbm(u * 6 + f * 4 + k * 5.3, sd + 9) - 0.5) * 1.7 + 0.5 + rbR(-0.1, 0.1), 0, 1), c = rbGrad(RB_FAM[fk], t);
    sum += w[fk]; r += c[0] * w[fk]; g += c[1] * w[fk]; bl += c[2] * w[fk];
  }
  return [r / sum, g / sum, bl / sum];
}
// how much each colour family contributes at cross-position f and ribbon position u:
// bank families near the edges, fin/egg/green/mint in the middle, switched on and off by four noise fields
function rbColorWeights(f, u, sd) {
  const bank = Math.pow(Math.abs(2 * f - 1), 1.5), mid = 1 - bank;
  const nz = (a, b, c, s, lo) => rbSm((rbFbm(u * a + f * b + c, sd + s) - lo) / 0.25);
  const nA = nz(3.0, 7.0, 3, 0, 0.45), nB = nz(2.6, 6.0, 17, 1, 0.45), nC = nz(3.4, 8.0, 29, 2, 0.5), nD = nz(2.2, 5.0, 41, 3, 0.55);
  const w = {
    teal: 0.1 + 1.3 * bank, strip: 0.5 * bank * nD + 0.08, leaf: 0.8 * bank * nD,
    fin: mid * (0.15 + nA), egg: mid * (0.15 + nB), green: mid * nC, mint: 0.25 * mid + 0.2 * bank * (1 - nD),
  };
  if (TH.famW) { for (const fk in TH.famW) { w[fk] *= TH.famW[fk]; } }
  return w;
}
// LAYER 1 - base strokes: many short strokes that cover the whole ribbon (more where the ribbon is wider)
function rbStrokes(sys, wd) {
  const n = sys.n, maxTot = rbMaxWidth(sys, wd);
  let sumTot = 0;
  for (let i = 0; i < n; i++) { sumTot += wd.hm[i] + wd.hp[i]; }
  const N = Math.round((sumTot * 4) / (13 * 75 * 0.55) * 2.6 * RB_COVER / Math.sqrt(RB_LEN));   // stroke count from the ribbon area
  let placed = 0;
  rbRepeat(N * 8, () => {
    if (placed >= N) return;
    const i = Math.floor(rbR(0, n));
    if (rbRnd() > (wd.hm[i] + wd.hp[i]) / maxTot) return;   // narrow parts reject more tries
    placed++;
    rbBaseStroke(sys, wd, i);
  });
}
// one short base stroke centred on spine sample i
function rbBaseStroke(sys, wd, i) {
  const n = sys.n, f = rbR(0.02, 0.98), len = Math.round(rbR(10, 28) * RB_LEN), w = rbR(9, 18);
  const i0 = Math.max(0, i - (len >> 1)), i1 = Math.min(n - 1, i0 + len), pts = [];
  for (let q = i0; q <= i1; q++) {
    const ff = rbCl(f + (rbN(q * 0.05 + i, 77) - 0.5) * 0.06, 0.01, 0.99);
    pts.push(rbPos(sys, q, -wd.hm[q] + ff * (wd.hm[q] + wd.hp[q])));
  }
  rbBrush(pts, w, rbColor(f, i / (n - 1), 31), rbR(0.5, 0.8), { dry: 0.1, taper: 0.45, jit: 6 });
}

// ---- stacked colour layers ----
// Picks a colour group (weighted by popW, steered by noise) and a pair of colours from it for a two-colour stroke.
function rbPopColor(f, u, sd) {
  let idx = 0, tot = 0;
  RB_POP_W.forEach(w => { tot += w; });
  let r = (rbRnd() < 0.2 ? rbRnd() : rbFbm(u * 5 + f * 3.2 + 7, sd)) * tot;
  for (let k = 0; k < RB_POP_W.length; k++) { if (r < RB_POP_W[k]) { idx = k; break; } r -= RB_POP_W[k]; idx = k; }
  const t = rbR(0.1, 0.9);
  return { col: rbGrad(RB_POP[idx], t), col2: rbGrad(RB_POP[idx], rbCl(t + rbR(-0.3, 0.3), 0, 1)), idx };
}
// Scatters `count` strokes over the ribbon (more in wide parts) and calls draw(i, i0, i1, f) for each:
// i = centre sample, i0..i1 = sample range, f = cross-position between fLo and fHi.
function rbScatter(sys, wd, count, fLo, fHi, lenLo, lenHi, draw) {
  const n = sys.n, maxTot = rbMaxWidth(sys, wd);
  let placed = 0;
  rbRepeat(count * 7, () => {
    if (placed >= count) return;
    const i = Math.floor(rbR(0, n));
    if (rbRnd() > (wd.hm[i] + wd.hp[i]) / maxTot) return;
    placed++;
    const f = rbR(fLo, fHi), len = Math.round(rbR(lenLo, lenHi));
    const i0 = Math.max(0, i - (len >> 1)), i1 = Math.min(n - 1, i0 + len);
    draw(i, i0, i1, f);
  });
}
// the widest total ribbon width (both sides), at least 1; used to place more strokes where the ribbon is wide
function rbMaxWidth(sys, wd) {
  let m = 1;
  for (let i = 0; i < sys.n; i++) { m = Math.max(m, wd.hm[i] + wd.hp[i]); }
  return m;
}
// LAYER 2 - colour patches: medium two-colour strokes that add variety
function rbPatches(sys, wd) {
  const n = sys.n;
  rbScatter(sys, wd, 650 * RB_LAYERS / Math.sqrt(RB_LEN), 0.02, 0.98, 6 * RB_LEN, 18 * RB_LEN, (i, i0, i1, f) => {
    const pc = rbPopColor(f, i / (n - 1), 61);
    rbLine(sys, wd, i0, i1, f, 0.03, rbR(12, 26), pc.col, Math.min(0.8, rbR(0.4, 0.65) * RB_POPNESS),
           { dry: 0.1, taper: 0.45, jit: 7, col2: pc.col2 });
  });
}
// LAYER 3 - long soft washes that tie the patches together
function rbFlows(sys, wd) {
  const n = sys.n;
  rbScatter(sys, wd, 70 * RB_LAYERS, 0.05, 0.95, 40 * RB_LEN, 110 * RB_LEN, (i, i0, i1, f) => {
    const pc = rbPopColor(f, i / (n - 1), 83);
    rbLine(sys, wd, i0, i1, f, 0.06, rbR(12, 22), pc.col, rbR(0.25, 0.4) * RB_POPNESS, { dry: 0.1, taper: 0.5, jit: 6, col2: pc.col2 });
  });
}
// LAYER 5 - soft depth: darker strokes pushed toward the banks
function rbShadows(sys, wd) {
  rbScatter(sys, wd, 60 * RB_LAYERS / Math.sqrt(RB_LEN), 0.03, 0.97, 14 * RB_LEN, 40 * RB_LEN, (i, i0, i1, f) => {
    const ff = f < 0.5 ? f * 0.55 : 1 - (1 - f) * 0.55;
    rbLine(sys, wd, i0, i1, ff, 0.05, rbR(8, 16), rbPick(RB_SHADOW), rbR(0.25, 0.38) * RB_POPNESS, { dry: 0.12, taper: 0.55, jit: 6 });
  });
}
// LAYER 6 - pale highlights
function rbHighlights(sys, wd) {
  const cols = TH.hi;
  rbScatter(sys, wd, 80 * RB_LAYERS / Math.sqrt(RB_LEN), 0.05, 0.95, 10 * RB_LEN, 30 * RB_LEN, (i, i0, i1, f) => {
    rbLine(sys, wd, i0, i1, f, 0.04, rbR(5, 10), rbPick(cols), rbR(0.3, 0.5), { dry: 0.14, taper: 0.55, jit: 4 });
  });
}
// LAYER 4 - thin accent streaks (greenish or bluish, depending on the local colour)
function rbAccents(sys, wd) {
  const n = sys.n;
  let maxTot = 1;
  for (let i = 0; i < n; i++) { maxTot = Math.max(maxTot, wd.hm[i] + wd.hp[i]); }
  rbRepeat(70 * RB_COVER / Math.sqrt(RB_LEN), () => {
    const i = Math.floor(rbR(0, n));
    if (rbRnd() > (wd.hm[i] + wd.hp[i]) / maxTot) return;
    const f = rbR(0.15, 0.85), len = Math.round(rbR(14, 34) * RB_LEN), i0 = Math.max(0, i - (len >> 1)), i1 = Math.min(n - 1, i0 + len);
    const greenish = rbFbm((i / (n - 1)) * 3.4 + f * 8 + 29, 31 + 2) > 0.5;
    const col = greenish ? rbPick(TH.accG) : rbPick(TH.accO);
    rbLine(sys, wd, i0, i1, f, 0.05, rbR(2, 5), col, 0.5, { dry: 0.15, taper: 0.5, jit: 8 });
  });
}
// long thin pale lines along the whole wave (dry-brush texture)
function rbDryStreaks(sys, wd) {
  const n = sys.n, cols = TH.dry;
  rbRepeat(170, () => {
    const i0 = Math.floor(rbR(0, 0.9) * n), i1 = Math.min(n - 1, i0 + Math.floor(rbR(50, 140)));
    rbLine(sys, wd, i0, i1, rbR(0.05, 0.95), 0.1, rbR(3, 10), rbPick(cols), 0.1, { dry: 0.2, taper: 0.4, jit: 4 });
  });
}
// broken dark lines along both edges of the ribbon, like ink pooling at the rim
function rbEdges(sys, wd) {
  const n = sys.n;
  [0.03, 0.97].forEach(f0 => {
    let i = -Math.floor(rbR(0, 20));
    rbRepeat(n, () => {
      if (i >= n - 8) return;
      const len = Math.round(rbR(8, 20) * RB_LEN), i0 = Math.max(0, i), i1 = Math.min(n - 1, i + len);
      if (rbRnd() < 0.62) { rbLine(sys, wd, i0, i1, f0, 0.01, rbR(3, 6), RB_EDGE, 0.45, { dry: 0.12, taper: 0.6, jit: 6 }); }
      i = i1 + Math.round(rbR(-2, 8));   // a random gap before the next dash
    });
  });
}

// ======================================================================
// CURVE-FOLLOWING BACKGROUND
// Washes, halos and bands that hug the ribbon and fade into the paper with distance.
// ======================================================================

// stores the ribbon outline points in a grid so rbEdgeDist can find the nearest one quickly
function rbBuildEdgeGrid(sys, wd) {
  const G = RB_EDGE_CELL, poly = rbOutline(sys, wd, 0, 12, 0), grid = new Map();
  poly.forEach(p => {
    if (p[0] < -300 || p[0] > RB_W + 300 || p[1] < -300 || p[1] > RB_H + 300) return;
    const cellKey = (Math.floor(p[0] / G) + 100) * 1000 + (Math.floor(p[1] / G) + 100);
    if (!grid.has(cellKey)) grid.set(cellKey, []);
    grid.get(cellKey).push(p);
  });
  rbEdgeGrid = grid;
}
// distance from (x, y) to the nearest ribbon outline point (searches the 5 x 5 cells around it)
function rbEdgeDist(x, y) {
  const G = RB_EDGE_CELL;
  if (!rbEdgeGrid) return 999;
  const cx = Math.floor(x / G), cy = Math.floor(y / G);
  let best = 2 * G;
  for (let dx = -2; dx <= 2; dx++) {
    for (let dy = -2; dy <= 2; dy++) {
      for (const p of rbEdgeGrid.get(rbGridKey(cx + dx, cy + dy)) || []) { best = Math.min(best, Math.hypot(p[0] - x, p[1] - y)); }
    }
  }
  return best;
}
// A stroke that runs parallel to the ribbon at distance d0 outside the given side (side +1 / -1).
// It is drawn with the flat (ripple-free) position, smoothed, and split into pieces wherever the
// path would squeeze or kink too tightly, so strokes never fold at sharp bends.
function rbBgLine(sys, wd, i0, i1, side, d0, wob, w, col, a, o) {
  if (i1 - i0 < 6) return;
  const P = rbBgPath(sys, wd, i0, i1, side, d0, wob, w);
  const pts = rbSmoothPts(P.raw, RB_BG_SMOOTH, 4), ok = rbBgOk(pts, P.wv, P.squeezeOk);
  rbOkRuns(ok, 8).forEach(([s, e]) => {
    rbBrush(pts.slice(s, e), P.wv.slice(s, e), col, a, Object.assign({}, o, { smooth: true }));
  });
}
// raw (unsmoothed) points of a stroke running parallel to the ribbon at distance d0 outside the given side,
// with its widths, and a flag per point telling whether the bend squeezes it too much
function rbBgPath(sys, wd, i0, i1, side, d0, wob, w) {
  const raw = [], wv = [], squeezeOk = [], sd = rbSeedInt();
  const dMin = Math.max(3, w * (0.5 - RB_BG_TUCK));
  for (let i = i0; i <= i1; i++) {
    const d = Math.max(dMin, d0 + wob * (2 * rbFbm(i * 0.01 + sd * 0.01, sd) - 1));
    raw.push(rbPos(sys, i, side > 0 ? wd.hp[i] + d : -(wd.hm[i] + d), true));
    wv.push(w * (0.75 + 0.25 * rbFbm(i * 0.03, sd + 5)));
    const vOut = (side > 0 ? wd.hp[i] : wd.hm[i]) + d + 0.5 * w, L = (side > 0 ? sys.limP[i] : sys.limN[i]) * 1.25;
    squeezeOk.push((L * (1 - Math.exp(-vOut / L))) / vOut > RB_BG_SQUEEZE);
  }
  return { raw, wv, squeezeOk };
}
// a point is ok if the bend there is wide compared with the stroke width (so the stroke does not kink)
function rbBgOk(pts, wv, squeezeOk) {
  const n = pts.length;
  return pts.map((p, k) => {
    if (!squeezeOk[k]) return false;
    const a0 = pts[Math.max(k - 3, 0)], c0 = pts[Math.min(k + 3, n - 1)];
    const ux = p[0] - a0[0], uy = p[1] - a0[1], vx = c0[0] - p[0], vy = c0[1] - p[1];
    const lu = Math.hypot(ux, uy), lv = Math.hypot(vx, vy);
    if (lu < 1e-3 || lv < 1e-3) return true;
    const ang = Math.abs(Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy));
    const radius = ((lu + lv) / 2) / Math.max(ang, 1e-4);
    return radius > 0.6 * wv[k];
  });
}
// [start, end) index ranges of consecutive true values that are at least minLen long
function rbOkRuns(ok, minLen) {
  const runs = [], n = ok.length;
  let s = -1;
  for (let k = 0; k <= n; k++) {
    if (k < n && ok[k]) { if (s < 0) s = k; continue; }
    if (s >= 0 && k - s >= minLen) runs.push([s, k]);
    s = -1;
  }
  return runs;
}
// picks random spots beside the ribbon (distance d between dLo and dHi, biased toward the ribbon by `bias`)
// that are on the canvas, and calls draw(i, side, d) for each
function rbBgScatter(sys, wd, count, dLo, dHi, bias, draw) {
  const n = sys.n;
  rbRepeat(count * 3, () => {
    const i = Math.floor(rbR(0, n)), side = rbRnd() < 0.5 ? 1 : -1, d = dLo + (dHi - dLo) * Math.pow(rbRnd(), bias);
    const p = rbPos(sys, i, side > 0 ? wd.hp[i] + d : -(wd.hm[i] + d), true);
    if (p[0] < -60 || p[0] > RB_W + 60 || p[1] < -60 || p[1] > RB_H + 60) return;
    draw(i, side, d);
  });
}
// colour for a background stroke: a layer colour faded toward the paper colour with distance from the ribbon
function rbBgColor(d, f, sd) {
  const pc = rbPopColor(f, d / RB_BG_REACH, sd), fade = rbCl(0.12 + 0.62 * (d / RB_BG_REACH), 0, 0.8);
  return { col: rbMix(pc.col, RB_PAPER, fade), col2: rbMix(pc.col2, RB_PAPER, fade) };
}
// broad washes beside the ribbon
function rbBgWashes(sys, wd) {
  const n = sys.n;
  rbBgScatter(sys, wd, 95 * RB_BG, 0, RB_BG_REACH, 1.25, (i, side, d) => {
    const len = Math.round(rbR(90, 230)), i0 = Math.max(0, i - (len >> 1)), i1 = Math.min(n - 1, i0 + len);
    const bc = rbBgColor(d, side * 0.5 + 0.5, 47), near = 1 - d / RB_BG_REACH;
    rbBgLine(sys, wd, i0, i1, side, d, 12, rbR(55, 105), bc.col, rbR(0.14, 0.24) * (0.45 + 0.75 * near), { dry: 0.12, taper: 0.5, jit: 8, col2: bc.col2 });
  });
}
// narrower flowing strokes beside the ribbon
function rbBgFlow(sys, wd) {
  const n = sys.n;
  rbBgScatter(sys, wd, 40 * RB_BG, 6, RB_BG_REACH * 0.85, 1.1, (i, side, d) => {
    const len = Math.round(rbR(70, 170)), i0 = Math.max(0, i - (len >> 1)), i1 = Math.min(n - 1, i0 + len);
    const bc = rbBgColor(d, side * 0.5 + 0.5, 59), near = 1 - d / RB_BG_REACH;
    rbBgLine(sys, wd, i0, i1, side, d, 8, rbR(18, 34), bc.col, rbR(0.2, 0.34) * (0.5 + 0.7 * near), { dry: 0.14, taper: 0.55, jit: 7, col2: bc.col2 });
  });
}
// thin pale lines beside the ribbon
function rbBgLights(sys, wd) {
  const n = sys.n, cols = TH.hi.concat([TH.vein]);
  rbBgScatter(sys, wd, 16 * RB_BG, 10, RB_BG_REACH * 0.7, 1.0, (i, side, d) => {
    const len = Math.round(rbR(60, 140)), i0 = Math.max(0, i - (len >> 1)), i1 = Math.min(n - 1, i0 + len);
    rbBgLine(sys, wd, i0, i1, side, d, 5, rbR(6, 11), rbPick(cols), rbR(0.25, 0.45), { dry: 0.16, taper: 0.6, jit: 4 });
  });
}
// soft halo: seven wide strokes along the ribbon outline, from the widest and palest to the thinnest,
// so the colour fades smoothly away from the ribbon
function rbBgHalo(sys, wd) {
  if (RB_BG_HALO <= 0) return;
  const c = rbCtx, poly = rbOutline(sys, wd, 0, 12, 0);
  const rings = [260, 200, 150, 108, 72, 42, 18].map((r, k) => [r, TH.halo[k]]);
  c.save();
  c.lineJoin = 'round';
  c.lineCap = 'round';
  rings.forEach(r => rbStrokeRing(poly, r[0] * 2, rbRgba(r[1], RB_BG_HALO * 0.55)));
  c.restore();
}
// strokes the ribbon outline with a very wide line (the line sticks out of the ribbon on both sides)
function rbStrokeRing(poly, lw, style) {
  rbPath(poly);
  rbCtx.lineWidth = lw;
  rbCtx.strokeStyle = style;
  rbCtx.stroke();
}
// colour bands: 16 stroked outlines of the ribbon at shrinking radii, each in its own colour
function rbBgBands(sys, wd) {
  if (RB_BG_BANDS <= 0) return;
  const c = rbCtx, poly = rbOutline(sys, wd, 0, 12, 0);
  const radii = Array.from({ length: 16 }, (_, k) => RB_BG_REACH * Math.pow(0.78, k));
  c.save();
  c.lineJoin = 'round';
  c.lineCap = 'round';
  radii.forEach(r => rbBgBand(poly, r));
  c.restore();
}
// one colour band: a wide stroke of the outline, fainter and paler the further out it reaches
function rbBgBand(poly, r) {
  const bc = rbBgColor(r, rbR(0.2, 0.8), 47), near = 1 - r / RB_BG_REACH;
  rbStrokeRing(poly, r * 2, rbRgba(bc.col, (0.16 + 0.22 * near) * RB_BG_BANDS));
}

// ======================================================================
// MARBLED BACKGROUND
// A colour field made from domain-warped noise, plus blurred colour drifts, swirls and a vignette.
// ======================================================================

// colour ramp of the active theme: position u (0-1) -> colour
function rbIrid(u) {
  u = rbCl(u, 0, 1);
  let k = 0;
  while (k < RB_IRID.length - 2 && u > RB_IRID[k + 1][0]) { k++; }
  const a = RB_IRID[k], b = RB_IRID[k + 1];
  return rbMix(a[1], b[1], rbCl((u - a[0]) / (b[0] - a[0]), 0, 1));
}
// opacity for a colour-ramp position (a theme may supply its own curve, TH.irAlpha)
const rbIridAlpha = u => (TH.irAlpha ? TH.irAlpha(u) : rbCl(u < 0.1 ? 0.5 + 5 * u : u < 0.65 ? 1 : 1 - 1.1 * (u - 0.65), 0.35, 1));
const rbLight = (col, t) => rbMix(col, [255, 255, 255], t);   // lightens a colour toward white

// runs fn with a canvas blur and restores the context afterwards
// (while recording, it only remembers the blur for the stroke being queued)
function rbBlurred(px, fn) {
  if (rbRecording) {
    const keep = rbBlurNow;
    rbBlurNow = px;
    try { fn(); } finally { rbBlurNow = keep; }
    return;
  }
  const c = rbCtx, keepPx = rbBlurPx;
  c.save();
  if (RB_BG_BLUR && px > 0) {
    try { c.filter = 'blur(' + (px * rbBL).toFixed(2) + 'px)'; rbBlurPx = px * rbBL; } catch (e) { /* no filter support: stay crisp */ }
  }
  try { fn(); } finally { rbBlurPx = keepPx; c.restore(); }
}

let rbFluid = null;   // settings (seed and offset) of the marbled field, created once per painting
// Marbling noise at (x, y): the coordinates are warped by noise twice (domain warping), which gives
// the swirly, liquid look. Returns u (colour-ramp position) and m (how strong the colour is here).
function rbFluidSample(x, y, sd) {
  const st = v => rbCl(0.5 + (v - 0.5) * 2.3, 0, 1);   // contrast stretch
  const q1 = rbFbm2(x, y, sd), q2 = rbFbm2(x + 5.2, y + 1.3, sd + 1);
  const r1 = rbFbm2(x + 3.6 * q1 + 1.7, y + 3.6 * q2 + 9.2, sd + 2), r2 = rbFbm2(x + 3.6 * q1 + 8.3, y + 3.6 * q2 + 2.8, sd + 3);
  const f = rbFbm2(x + 3.2 * r1, y + 3.2 * r2, sd + 4);
  const u = rbCl(st(f) * 0.55 + st(r1) * 0.45 + 0.1 * Math.sin(f * 9 + r2 * 5), 0, 1);
  const m = rbSm((st(q1) * 0.5 + st(r2) * 0.5 - 0.28) / 0.5);
  return { u, m };
}
// Renders the marbling into a small off-screen canvas (a quarter size; it is blurred and stretched
// later, so the low resolution is not visible). S = pattern size, aBase/aGain = opacity range, k = strength.
function rbFluidCanvas(S, aBase, aGain, k) {
  const SC = 4, w = Math.ceil(RB_W / SC), h = Math.ceil(RB_H / SC);
  const off = document.createElement('canvas');
  off.width = w; off.height = h;
  const oc = off.getContext('2d'), img = oc.createImageData(w, h);
  rbRepeat(h, j => rbFluidRow(img, j, S, aBase, aGain, k));
  oc.putImageData(img, 0, 0);
  return { off, w, h };
}
// fills pixel row j of the small marbling image: colour from the ramp, opacity from the noise strength
function rbFluidRow(img, j, S, aBase, aGain, k) {
  const SC = 4, w = img.width, d = img.data;
  for (let i = 0; i < w; i++) {
    const s = rbFluidSample((i * SC) / S + rbFluid.ox, (j * SC) / S + rbFluid.oy, rbFluid.sd);
    const col = rbIrid(s.u), p = (j * w + i) * 4;
    d[p] = col[0]; d[p + 1] = col[1]; d[p + 2] = col[2];
    d[p + 3] = rbCl((aBase + aGain * s.m) * rbIridAlpha(s.u) * k, 0, 1) * 255;
  }
}
// stretches the small marbling canvas over the whole painting with a blur
function rbDrawFluid(f, blurPx) {
  const c = rbCtx;
  c.save();
  c.imageSmoothingEnabled = true;
  try { c.imageSmoothingQuality = 'high'; } catch (e) { /* ignore */ }
  rbBlurred(blurPx, () => c.drawImage(f.off, 0, 0, f.w, f.h, -8, -8, RB_W + 16, RB_H + 16));
  c.restore();
}
function rbFluidInit() {
  if (!rbFluid) { rbFluid = { sd: rbSeedInt(), ox: rbR(0, 60), oy: rbR(0, 60) }; }
}
// marbled colour field behind the waves
function rbBgFluidField() {
  const k = RB_BG_FLUID * RB_RICH;
  if (k <= 0) return;
  rbFluidInit();
  rbDrawFluid(rbFluidCanvas(RB_BG_SWIRL, 0.06, 0.30, k), 3);
}
// big blurred colour drifts (radial gradients) and a few bright "screen" blooms
function rbBgDrifts() {
  const k = RB_BG_PATCH * RB_RICH;
  if (k <= 0) return;
  rbBlurred(60, () => rbRepeat(14 * k, rbDriftBlob));
  rbCtx.save();
  rbCtx.globalCompositeOperation = 'screen';
  rbRepeat(6 * k, rbBloom);
  rbCtx.restore();
}
// one big soft colour blob
function rbDriftBlob() {
  const x = rbR(-100, RB_W + 100), y = rbR(-100, RB_H + 100), r = rbR(170, 360), u = rbR(0.12, 0.85), col = rbIrid(u);
  rbBloomAt(x, y, r, col, rbR(0.08, 0.15) * rbIridAlpha(u) * RB_RICH);
}
// one bright, light-coloured bloom (used with the 'screen' blend)
function rbBloom() {
  const x = rbR(0, RB_W), y = rbR(0, RB_H), r = rbR(200, 380), col = rbLight(rbIrid(rbR(0.3, 0.9)), 0.7);
  rbBloomAt(x, y, r, col, 0.18 * RB_RICH);
}
// fills a square with a radial gradient that fades from the colour (opacity a) at the centre to transparent at radius r
function rbBloomAt(x, y, r, col, a) {
  const g = rbCtx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, rbRgba(col, a));
  g.addColorStop(1, rbRgba(col, 0));
  rbCtx.fillStyle = g;
  rbCtx.fillRect(x - r, y - r, 2 * r, 2 * r);
}

// fills a tapered ribbon shape along a path in one go (used for the swirls); width follows a sine taper
function rbRibbonFill(pts, wmax, sd, style) {
  const c = rbCtx, n = pts.length, nm = rbNorms(pts), L = [], R = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1), w = 0.5 * wmax * Math.pow(Math.sin(Math.PI * rbCl(t, 0.02, 0.98)), 0.8) * (0.7 + 0.6 * rbN(i * 0.08, sd));
    L.push([pts[i][0] + nm[i][0] * w, pts[i][1] + nm[i][1] * w]);
    R.push([pts[i][0] - nm[i][0] * w, pts[i][1] - nm[i][1] * w]);
  }
  rbPath(L.concat(R.reverse()));
  c.fillStyle = style;
  c.fill();
}
// a smoothly curling path: the heading turns by a noise-driven amount at every step
function rbCurlPath(x, y, a, steps, ds, curl, sd) {
  const pts = [[x, y]], ph = rbR(0, 50);
  rbRepeat(steps, i => {
    a += curl * (2 * rbFbm(i * 0.035 + ph, sd) - 1);
    x += Math.cos(a) * ds;
    y += Math.sin(a) * ds;
    pts.push([x, y]);
  });
  return pts;
}
// soft curling swirls: blurred, gradient-filled ribbons on random curling paths
function rbBgSwirls() {
  const k = RB_BG_SWIRLS * RB_RICH, sd = rbSeedInt();
  if (k <= 0) return;
  rbRepeat(34 * k, () => rbSwirl(sd));
}
// one soft curling swirl: a blurred, gradient-filled tapered ribbon on a random curling path
function rbSwirl(sd) {
  const big = rbRnd() < 0.4, steps = Math.round(rbR(50, big ? 110 : 80)), ds = big ? rbR(10, 14) : rbR(7, 10);
  const raw = rbCurlPath(rbR(-80, RB_W + 80), rbR(-80, RB_H + 80), rbR(0, Math.PI * 2), steps, ds, rbR(0.09, 0.2), sd + rbSeedInt() % 97);
  const pts = rbSmoothPts(raw, 5, 3), m = rbRnd(), mode = m < 0.22 ? 'screen' : m < 0.3 ? 'multiply' : 'source-over';
  const g = rbSwirlGradient(pts, mode);
  rbBlurred(rbR(8, big ? 32 : 22), () => {
    rbCtx.globalCompositeOperation = mode;
    rbRibbonFill(pts, big ? rbR(90, 190) : rbR(45, 110), sd + 3, g);
  });
}
// colour gradient along a swirl: three colours from the colour ramp, transparent at both ends
function rbSwirlGradient(pts, mode) {
  const n = pts.length, u0 = rbR(0.05, 0.75), du = rbR(0.18, 0.4) * (rbRnd() < 0.5 ? 1 : -1), a = rbR(0.1, 0.2) * RB_RICH;
  const cols = [0, 0.5, 1].map(t => rbIrid(u0 + du * t)), lit = mode === 'screen' ? 0.5 : 0;
  const g = rbCtx.createLinearGradient(pts[0][0], pts[0][1], pts[n - 1][0], pts[n - 1][1]);
  [[0, 0, 0], [0.3, 0, a], [0.5, 1, a], [0.7, 2, a], [1, 2, 0]].forEach(s => g.addColorStop(s[0], rbRgba(rbLight(cols[s[1]], lit), s[2])));
  return g;
}
// darkens the corners slightly (multiply blend with a radial gradient)
function rbBgVignette() {
  if (RB_BG_VIGNETTE <= 0) return;
  const c = rbCtx, W = RB_W, H = RB_H;
  c.save();
  c.globalCompositeOperation = 'multiply';
  const g = c.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.hypot(W, H) * 0.55);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(1, rbRgba(TH.vignette, RB_BG_VIGNETTE * RB_RICH));
  c.fillStyle = g;
  c.fillRect(0, 0, W, H);
  c.restore();
}

// runs a step with its own random stream, then gives the main stream back.
// This keeps steps independent: changing one step's code does not reshuffle the random numbers of the others.
function rbIsolated(name, salt, fn) {
  const keep = rbRS;
  rbRS = (rbSeed * 104729 + salt * 15485863) | 0;
  rbTry(name, fn);
  rbRS = keep;
}
// paints the whole static background in order (back to front)
function rbBackground(sys, wd) {
  if (RB_BG <= 0) return;
  rbIsolated('bg drifts',  1, () => rbBgDrifts());
  rbIsolated('bg fluid',   2, () => rbBgFluidField());
  rbIsolated('bg swirls',  3, () => rbBgSwirls());
  rbTry('bg halo',   () => rbBgHalo(sys, wd));
  rbTry('bg bands',  () => rbBgBands(sys, wd));
  rbTry('bg washes', () => rbBgWashes(sys, wd));
  rbTry('bg flow',   () => rbBgFlow(sys, wd));
  rbTry('bg lights', () => rbBgLights(sys, wd));
  rbTry('bg vignette', () => rbBgVignette());
}

// ======================================================================
// BACKGROUND WAVES
// Bands that echo the main wave and fill the space around it.
// Distances here are real pixels from the spine, not the squeezed coordinate used by rbPos.
// ======================================================================

// squeezed sideways distance for a real distance v (same exponential squeeze as rbPos)
const wvSq = (sys, i, side, v) => { const L = (side > 0 ? sys.limP[i] : sys.limN[i]) * 1.25; return L * (1 - Math.exp(-v / L)); };
let wvSd = 1, wvSmooth = null;   // noise seed, and a heavily smoothed copy of the normals (bands loosen toward it)
// Position of a band point: base offset h from the spine plus extra distance v. Close to the ribbon it follows
// the exact normal; further away (WV_LOOSEN) it blends to the smoothed normal and drifts, so far bands look looser.
function wvAt(sys, i, side, h, v) {
  const t = rbSm(v / WV_LOOSEN), N = sys.N[i], M = wvSmooth.N[i];
  const dx = N[0] * (1 - t) + M[0] * t, dy = N[1] * (1 - t) + M[1] * t, dm = Math.hypot(dx, dy) || 1;
  const sc = 1 + WV_DRIFT * t * (2 * rbFbm(i * 0.0045 + 7.3, wvSd) - 1);
  return [sys.C[i][0] + N[0] * side * h + (dx / dm) * side * v * sc, sys.C[i][1] + N[1] * side * h + (dy / dm) * side * v * sc];
}

// Builds a grid over the canvas: for every cell, the index of the nearest ribbon sample (its "owner").
// Used to find the flow direction of the wave at any spot (leaves) and to stop bands at neighbouring parts of the ribbon.
function wvBuildGrid(sys, wd) {
  const P = wvGridPoints(sys, wd);
  const gw = Math.ceil((RB_W + 2 * WV_PAD) / WV_CELL), gh = Math.ceil((RB_H + 2 * WV_PAD) / WV_CELL), own = new Int32Array(gw * gh);
  rbRepeat(gh, gy => wvOwnRow(P, own, gy, gw));
  wvGrid = { own, gw, gh };
}
// outline points (every second one, near the canvas) with the spine index each one belongs to
function wvGridPoints(sys, wd) {
  const n = sys.n, poly = rbOutline(sys, wd, 0, 12, 0), px = [], py = [], pi = [];
  for (let k = 0; k < poly.length; k += 2) {
    const p = poly[k];
    if (p[0] < -250 || p[0] > RB_W + 250 || p[1] < -250 || p[1] > RB_H + 250) continue;
    px.push(p[0]); py.push(p[1]); pi.push(k < n ? k : 2 * n - 1 - k);
  }
  return { px, py, pi };
}
// fills one row of the grid with the spine index of the nearest outline point
function wvOwnRow(P, own, gy, gw) {
  const y = gy * WV_CELL - WV_PAD + WV_CELL / 2;
  for (let gx = 0; gx < gw; gx++) {
    const x = gx * WV_CELL - WV_PAD + WV_CELL / 2;
    let best = 1e12, bi = -1000;
    for (let q = 0; q < P.px.length; q++) {
      const dx = P.px[q] - x, dy = P.py[q] - y, d = dx * dx + dy * dy;
      if (d < best) { best = d; bi = P.pi[q]; }
    }
    own[gy * gw + gx] = bi;
  }
}
// nearest ribbon sample index for any canvas position (looked up from the grid)
function wvOwner(x, y) {
  const g = wvGrid, gx = rbCl(Math.floor((x + WV_PAD) / WV_CELL), 0, g.gw - 1), gy = rbCl(Math.floor((y + WV_PAD) / WV_CELL), 0, g.gh - 1);
  return g.own[gy * g.gw + gx];
}
// For every ribbon sample, how far a band can extend on one side before it would leave the canvas,
// fold at a bend, or run into another part of the ribbon.
function wvAvail(sys, wd, side, wb) {
  const n = sys.n, av = new Float32Array(n);
  rbRepeat(n, i => { av[i] = wvAvailAt(sys, side, wb, i); });
  rbSmoothArr(av, 12, 4);
  return av;
}
// free distance (px) at spine sample i: grows until the band would leave the canvas, fold at a bend or reach another part of the ribbon
function wvAvailAt(sys, side, wb, i) {
  const c = sys.C[i];
  if (c[0] < -150 || c[0] > RB_W + 150 || c[1] < -150 || c[1] > RB_H + 150) return 0;
  const lim = Math.max((side > 0 ? sys.limP[i] : sys.limN[i]) * WV_FOLD, wb[i]);
  let last = 0;
  for (let d = 6; d <= WV_REACH; d += 6) {
    if (wb[i] + d > lim) break;
    const p = wvAt(sys, i, side, wb[i], d);
    if (p[0] < -WV_PAD + 10 || p[0] > RB_W + WV_PAD - 10 || p[1] < -WV_PAD + 10 || p[1] > RB_H + WV_PAD - 10) return d;
    if (Math.abs(wvOwner(p[0], p[1]) - i) > WV_OWN) break;
    last = d;
  }
  return last;
}
// finds the stretches of the ribbon (at least 30 samples) where enough room is available for bands
function wvRuns(av) {
  const runs = [];
  let s = -1;
  for (let i = 0; i <= av.length; i++) {
    const ok = i < av.length && av[i] >= WV_MIN;
    if (ok) { if (s < 0) s = i; } else if (s >= 0) { if (i - s >= 30) runs.push([s, i - 1]); s = -1; }
  }
  return runs;
}
// a brush stroke inside a band: f = position between the band's inner and outer edge
function wvLine(B, i0, i1, f, w, col, a, o) {
  if (i1 - i0 < 6) return;
  const pts = [];
  for (let q = i0; q <= i1; q++) {
    const ff = rbCl(f + 0.04 * (2 * rbFbm(q * 0.012 + f * 9, B.sd) - 1), 0.01, 0.99), j = q - B.r0;
    const v = B.bIn[j] + ff * (B.bOut[j] - B.bIn[j]);
    pts.push(wvAt(B.sys, q, B.side, B.h[q], v));
  }
  const m = pts[pts.length >> 1];
  if (m[0] < -60 || m[0] > RB_W + 60 || m[1] < -60 || m[1] > RB_H + 60) return;
  rbBrush(rbSmoothPts(pts, 2, 2), w, col, a, o);
}
// paints one band layer: (1) a blurred wet wash, (2) broad strokes and thin filaments clipped to the band,
// (3) pigment pooling dashes along its outer edge
function wvPaintLayer(B, pal, l, nL) {
  const c = rbCtx, { poly, area } = wvBandPoly(B);
  wvWash(poly, pal);
  c.save();
  rbPath(poly);
  c.clip();
  c.globalAlpha = WV_ALPHA;
  wvBroadStrokes(B, pal, area);
  wvFilaments(B, pal, area);
  c.restore();
  wvEdgePool(B, pal, l, nL);
}
// outline of the band (inner edge then outer edge) and its area
function wvBandPoly(B) {
  const r0 = B.r0, L = B.r1 - r0 + 1, A = [], Z = [];
  let area = 0;
  for (let j = 0; j < L; j++) {
    const i = r0 + j;
    A.push(wvAt(B.sys, i, B.side, B.h[i], B.bIn[j]));
    Z.push(wvAt(B.sys, i, B.side, B.h[i], B.bOut[j]));
    area += Math.max(0, B.bOut[j] - B.bIn[j]) * 4;
  }
  return { poly: rbSmoothPts(A, 4, 3).concat(rbSmoothPts(Z, 4, 3).reverse()), area };
}
// wet wash: the band filled with a blurred mid colour
function wvWash(poly, pal) {
  rbBlurred(WV_SOFT, () => {
    rbPath(poly);
    rbCtx.fillStyle = rbRgba(rbGrad(pal, 0.5), 0.55 * WV_ALPHA);
    rbCtx.fill();
  });
}
// broad soft strokes that follow the wave (the number depends on the band area)
function wvBroadStrokes(B, pal, area) {
  rbBlurred(WV_SOFT * 0.25, () => rbRepeat(Math.round((area / (18 * 100 * 0.55)) * 1.4 * WV_COVER), () => wvBroadStroke(B, pal)));
}
function wvBroadStroke(B, pal) {
  const r0 = B.r0, r1 = B.r1, i = Math.floor(rbR(r0, r1)), len = Math.round(rbR(30, 80)), i0 = Math.max(r0, i - (len >> 1)), i1 = Math.min(r1, i0 + len);
  const j = i - r0, room = B.bOut[j] - B.bIn[j], w = Math.min(rbR(16, 36), room * 0.7);
  if (w < 3) return;
  const t = rbCl(rbFbm(i * 0.01 + 3, B.sd + 5) + rbR(-0.15, 0.15), 0, 1);
  wvLine(B, i0, i1, rbR(0.02, 0.98), w, rbGrad(pal, t), rbR(0.25, 0.5),
         { dry: 0.1, taper: 0.5, jit: 7, col2: rbGrad(pal, rbCl(t + rbR(-0.3, 0.3), 0, 1)) });
}
// thin pale filaments along the band
function wvFilaments(B, pal, area) {
  const accCols = TH.accW.concat([pal[0]]);
  rbBlurred(0.9, () => rbRepeat(Math.round((area / 2600) * WV_COVER), () => {
    const r0 = B.r0, r1 = B.r1, i = Math.floor(rbR(r0, r1)), len = Math.round(rbR(40, 120)), i0 = Math.max(r0, i - (len >> 1)), i1 = Math.min(r1, i0 + len);
    wvLine(B, i0, i1, rbR(0.08, 0.92), rbR(1.5, 3.5), rbPick(accCols), rbR(0.3, 0.55), { dry: 0.15, taper: 0.55, jit: 8 });
  }));
}
// pigment pooling: broken darker dashes along the outer edge of the band
function wvEdgePool(B, pal, l, nL) {
  const r0 = B.r0, r1 = B.r1, edgeCol = rbMix(rbGrad(pal, 0.15), RB_EDGE, 0.3), ea = WV_EDGE * (1 - 0.5 * l / Math.max(1, nL));
  let i = r0;
  rbBlurred(WV_SOFT * 0.4, () => rbRepeat((r1 - r0) / 10 + 2, () => {
    if (i >= r1 - 8) return;
    const i1 = Math.min(r1, i + Math.round(rbR(20, 50)));
    if (rbRnd() < 0.62) { wvLine(B, i, i1, 0.985, rbR(4, 8), edgeCol, ea, { dry: 0.12, taper: 0.6, jit: 6 }); }
    i = i1 + Math.round(rbR(-2, 8));
  }));
}
// paints all bands of one run on one side of the ribbon: decides how many bands fit (nL), where their
// borders are (bs, with wobble), picks palettes (fading toward paper further out), then paints the
// outermost band first so inner bands overlap it.
function wvPaintRun(sys, wd, side, h, av, r0, r1) {
  const L = r1 - r0 + 1, sd = rbSeedInt();
  let maxAv = 0;
  for (let j = 0; j < L; j++) { maxAv = Math.max(maxAv, av[r0 + j]); }
  const nL = rbCl(Math.round(maxAv / WV_BAND), 2, 9);
  const bs = wvBorders(av, r0, L, nL, sd), pals = wvBandPalettes(nL);
  rbRepeat(nL, q => {
    const l = nL - 1 - q;   // outermost band first
    const bIn = l > 0 ? bs[l].map(v => v - 8) : bs[l];
    wvPaintLayer({ sys, side, h, r0, r1, sd, bIn, bOut: bs[l + 1] }, pals[l], l, nL);
  });
}
// the nL + 1 border lines between the bands (distance from the ribbon at every sample of the run)
function wvBorders(av, r0, L, nL, sd) {
  const fr = Array.from({ length: nL + 1 }, (_, k) => (k === 0 ? 0 : k === nL ? 1 : rbCl(k / nL + rbR(-0.3, 0.3) / nL, 0.05, 0.95)));
  const bs = fr.map((f, k) => wvBorder(av, r0, L, nL, sd, f, k));
  for (let k = 1; k < bs.length; k++) { for (let j = 0; j < L; j++) { bs[k][j] = Math.max(bs[k][j], bs[k - 1][j] + 1.5); } }   // borders never cross
  return bs;
}
// one border line: fraction f of the free distance, wobbling, tapering to nothing at both ends of the run
function wvBorder(av, r0, L, nL, sd, f, k) {
  const arr = new Float32Array(L), ph = rbR(0, 50), over = k === nL ? WV_OVER : 0;
  for (let j = 0; j < L; j++) {
    const i = r0 + j, tp = rbSm(Math.min(j, L - 1 - j) / 20), a = av[i];
    const wob = (k > 0 && k < nL) ? 0.1 * a * (2 * rbFbm(i * 0.011 + ph, sd + k) - 1) : 0;
    arr[j] = -6 + (f * a + wob + over) * tp;
  }
  return arr;
}
// one palette per band: the innermost uses the first theme palette, the others random ones, all fading toward the paper further out
function wvBandPalettes(nL) {
  const pals = [];
  let prev = 0;
  for (let l = 0; l < nL; l++) {
    let idx = 0;
    if (l > 0) { idx = 1 + Math.floor(rbR(0, 4)); if (idx === prev) idx = 1 + Math.floor(rbR(0, 4)); }
    prev = idx;
    pals.push(WV_PALS[idx].map(col => rbMix(col, RB_PAPER, 0.12 + 0.35 * (l / nL))));
  }
  return pals;
}
// entry point of the background waves: for each side of the ribbon, find free stretches and paint bands in them
function rbBgWaves(sys, wd) {
  if (!WV_ON) return;
  wvBuildGrid(sys, wd);
  wvSd = rbSeedInt();
  wvSmooth = { N: rbNorms(rbSmoothPts(sys.C, 30, 4)) };
  [1, -1].forEach(side => {
    const hv = side > 0 ? wd.hp : wd.hm;
    const wb = Float32Array.from(hv, (v, i) => wvSq(sys, i, side, v));
    const av = wvAvail(sys, wd, side, wb);
    wvRuns(av).forEach(r => rbTry('bg wave run', () => wvPaintRun(sys, wd, side, wb, av, r[0], r[1])));
  });
}

// ======================================================================
// WAVE SHADING
// Light comes from RB_LIGHT (upper left). The bank facing away from the light gets darker,
// the bank facing the light gets a pale rim, which makes the ribbon look rounded.
// ======================================================================

// point on the ribbon at cross-fraction f (0 = - bank, 1 = + bank) of sample i
const rbAcross = (sys, wd, i, f) => rbPos(sys, i, -wd.hm[i] + f * (wd.hm[i] + wd.hp[i]));

// for every sample: how much its normal points toward the light (-1 to 1)
function rbLitArray(sys) {
  const L = RB_LIGHT, m = Math.hypot(L[0], L[1]) || 1;
  return Array.from({ length: sys.n }, (_, i) => (sys.N[i][0] * L[0] + sys.N[i][1] * L[1]) / m);
}
// fills the band between two cross-positions fA(i) and fB(i) along the whole ribbon
function rbBandFill(sys, wd, fA, fB, style) {
  const c = rbCtx, n = sys.n;
  const idx = Array.from({ length: Math.ceil(n / 2) }, (_, k) => Math.min(n - 1, k * 2));
  const A = rbSmoothPts(idx.map(i => rbAcross(sys, wd, i, fA(i))), 2, 2);
  const B = rbSmoothPts(idx.map(i => rbAcross(sys, wd, i, fB(i))), 2, 2);
  rbPath(A.concat(B.reverse()));
  c.fillStyle = style;
  c.fill();
}
// two blurred dark copies of the ribbon outline, offset away from the light, so the ribbon seems to float above the paper
function rbDropShadow(sys, wd) {
  if (RB_SHADE_DROP <= 0) return;
  const c = rbCtx, poly = rbOutline(sys, wd, 0, 12, 0), k = RB_SHADE * RB_SHADE_DROP;
  [[16, 9, 15, 0.16], [6, 4, 7, 0.14]].forEach(s => {   // [offset, ?, blur, opacity] for a wide soft and a tight shadow
    rbBlurred(s[2], () => {
      c.globalCompositeOperation = 'multiply';
      c.translate(-RB_LIGHT[0] * s[0], -RB_LIGHT[1] * s[0]);
      rbPath(poly);
      c.fillStyle = rbRgba(TH.drop, s[3] * k);
      c.fill();
    });
  });
}
// WEBPAGE: the bank shading used to be one big task (seven large blurred fills in one frame, which froze the page).
// It is now four small tasks, each on its own layer, so the work is spread over several frames. The look is the same.
// how deep the shadow band is at sample i: deeper on the bank facing away from the light, with noise
function rbBankDepth(lit, sd, side, i, mult) {
  const facing = side > 0 ? -lit[i] : lit[i];
  const wob = 0.7 + 0.6 * rbFbm(i * 0.015 + side * 7, sd + (side > 0 ? 1 : 2));
  return rbCl(RB_SHADE_DEPTH * mult * (0.78 + 0.4 * facing) * wob, 0.03, 0.6);
}
// one dark band along each bank (multiply blend). Called three times with shrinking depth
// to build a smooth gradient from the edge inward.
function rbShadeBankLayer(sys, wd, lit, sd, mult, alpha) {
  const c = rbCtx, sty = rbRgba(TH.bankShadow, alpha * RB_SHADE * 0.5);
  rbBlurred(8, () => {
    c.globalCompositeOperation = 'multiply';
    rbBandFill(sys, wd, () => 0, i => rbBankDepth(lit, sd, -1, i, mult), sty);
    rbBandFill(sys, wd, i => 1 - rbBankDepth(lit, sd, 1, i, mult), () => 1, sty);
  });
}
// a pale rim (screen blend) on whichever bank faces the light
function rbShadeBankLight(sys, wd, lit) {
  const c = rbCtx, sty = rbRgba(TH.bankLight, 0.16 * RB_SHADE);
  rbBlurred(2.5, () => {
    c.globalCompositeOperation = 'screen';
    rbBandFill(sys, wd, i => (lit[i] > 0 ? 0.93 : 0.035), i => (lit[i] > 0 ? 0.985 : 0.09), sty);
  });
}
// optional ripple shading: light and dark lines across the ribbon where the ripple slopes toward / away from the light.
// Off by default (RB_SHADE_RIPPLE = 0).
function rbShadeRipples(sys, wd) {
  if (RB_SHADE_RIPPLE <= 0) return;
  const k = RB_SHADE * RB_SHADE_RIPPLE, segs = rbRippleSegs(sys);
  rbRipplePass(sys, wd, segs, k, 'screen',   1, TH.bankLight, 2.5, 0.15);
  rbRipplePass(sys, wd, segs, k, 'multiply', -1, TH.bankShadow, 2.5, 0.14);
}
// short pieces of the ribbon with the slope of the ripple on them (-1 to 1)
function rbRippleSegs(sys) {
  const n = sys.n, STEP = 3;
  return Array.from({ length: Math.floor((n - 1) / STEP) }, (_, q) => {
    const i = q * STEP, j = Math.min(n - 1, i + STEP);
    const slope = sys.micro[Math.min(n - 1, i + 4)] - sys.micro[Math.max(0, i - 4)];
    return { i, j, s: rbCl(slope / 1.5, -1, 1) };
  });
}
// one pass: draws the pieces whose slope has the given sign, with the given blend mode and colour
function rbRipplePass(sys, wd, segs, k, mode, sign, rgb, blur, gain) {
  rbBlurred(blur, () => {
    rbCtx.globalCompositeOperation = mode;
    rbCtx.lineCap = 'butt';
    segs.forEach(g => rbRippleSeg(sys, wd, g, sign * g.s, rgb, gain, k));
  });
}
// one piece: five lines across the ribbon, more opaque the steeper the slope
function rbRippleSeg(sys, wd, g, a, rgb, gain, k) {
  if (a <= 0.04) return;
  const c = rbCtx, p0 = rbPos(sys, g.i, 0, true), RL = 5;
  if (p0[0] < -80 || p0[0] > RB_W + 80 || p0[1] < -80 || p0[1] > RB_H + 80) return;
  c.lineWidth = (wd.hm[g.i] + wd.hp[g.i]) * (1 / RL) * 1.1;
  c.strokeStyle = rbRgba(rgb, a * gain * k);
  for (let l = 0; l < RL; l++) { rbRippleLine(sys, wd, g, (l + 0.5) / RL); }
}
function rbRippleLine(sys, wd, g, f) {
  const A = rbAcross(sys, wd, g.i, f), B = rbAcross(sys, wd, g.j, f);
  rbCtx.beginPath();
  rbCtx.moveTo(A[0], A[1]);
  rbCtx.lineTo(B[0], B[1]);
  rbCtx.stroke();
}
// shading brush strokes on the ribbon body: dark (multiply) strokes on the shadow side, pale (screen)
// strokes on the lit side, each in a wide-soft and a thin-sharp pass, plus a few thin iridescent glints.
// Colours drift between the theme's deep/pale colours and the marbled colour ramp.
function rbShadeStrokes(sys, wd, lit, sd) {
  if (RB_SHADE_BODY <= 0) return;
  const S = rbShadeCtx(sys, wd, lit, sd);
  RB_SHADE_PASSES.forEach(P => rbShadePass(S, P));
  rbShadeGlints(S);
}
// The four shading passes: dark (multiply) and pale (screen) strokes, each as a wide soft pass and a thin sharp pass.
// count = strokes, len / w / a = [min, max] length (samples), width and opacity, reach = how far from the bank (0-1) they may go.
const RB_SHADE_PASSES = [
  { count: 60,  shadow: true,  mode: 'multiply', blur: 6,   len: [50, 150], w: [24, 48], a: [0.10, 0.17], reach: 0.46, o: { dry: 0.05, taper: 0.5 } },
  { count: 110, shadow: true,  mode: 'multiply', blur: 0.8, len: [25, 85],  w: [8, 18],  a: [0.12, 0.20], reach: 0.40, o: { dry: 0.14, taper: 0.5 } },
  { count: 45,  shadow: false, mode: 'screen',   blur: 6,   len: [50, 150], w: [20, 42], a: [0.08, 0.14], reach: 0.55, o: { dry: 0.05, taper: 0.5 } },
  { count: 85,  shadow: false, mode: 'screen',   blur: 0.8, len: [25, 85],  w: [5, 14],  a: [0.12, 0.22], reach: 0.50, o: { dry: 0.14, taper: 0.5 } },
];
// shared data of the shading strokes: colour helpers (deep = shadow colour, pale = light colour, both drifting along the colour ramp)
function rbShadeCtx(sys, wd, lit, sd) {
  const ir = RB_SHADE_IRID, hueAt = (i, dv) => rbIrid(rbCl(0.12 + 0.7 * rbFbm(i * 0.004 + 3, sd + 8) + dv, 0, 1));
  return { sys, wd, lit, n: sys.n, k: RB_SHADE * RB_SHADE_BODY, ir, maxTot: rbMaxWidth(sys, wd), hueAt,
           deep: (i, dv) => rbMix(TH.deep, rbMix(hueAt(i, dv), TH.deepIr, 0.35), ir),
           pale: (i, dv) => rbMix(TH.pale, rbLight(hueAt(i, dv), 0.35), ir) };
}
function rbShadePass(S, P) {
  rbBlurred(P.blur * RB_SHADE_SOFT, () => rbRepeat(P.count * 4, () => rbShadeStroke(S, P)));
}
// one shading stroke: a dark stroke goes on the bank facing away from the light, a pale one on the bank facing it
function rbShadeStroke(S, P) {
  const { sys, wd, lit, n } = S, i = Math.floor(rbR(0, n));
  if (rbRnd() > (wd.hm[i] + wd.hp[i]) / S.maxTot) return;
  const len = Math.round(rbR(P.len[0], P.len[1])), i0 = Math.max(0, i - (len >> 1)), i1 = Math.min(n - 1, i0 + len);
  const minusSide = P.shadow ? lit[i] > 0 : !(lit[i] > 0);
  const fr = rbR(0.02, P.reach), f = minusSide ? fr : 1 - fr;
  const dv = rbR(0.12, 0.3) * (rbRnd() < 0.5 ? 1 : -1);
  const col = P.shadow ? S.deep(i, 0) : S.pale(i, 0), col2 = P.shadow ? S.deep(i, dv) : S.pale(i, dv);
  rbLine(sys, wd, i0, i1, f, 0.05, rbR(P.w[0], P.w[1]), col, rbR(P.a[0], P.a[1]) * S.k, Object.assign({ mode: P.mode, col2, jit: 5 }, P.o));
}
// thin iridescent glints near the middle of the ribbon
function rbShadeGlints(S) {
  rbBlurred(0.5, () => rbRepeat(36 * S.k * S.ir, () => rbShadeGlint(S)));
}
function rbShadeGlint(S) {
  const { sys, wd, lit, n } = S, i = Math.floor(rbR(0, n));
  if (rbRnd() > (wd.hm[i] + wd.hp[i]) / S.maxTot) return;
  const len = Math.round(rbR(30, 100)), i0 = Math.max(0, i - (len >> 1)), i1 = Math.min(n - 1, i0 + len);
  const f = rbCl(0.5 + 0.16 * lit[i] + rbR(-0.14, 0.14), 0.15, 0.85), dv = rbR(0.2, 0.4) * (rbRnd() < 0.5 ? 1 : -1);
  rbLine(sys, wd, i0, i1, f, 0.04, rbR(2, 5), rbLight(S.hueAt(i, 0), 0.3), rbR(0.22, 0.38),
         { mode: 'screen', col2: rbLight(S.hueAt(i, dv), 0.3), dry: 0.12, taper: 0.6, jit: 4 });
}
// queues all shading steps as animation layers (so they play after the colour layers).
// Each rbStage() starts a new layer; rbTask(..., true) queues a whole step that is clipped to the ribbon.
function rbShade(sys, wd) {
  if (RB_SHADE <= 0) return;
  const lit = rbLitArray(sys), sd = rbSeedInt();
  rbStage(); rbTry('shade ripples', () => rbTask(() => rbShadeRipples(sys, wd), true));
  [[1.0, 0.10], [0.62, 0.12], [0.32, 0.15]].forEach(([mult, alpha]) => {
    rbStage(); rbTry('shade bank', () => rbTask(() => rbShadeBankLayer(sys, wd, lit, sd, mult, alpha), true));
  });
  rbStage(); rbTry('shade light',   () => rbTask(() => rbShadeBankLight(sys, wd, lit), true));
  rbStage(); rbTry('shade strokes', () => rbShadeStrokes(sys, wd, lit, sd));
}

// ======================================================================
// LOTUS LEAVES
// Each leaf follows the flow of the main wave and is painted on top of everything.
// Edge leaves are centred on the canvas border so about half of each is cut off.
// A cluster is one main leaf plus a few smaller leaves touching it.
// ======================================================================
const RB_LEAF        = 1;     // 0 hides the leaves
const RB_LEAF_EDGE   = 3;     // big leaf groups cut off by the border
const RB_LEAF_COUNT  = 4;     // normal leaf clusters
const RB_LEAF_GROUP  = 3;     // max extra leaves per cluster
const RB_LEAF_TOUCH  = 0.86;  // how close group leaves sit (1 = just touching)
const RB_LEAF_MIN    = 190;   // size range (length, px) of normal leaves
const RB_LEAF_MAX    = 380;
const RB_LEAF_BIG_MIN = 380;  // size range of edge leaves
const RB_LEAF_BIG_MAX = 560;
const RB_LEAF_WIDTH  = 0.40;  // half-width / length
const RB_LEAF_RUFFLE = 0.5;   // how wavy the leaf edges are
const RB_LEAF_HORIZ  = 0.5;   // how strongly leaves lean horizontal
const RB_LEAF_CLEAR  = 14;    // min gap between a leaf and the main wave
const RB_LEAF_SPREAD = 0.3;   // how far clusters keep apart
const RB_LEAF_SHADE  = 1.0;   // strength of the form shading on a leaf
const RB_LEAF_DROP   = 1.0;   // strength of a leaf's drop shadow
const RB_LEAF_ALPHA  = 1.0;   // overall opacity of leaf strokes
const RB_LEAF_FADE   = 0.2;   // max share a leaf's colours may fade toward paper
const RB_LEAF_MAXLUM = 208;   // leaves never get brighter than this
// lotus flowers resting on leaves
const RB_LEAF_LOTUS      = 0.55;  // chance a leaf carries a flower (at least 2 flowers always appear)
const RB_LEAF_LOTUS_MAX  = 5;     // most flowers on leaves
const RB_LEAF_LOTUS_SIZE = 0.3;   // flower radius relative to the leaf half-width
const RB_LEAF_LOTUS_SHADOW = 0.6; // chance a leaf flower casts a shadow
const rbLum    = c => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];                                // brightness of a colour
const rbCapLum = (c, m) => { const l = rbLum(c); return l > m ? c.map(v => v * m / l) : c; };    // darkens a colour if it is brighter than m

// ---- flow: the direction leaves point in ----
// Direction of the main wave at (x, y) (from its nearest spine sample), pulled toward horizontal
// by RB_LEAF_HORIZ so the leaves lie flat like they float on water.
function rbFlowDir(sys, x, y) {
  const j = rbCl(wvOwner(x, y), 1, sys.n - 2), a = sys.C[j - 1], b = sys.C[j + 1];
  let tx = b[0] - a[0], ty = b[1] - a[1];
  const m = Math.hypot(tx, ty) || 1;
  tx /= m; ty /= m;
  if (tx < 0) { tx = -tx; ty = -ty; }
  tx = tx * (1 - RB_LEAF_HORIZ) + RB_LEAF_HORIZ;
  ty *= 1 - RB_LEAF_HORIZ;
  const m2 = Math.hypot(tx, ty) || 1;
  return [tx / m2, ty / m2];
}
// the leaf's centre line: starts at (x, y) and follows the flow, turning slowly (4 % per step) toward the local direction
function rbFlowSpine(sys, x, y, L, M) {
  const ds = L / (M - 1), S = [[x, y]];
  let d = rbFlowDir(sys, x, y);
  for (let i = 1; i < M; i++) {
    const f = rbFlowDir(sys, x, y);
    d = [d[0] * 0.96 + f[0] * 0.04, d[1] * 0.96 + f[1] * 0.04];
    const m = Math.hypot(d[0], d[1]) || 1;
    d = [d[0] / m, d[1] / m];
    x += d[0] * ds; y += d[1] * ds;
    S.push([x, y]);
  }
  return rbSmoothPts(S, 4, 3);
}

// ---- leaf shape ----
// Builds a leaf from its centre line S0: bends the line a little, then gives the top and bottom
// sides separate wavy half-width profiles. Returns the data needed to paint it:
// S = centre line, N = normals, P(i, v) = point at position i and side v (-1 to 1), poly = outline.
function rbLeafBuild(S0, L) {
  const M = S0.length, sd = rbSeedInt(), hw = L * RB_LEAF_WIDTH * rbR(0.85, 1.1), sc = rbCl(hw / 40, 0.7, 2.2);
  const S = rbBendLeafSpine(S0, L), N = rbNorms(S);
  const hT = rbLeafProfile(M, L, hw), hB = rbLeafProfile(M, L, hw);
  const P = (i, v) => { const h = v >= 0 ? hT[i] : hB[i]; return [S[i][0] + N[i][0] * v * h, S[i][1] + N[i][1] * v * h]; };
  const top = Array.from({ length: M }, (_, i) => P(i, 1)), bottom = Array.from({ length: M }, (_, i) => P(M - 1 - i, -1));
  const poly = rbSmoothPts(top.concat(bottom), 2, 3);
  return { M, L, S, N, hT, hB, P, poly, hw, sd, sc };
}
// bends the leaf's centre line a little (one gentle sine bend)
function rbBendLeafSpine(S0, L) {
  const M = S0.length, N0 = rbNorms(S0), bk = rbR(0.6, 1.2), bph = rbR(0, 6.28);
  return S0.map((p, i) => {
    const u = i / (M - 1), b = 0.03 * L * Math.sin(2 * Math.PI * bk * u + bph) * Math.sin(Math.PI * u);
    return [p[0] + N0[i][0] * b, p[1] + N0[i][1] * b];
  });
}
// half-width of one side of the leaf along its length: pointed ends (env) with two sine ruffles of different size
function rbLeafProfile(M, L, hw) {
  const k1 = rbR(1.3, 2.6), k2 = Math.max(1.5, L / rbR(55, 80)), a1 = rbR(0, 6.28), a2 = rbR(0, 6.28), g = rbR(0.85, 1.1);
  return Array.from({ length: M }, (_, i) => {
    const u = i / (M - 1), env = Math.pow(Math.sin(Math.PI * Math.pow(u, 0.75)), 0.6);
    const w = 1 + 0.3 * RB_LEAF_RUFFLE * Math.sin(2 * Math.PI * k1 * u + a1) + 0.07 * RB_LEAF_RUFFLE * Math.sin(2 * Math.PI * k2 * u + a2);
    return hw * g * env * Math.max(0.15, w);
  });
}
// true if the outline crosses itself (a folded leaf): tests every pair of non-neighbouring edges for intersection
function rbLeafFolded(poly) {
  const n = poly.length, o = (a, b, c) => (c[1] - a[1]) * (b[0] - a[0]) - (b[1] - a[1]) * (c[0] - a[0]);
  for (let i = 0; i < n; i++) {
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      const a = poly[i], b = poly[(i + 1) % n], c = poly[j], d = poly[(j + 1) % n];
      if (o(a, c, d) * o(b, c, d) < 0 && o(a, b, c) * o(a, b, d) < 0) return true;
    }
  }
  return false;
}
// true if the point (x, y) lies inside the main ribbon (plus pad px), using the nearest spine sample
function rbInRibbon(sys, wd, x, y, pad) {
  const j = wvOwner(x, y);
  if (j < 0 || j >= sys.n) return false;
  const q = sys.C[j], dx = x - q[0], dy = y - q[1], w = dx * sys.N[j][0] + dy * sys.N[j][1] >= 0 ? wd.hp[j] : wd.hm[j];
  return Math.hypot(dx, dy) < w + pad;
}
// a leaf can be used if it is unfolded, clear of the main wave, and not far off the canvas.
// margin is how far past the canvas edge the leaf may reach
function rbLeafFits(sys, wd, G, margin) {
  // WEBPAGE speed: the cheap checks run first and the slow fold check last. The answer is the same (no random numbers are used here).
  for (let k = 0; k < G.poly.length; k += 4) {
    const q = G.poly[k];
    if (q[0] < -margin || q[0] > RB_W + margin || q[1] < -margin || q[1] > RB_H + margin) return false;
    if (rbInRibbon(sys, wd, q[0], q[1], RB_LEAF_CLEAR)) return false;
  }
  return !rbLeafFolded(G.poly);
}
// leaf whose stem starts at (x, y); the direction is flipped at random 35 % of the time
function rbLeafMake(sys, x, y, L) {
  const S = rbFlowSpine(sys, x, y, L, 90);
  if (rbRnd() < 0.35) { S.reverse(); }
  return rbLeafBuild(S, L);
}
// leaf centred on (mx, my)
function rbLeafMakeMid(sys, mx, my, L) {
  const d = rbFlowDir(sys, mx, my);
  const S = rbFlowSpine(sys, mx - d[0] * L / 2, my - d[1] * L / 2, L, 90);
  if (rbRnd() < 0.35) { S.reverse(); }
  return rbLeafBuild(S, L);
}
const rbLeafMidPt = G => G.S[G.M >> 1];                  // middle point of a leaf
const rbLeafRad   = L => L * 0.45;                       // radius used to keep leaves from overlapping
const rbMidOk = (m, pad) => m[0] > -pad && m[0] < RB_W + pad && m[1] > -pad && m[1] < RB_H + pad;   // is the point within pad of the canvas

// ---- painting a leaf ----
// Paints one leaf, clipped to its outline, in this order: drop shadow, base fill, wet washes,
// bristle strokes, strokes along the wavy edges, veins, broken rim, form shading, glints.
function rbLeafPaint(G) {
  const S = rbLeafStyle(G);
  rbLeafDropShadow(G);
  rbCtx.save();
  rbLeafBase(G, S);
  rbLeafWashes(G, S);
  rbLeafBristles(G, S);
  rbLeafEdgeStrokes(G, S);
  rbLeafVeins(G, S);
  rbLeafRim(G, S);
  rbLeafFormShade(G, S);
  rbLeafGlints(G);
  rbCtx.restore();
}
const rbLightDir = () => { const lm = Math.hypot(RB_LIGHT[0], RB_LIGHT[1]) || 1; return [RB_LIGHT[0] / lm, RB_LIGHT[1] / lm]; };   // unit vector toward the light
// this leaf's colours: a base palette (pal) and an accent palette (acc), lightly faded toward the paper and capped in brightness.
// col(f) picks a stroke colour at sideways position f: mostly base colours, more accent colour toward the edge.
function rbLeafStyle(G) {
  const fade = rbR(0, RB_LEAF_FADE), pi = Math.floor(rbR(0, RB_LEAF_PALS.length)), pj = (pi + 1 + Math.floor(rbR(0, RB_LEAF_PALS.length - 1))) % RB_LEAF_PALS.length;
  const prep = pl => pl.map(k => rbCapLum(rbMix(k, RB_PAPER, fade), RB_LEAF_MAXLUM));
  const pal = prep(RB_LEAF_PALS[pi]), acc = prep(RB_LEAF_IRIDS[pj % RB_LEAF_IRIDS.length]);
  const col = f => (rbRnd() < (0.05 + 0.4 * f * f) * (TH.leafAcc || 1) ? rbGrad(acc, rbR(0.2, 0.9)) : rbGrad(pal, rbCl(0.2 + 0.55 * f + rbR(-0.15, 0.15), 0, 1)));
  return { pal, acc, col, edgeCol: rbMix(rbGrad(pal, 0.2), TH.leafEdge, 0.2), area: G.L * G.hw * 1.1 };
}
// a path across the leaf from (i0, v0) to (i1, v1); v runs from -1 to 1 across the leaf
function rbLeafLine(G, i0, i1, v0, v1) {
  i0 = Math.max(0, Math.round(i0)); i1 = Math.min(G.M - 1, Math.round(i1));
  const n = i1 - i0;
  return Array.from({ length: n + 1 }, (_, k) => {
    const i = i0 + k;
    return G.P(i, rbCl(v0 + (v1 - v0) * (n ? k / n : 0) + 0.1 * (rbN(i * 0.12, G.sd) - 0.5), -1.03, 1.03));
  });
}
// a smooth brush stroke along such a path
function rbLeafBrush(G, i0, i1, v0, v1, w, colr, a, o) {
  if (Math.round(i1) - Math.round(i0) < 6) return;
  rbBrush(rbSmoothPts(rbLeafLine(G, i0, i1, v0, v1), 2, 2), w, colr, a, Object.assign({ smooth: true }, o));
}
// two blurred dark copies of the outline, offset away from the light
function rbLeafDropShadow(G) {
  if (RB_LEAF_DROP <= 0) return;
  const c = rbCtx, [lx, ly] = rbLightDir();
  [[11, 12, 0.13], [3.5, 4.5, 0.18]].forEach(s => rbBlurred(s[0], () => {
    c.globalCompositeOperation = 'multiply';
    c.translate(-lx * s[1], -ly * s[1]);
    rbPath(G.poly);
    c.fillStyle = rbRgba(TH.leafDrop, rbCl(s[2] * RB_LEAF_DROP, 0, 0.9));
    c.fill();
  }));
}
// clips everything that follows to the leaf outline and fills it with the mid colour
function rbLeafBase(G, S) {
  rbPath(G.poly);
  rbCtx.clip();
  rbPath(G.poly);
  rbCtx.fillStyle = rbRgba(rbGrad(S.pal, 0.55), 0.95);
  rbCtx.fill();
}
// wet washes fanning out from the stem
function rbLeafWashes(G, S) {
  rbBlurred(3, () => rbRepeat(S.area / 1300, () => {
    const i0 = rbR(0, G.M * 0.5), v0 = rbR(-0.9, 0.9);
    rbLeafBrush(G, i0, i0 + rbR(0.35, 0.8) * G.M, v0, v0 * rbR(0.6, 1.4), rbR(16, 32) * G.sc, S.col(Math.abs(v0)), rbR(0.25, 0.4) * RB_LEAF_ALPHA,
                { taper: 0.4, jit: 6, col2: S.col(Math.abs(v0) * 0.8) });
  }));
}
// bristle strokes (the visible brush texture)
function rbLeafBristles(G, S) {
  rbRepeat(S.area / 450, () => {
    const i0 = rbR(0, G.M - 20), v0 = rbR(-0.95, 0.95);
    rbLeafBrush(G, i0, i0 + rbR(18, 50), v0, v0 * rbR(0.9, 1.5), rbR(6, 14) * G.sc, S.col(Math.abs(v0)), rbR(0.4, 0.65) * RB_LEAF_ALPHA,
                { taper: 0.45, jit: 6, col2: S.col(Math.abs(v0) * 0.8) });
  });
}
// strokes that follow the wavy edges, on both sides at four distances from the middle
function rbLeafEdgeStrokes(G, S) {
  [0.9, 0.74, 0.56, 0.36].forEach((f, k) => [1, -1].forEach(sg => rbRepeat(3, () => {
    const i0 = rbR(0, G.M - 30), c0 = S.col(f), c1 = k % 2 ? rbCapLum(rbMix(c0, TH.vein, 0.2), RB_LEAF_MAXLUM) : c0;
    rbLeafBrush(G, i0, i0 + rbR(25, 60), sg * f, sg * f * rbR(0.9, 1.05), rbR(3.5, 8) * G.sc, c1, rbR(0.35, 0.55) * RB_LEAF_ALPHA, { taper: 0.5, jit: 6 });
  })));
}
// veins fanning from the stem: a dark thin line with a pale line beside it
function rbLeafVeins(G, S) {
  const A = RB_LEAF_ALPHA, veinLit = rbCapLum(rbMix(S.pal[2], TH.vein, 0.5), 235);
  const nV = 5 + Math.floor(rbR(0, 4));
  Array.from({ length: nV }, (_, q) => -0.85 + (1.7 * q) / (nV - 1)).forEach(vt => {
    const i1 = G.M * rbR(0.55, 0.92);
    rbLeafBrush(G, 2, i1, 0, vt, 3 * G.sc, S.edgeCol, 0.12 * A, { taper: 0.5, jit: 4 });
    rbLeafBrush(G, 2, i1, 0.03, vt * 0.97 + 0.03, 2.2 * G.sc, veinLit, 0.55 * A, { taper: 0.5, jit: 4 });
  });
}
// the rim in broken dashes, on both sides
function rbLeafRim(G, S) {
  [1, -1].forEach(sg => {
    let i = rbR(0, 10);
    rbRepeat(12, () => {
      const len = rbR(14, 30);
      if (i < G.M - 8 && rbRnd() < 0.62) { rbLeafBrush(G, i, i + len, sg * 0.985, sg * 0.985, rbR(2, 3.5) * G.sc, rbRnd() < 0.5 ? TH.vein : S.edgeCol, 0.45 * RB_LEAF_ALPHA, { taper: 0.6, jit: 6 }); }
      i += len + rbR(-2, 8);
    });
  });
}
// form shading: a dark band on the side away from the light, a pale band on the lit side
function rbLeafFormShade(G, S) {
  if (RB_LEAF_SHADE <= 0) return;
  const c = rbCtx, [lx, ly] = rbLightDir(), mid = G.M >> 1, ss = (G.N[mid][0] * lx + G.N[mid][1] * ly) > 0 ? -1 : 1;
  rbBlurred(7, () => { c.globalCompositeOperation = 'multiply'; rbLeafAlong(G, ss * 0.8, G.hw * 0.9, rbRgba(TH.leafShade, 0.12 * RB_LEAF_SHADE)); });
  rbBlurred(7, () => { c.globalCompositeOperation = 'screen'; rbLeafAlong(G, -ss * 0.55, G.hw * 0.6, rbRgba(rbLight(S.pal[2], 0.2), 0.12 * RB_LEAF_SHADE)); });
}
// a plain wide line along the leaf at sideways position v
function rbLeafAlong(G, v, w, style) {
  const c = rbCtx;
  c.beginPath();
  for (let i = 0; i < G.M; i++) { const p = G.P(i, v); if (i) { c.lineTo(p[0], p[1]); } else { c.moveTo(p[0], p[1]); } }
  c.lineWidth = w; c.lineCap = 'round'; c.lineJoin = 'round'; c.strokeStyle = style; c.stroke();
}
// thin glints
function rbLeafGlints(G) {
  rbBlurred(0.5, () => rbRepeat(6, () => {
    const u = rbR(0.2, 0.8), i0 = rbR(2, G.M * 0.5), v0 = rbR(-0.5, 0.5);
    rbLeafBrush(G, i0, i0 + rbR(20, 45), v0, v0 * rbR(1, 1.6), rbR(1.5, 3.5) * G.sc, rbLight(rbIrid(u), 0.3), rbR(0.2, 0.32),
                { mode: 'screen', col2: rbLight(rbIrid(rbCl(u + 0.2, 0, 1)), 0.3), taper: 0.6, jit: 4 });
  }));
}

// ---- flowers on the leaves ----
// Chosen per leaf from a hash of the seed and drawn after all leaves, so no leaf covers one.
// Only spots fully on the canvas can carry a flower.
function rbLeafLotuses(all) {
  if (RB_LEAF_LOTUS <= 0 || !all.length) return;
  const cand = rbLotusCandidates(all);
  const chosen = cand.filter(o => rbHash(o.k + 71, rbSeed) < RB_LEAF_LOTUS);
  cand.forEach(o => { if (chosen.length < Math.min(2, cand.length) && chosen.indexOf(o) < 0) chosen.push(o); });   // guarantee at least two flowers
  chosen.slice(0, RB_LEAF_LOTUS_MAX).forEach(o => {
    const r = rbCl(o.G.hw * RB_LEAF_LOTUS_SIZE, 16, 34), shadow = rbHash(o.k + 91, rbSeed) < RB_LEAF_LOTUS_SHADOW, rot = rbR(0, 6.28);
    rbTask(() => rbTry('leaf lotus', () => rbLotus(o.p[0], o.p[1], r, rot, shadow)), false, 'leaflotus');
  });
}
// a spot near the middle of every leaf that lies fully on the canvas
function rbLotusCandidates(all) {
  const cand = [];
  all.forEach((G, k) => {
    const i = Math.floor(G.M * rbR(0.35, 0.65)), v = rbR(-0.25, 0.25), p = G.P(i, v);
    if (p[0] < 30 || p[0] > RB_W - 30 || p[1] < 30 || p[1] > RB_H - 30) return;
    cand.push({ G, k, p });
  });
  return cand;
}

// ---- leaf placement ----
// Edge clusters first, then normal clusters. Group leaves sit next to the main leaf
// (about the sum of their radii apart) and never closer than that to any other leaf.
// For each cluster, many random candidates are tried and the one with the most free room is kept.
function rbLeaves(sys, wd) {
  if (RB_LEAF <= 0) return;
  if (!WV_ON || !wvGrid) { wvBuildGrid(sys, wd); }
  const clusters = [], all = [];
  rbRepeat(RB_LEAF_EDGE + RB_LEAF_COUNT, kc => rbLeafCluster(sys, wd, kc, clusters, all));
  // each leaf is queued, so the animation can grow them one at a time
  all.forEach(G => rbTask(() => rbTry('leaf', () => rbLeafPaint(G)), false, 'leaf'));   // painted at once unless RB_LEAF_ANIM = 1
  rbTry('leaf lotuses', () => rbLeafLotuses(all));
}
// places cluster number kc (the first RB_LEAF_EDGE are edge clusters): one main leaf plus a few smaller ones next to it
function rbLeafCluster(sys, wd, kc, clusters, all) {
  const best = rbBestLeaf(sys, wd, kc < RB_LEAF_EDGE, clusters);
  if (!best) return;
  const group = rbLeafGroup(sys, wd, best, all);
  clusters.push({ mid: best.mid, R: best.L * 1.1 });
  group.forEach(G => all.push(G));
}
// tries many random main leaves and keeps the one with the most free room around it
function rbBestLeaf(sys, wd, edge, clusters) {
  const tries = edge ? 240 : 160, best = { score: -1e9, v: null };
  rbRepeat(tries, q => {
    const shrink = 1 - (edge ? 0.45 : 0.3) * q / tries;   // later tries get smaller so big leaves still find a spot
    const L = (edge ? rbR(RB_LEAF_BIG_MIN, RB_LEAF_BIG_MAX) : rbR(RB_LEAF_MIN, RB_LEAF_MAX)) * shrink;
    const c = edge ? rbEdgeLeaf(sys, wd, L) : rbFreeLeaf(sys, wd, L);
    if (!c) return;
    const room = rbClusterRoom(clusters, c.mid, L);
    if (room >= 0 && room > best.score) { best.score = room; best.v = { G: c.G, L, mid: c.mid }; }
  });
  return best.v;
}
// a leaf whose centre sits on one of the four borders, so the part past it is cut off (null if it does not fit)
function rbEdgeLeaf(sys, wd, L) {
  const side = Math.floor(rbR(0, 4)), t = rbR(0.08, 0.92), k = rbR(-0.04, 0.2) * L;
  const mx = side === 0 ? k : side === 1 ? RB_W - k : t * RB_W, my = side === 2 ? k : side === 3 ? RB_H - k : t * RB_H;
  const G = rbLeafMakeMid(sys, mx, my, L), mid = rbLeafMidPt(G);
  if (!rbMidOk(mid, 0.3 * L) || !rbLeafFits(sys, wd, G, L * 0.8)) return null;
  return { G, mid };
}
// a leaf anywhere on the canvas (null if it does not fit)
function rbFreeLeaf(sys, wd, L) {
  const G = rbLeafMake(sys, rbR(0, RB_W), rbR(30, RB_H - 30), L), mid = rbLeafMidPt(G);
  if (mid[0] < 10 || mid[0] > RB_W - 10 || mid[1] < 10 || mid[1] > RB_H - 10) return null;
  return rbLeafFits(sys, wd, G, 140) ? { G, mid } : null;
}
// distance to the nearest existing cluster minus the space the two clusters need (negative = too close)
function rbClusterRoom(clusters, mid, L) {
  return clusters.reduce((m, p) => Math.min(m, Math.hypot(p.mid[0] - mid[0], p.mid[1] - mid[1]) - (p.R + L * 1.1) * RB_LEAF_SPREAD), 1e9);
}
// the main leaf plus 1 to RB_LEAF_GROUP smaller leaves around it
function rbLeafGroup(sys, wd, best, all) {
  const group = [best.G], extra = Math.floor(rbR(1, RB_LEAF_GROUP + 1));
  rbRepeat(extra, () => rbAddGroupLeaf(sys, wd, best, all, group));
  return group;
}
// up to 30 tries to place one more small leaf next to the main leaf
function rbAddGroupLeaf(sys, wd, best, all, group) {
  let got = false;
  rbRepeat(30, () => {
    if (got) return;
    const G2 = rbGroupCandidate(sys, wd, best, all.concat(group));
    if (G2) { group.push(G2); got = true; }
  });
}
// a small leaf at a random angle, about the sum of the two radii away; null if it does not fit or is too close to another leaf
function rbGroupCandidate(sys, wd, best, others) {
  const a = rbR(0, 6.28), L2 = best.L * rbR(0.45, 0.8);
  const d = (rbLeafRad(best.L) + rbLeafRad(L2)) * rbR(RB_LEAF_TOUCH, RB_LEAF_TOUCH + 0.22);
  const G2 = rbLeafMakeMid(sys, best.mid[0] + Math.cos(a) * d, best.mid[1] + Math.sin(a) * d, L2), m2 = rbLeafMidPt(G2);
  if (!rbMidOk(m2, 0.25 * L2) || !rbLeafFits(sys, wd, G2, L2 * 0.7)) return null;
  const tooClose = o => Math.hypot(rbLeafMidPt(o)[0] - m2[0], rbLeafMidPt(o)[1] - m2[1]) < (rbLeafRad(o.L) + rbLeafRad(L2)) * RB_LEAF_TOUCH;
  return others.some(tooClose) ? null : G2;
}

// ======================================================================
// GLAZE AND LOTUS FLOWERS
// ======================================================================

// soft colour glaze: three large radial gradients blended with "screen" over the finished ribbon
function rbGlaze() {
  const c = rbCtx, W = RB_W, H = RB_H;
  const pos = [[W * 0.45, H * 0.55, 340, 0.22], [W * 0.85, H * 0.4, 280, 0.16], [W * 0.15, H * 0.25, 260, 0.14]];
  c.save();
  c.globalCompositeOperation = 'screen';
  pos.forEach((p, k) => rbBloomAt(p[0], p[1], p[2], TH.glaze[k], p[3]));
  c.restore();
}
// soft shadow under a flower (uses no random numbers)
function rbLotusShadow(x, y, r) {
  const c = rbCtx, lm = Math.hypot(RB_LIGHT[0], RB_LIGHT[1]) || 1, lx = RB_LIGHT[0] / lm, ly = RB_LIGHT[1] / lm;
  [[r * 0.45, r * 0.55, 1.0, 0.7], [r * 0.14, r * 0.2, 0.9, 0.5]].forEach(s => {
    rbBlurred(s[0], () => {
      c.globalCompositeOperation = 'multiply';
      c.translate(-lx * s[1], -ly * s[1]);
      c.beginPath();
      c.ellipse(x, y, r * s[2] * 1.05, r * s[2] * 0.95, 0, 0, Math.PI * 2);
      c.fillStyle = rbRgba(TH.lotus.shadow, RB_LOTUS_SHADOW_A * s[3]);
      c.fill();
    });
  });
}
// A lotus flower centred at (x, y) with radius r: three rings of petals (8, 7 and 6) from outer to inner,
// each petal a tapered, slightly bent brush stroke with a pink centre stroke, then small stamen dots in the middle.
function rbLotus(x, y, r, rot, shadow) {
  if (shadow) { rbLotusShadow(x, y, r); }
  rbPetalLayers().forEach(ly => rbRepeat(ly.n, i => rbPetal(x, y, r, rot, ly, i)));
  rbRepeat(14, () => rbStamen(x, y, r));
}
// three rings of petals from the outside in: count, length, width, colour, opacity and angle offset
function rbPetalLayers() {
  const LP = TH.lotus.petals;
  return [
    { n: 8, L: 1.15, w: 0.5,  col: LP[0], a: 0.8,  off: 0 },
    { n: 7, L: 0.98, w: 0.52, col: LP[1], a: 0.92, off: 0.35 },
    { n: 6, L: 0.72, w: 0.46, col: LP[2], a: 0.95, off: 0.7 },
  ];
}
// petal number i of a ring: a tapered, slightly bent brush stroke from the centre outward, with a pink stroke on its inner part
function rbPetal(x, y, r, rot, ly, i) {
  const a = rot + ly.off + (i * 2 * Math.PI) / ly.n + rbR(-0.12, 0.12), Ln = r * ly.L * rbR(0.9, 1.1);
  const pts = Array.from({ length: 7 }, (_, s) => {
    const t = s / 6, bend = 0.15 * Math.sin(t * Math.PI) * (i % 2 ? 1 : -1);
    return [x + Math.cos(a + bend) * Ln * (0.12 + 0.88 * t), y + Math.sin(a + bend) * Ln * (0.12 + 0.88 * t)];
  });
  rbBrush(pts, r * ly.w, ly.col, ly.a, { dry: 0.03, taper: 0.5, jit: 5 });
  rbBrush(pts.slice(0, 3), r * ly.w * 0.5, TH.lotus.inner, 0.35, { dry: 0, jit: 4 });
}
// one small stamen dot near the centre
function rbStamen(x, y, r) {
  const c = rbCtx, a = rbR(0, 6.28), d = rbR(0, r * 0.28);
  c.beginPath();
  c.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, rbR(1.2, 2.6), 0, Math.PI * 2);
  c.fillStyle = rbRgba(rbPick(TH.lotus.stamen), 0.9);
  c.fill();
}

// ---- the ribbon, queued for the animation ----
// Queues everything that belongs to the ribbon, in painting order: drop shadow, body, glaze, flowers.
function rbPaintRibbon(sys, wd) {
  const poly = rbOutline(sys, wd, 0, 12, 0);
  rbClipPoly = poly;   // body strokes are clipped to this outline when played back
  rbTask(() => rbDropShadow(sys, wd), false);
  rbRibbonBody(sys, wd, poly);
  rbTask(rbGlaze, false, 'glaze');
  if (RB_LOTUS > 0) { rbRibbonLotuses(sys, wd); }
}
// everything inside the ribbon outline: each step is one layer of the animation.
// rbRecording = true makes rbBrush queue strokes instead of drawing them.
function rbRibbonBody(sys, wd, poly) {
  const c = rbCtx;
  rbTask(() => { rbPath(poly); c.fillStyle = rbRgba(TH.base, 0.9); c.fill(); }, true);   // flat base colour (layer 0, appears at once)
  rbRecording = true;
  [['base', rbStrokes], ['patches', rbPatches], ['flows', rbFlows], ['accents', rbAccents],
   ['dry', rbDryStreaks], ['shadows', rbShadows], ['highlights', rbHighlights], ['edges', rbEdges]
  ].forEach(s => { rbStage(); rbTry(s[0], () => s[1](sys, wd)); });
  rbIsolated('wave shading', 5, () => rbShade(sys, wd));
  rbRecording = false;
}
// queues four flowers on the ribbon at roughly 14 %, 34 %, 58 % and 84 % of its visible length.
// If a spot is too close to the canvas edge, nearby spots are tried.
function rbRibbonLotuses(sys, wd) {
  [0.14, 0.34, 0.58, 0.84].forEach((u, fi) => {
    const f = rbR(0.3, 0.7), r = rbR(18, 28), rot = rbR(0, 6.28);
    const shadow = rbHash(fi + 11, rbSeed) < RB_LOTUS_SHADOW;
    const p = rbLotusSpot(sys, wd, u, f);
    if (p) { rbTask(() => rbLotus(p[0], p[1], r, rot, shadow), false, 'lotus'); }
  });
}
// a spot at about u (0-1) along the ribbon and f across it that is not too close to the canvas edge; nearby spots are tried if not
function rbLotusSpot(sys, wd, u, f) {
  const n = sys.n, span = sys.u1 - sys.u0;
  for (const d of [0, 0.02, -0.02, 0.04, -0.04, 0.06, -0.06, 0.09, -0.09]) {
    const i = rbCl(Math.floor((sys.u0 + (u + d) * span) * (n - 1)), 0, n - 1);
    const p = rbPos(sys, i, -wd.hm[i] + f * (wd.hm[i] + wd.hp[i]));
    if (p[0] > 40 && p[0] < RB_W - 40 && p[1] > 40 && p[1] < RB_H - 40) return p;
  }
  return null;
}
// runs fn and logs (instead of crashing) if it fails, so one broken step cannot stop the whole painting
function rbTry(name, fn) {
  try { return fn(); } catch (e) { console.error('ribbon step "' + name + '" failed:', e); }
}

// ======================================================================
// ANIMATION
// Painting steps are queued instead of drawn. rbPlan gives every queued stroke a time,
// from a pattern picked by the seed, and rbPlay paints the strokes whose time has come.
// Each queue item: { kind (0 stroke / 1 whole step), clip, layer, final, u (position 0-1 along ribbon), thread (0 / 1), run, t (time) }
// ======================================================================
let rbRecording = false, rbBlurNow = 0, rbLayerNo = 0, rbQ = [], rbQi = 0;   // recording flag, blur to remember, layer counter, queue, next item to play
let rbAnim = null, rbAnimSys = null, rbClipPoly = null;                      // animation settings, ribbon used for positions, clip outline

const rbStage = () => { rbLayerNo++; };   // starts a new animation layer (a group of strokes that reveal together)
// queues a whole step (shading, glaze, a leaf...). clip = paint inside the ribbon outline.
// `final` marks steps with their own time ('glaze', 'lotus', 'leaf', 'leaflotus').
function rbTask(fn, clip, final) {
  if (!RB_LEAF_ANIM && (final === 'leaf' || final === 'leaflotus')) { rbTry('leaf now', fn); return; }   // leaves are not animated
  rbQ.push({ kind: 1, clip: !!clip, layer: rbLayerNo, final: final || '', u: 0.5, thread: 0, run: fn });
}
// queues one brush stroke, with its position along the ribbon (0 to 1) and the thread it belongs to (0 or 1)
function rbRecordStroke(pts, wv, col, a, o) {
  if (pts.length < 2) return;
  const blur = rbBlurNow, mid = pts[pts.length >> 1];
  rbQ.push({ kind: 0, clip: true, layer: rbLayerNo, final: '', u: rbUAt(mid), thread: rbThreadOf(mid),
             run: () => rbBlurred(blur, () => rbBrush(pts, wv, col, a, o)) });
}
// position (0-1) along the visible ribbon of the spine sample nearest to point p
function rbUAt(p) {
  const s = rbAnimSys;
  if (!s || !wvGrid) return 0.5;
  const j = rbCl(wvOwner(p[0], p[1]), 0, s.n - 1) / (s.n - 1);
  return rbCl((j - s.u0) / ((s.u1 - s.u0) || 1), 0, 1);
}
// WEAVING: which thread a point belongs to: 1 if it lies on the + side of the spine, otherwise 0 (uses no random numbers)
function rbThreadOf(p) {
  const s = rbAnimSys;
  if (!s || !wvGrid) return 0;
  const j = rbCl(wvOwner(p[0], p[1]), 0, s.n - 1), c = s.C[j], nm = s.N[j];
  return ((p[0] - c[0]) * nm[0] + (p[1] - c[1]) * nm[1]) > 0 ? 1 : 0;
}
// WEAVING: extra delay for strokes that are "over" in their band, so they paint on top of the "under" strokes (uses no random numbers).
// The ribbon is cut into RB_WEAVE_BANDS bands; in each band one thread is over, and the two swap from band to band.
function rbWeaveLift(it, W) {
  if (!RB_WEAVE || it.kind === 1) return 0;
  const band = Math.floor(it.u * RB_WEAVE_BANDS);
  return (band + it.thread) % 2 === 0 ? W * RB_WEAVE : 0;
}

// ---- reveal patterns ----
// Distance to the nearest ripple origin, used by the 'ripples' pattern.
const rbRipple = (o, u) => o.reduce((m, p) => Math.min(m, Math.abs(u - p[0]) + p[1]), 9);
// Creates the random settings of this painting's animation. A random one of five patterns decides
// the order in which each layer is revealed along the ribbon:
//   sweep - from one end to the other      bloom - outward from one point
//   ripples - outward from several points  braid - alternate layers run in opposite directions
//   tide - a wavy front
function rbMakeAnim() {
  const kind = rbPick(['sweep', 'bloom', 'ripples', 'braid', 'tide']);
  const A = { kind, dur: rbR(RB_ANIM_SECONDS[0], RB_ANIM_SECONDS[1]), win: rbR(0.22, 0.5), ease: rbR(0.75, 1.5),
              jit: rbR(0.01, 0.06), dir: rbRnd() < 0.5 ? 1 : -1, flip: rbRnd() < 0.5 ? 0 : 1,
              k: rbR(1.5, 4), ph: rbR(0, 6.28), o: [], norm: 1, bgDur: 0, t0: 0 };
  A.bgDur = RB_BG_ANIM ? A.dur * RB_BG_SPEED : 0;   // how long the background takes
  A.t0 = A.bgDur * RB_BG_HEAD;                      // when the ribbon starts
  rbAnimOrigins(A);
  return A;
}
// the starting points of the 'bloom' (one) and 'ripples' (three to five) patterns, and the largest distance from them
function rbAnimOrigins(A) {
  if (A.kind === 'bloom') {
    A.o = [[rbR(0.15, 0.85), 0]];
    A.norm = Math.max(A.o[0][0], 1 - A.o[0][0]);
  }
  if (A.kind === 'ripples') {
    A.o = rbRepeat(rbR(3, 5), () => [rbR(0, 1), rbR(0, 0.35)]);
    A.norm = Math.max(0.05, ...Array.from({ length: 41 }, (_, s) => rbRipple(A.o, s / 40)));
  }
}
// how far along its layer's reveal a stroke is (0 = first, 1 = last), for the chosen pattern
function rbFront(A, u, l) {
  switch (A.kind) {
    case 'sweep':   return A.dir > 0 ? u : 1 - u;
    case 'bloom':   return Math.abs(u - A.o[0][0]) / A.norm;
    case 'ripples': return rbRipple(A.o, u) / A.norm;
    case 'braid':   return (l + A.flip) % 2 ? u : 1 - u;
    default:        return rbCl(0.75 * u + 0.25 * (0.5 + 0.5 * Math.sin(u * A.k * 6.283 + A.ph + l * 0.8)), 0, 1);
  }
}
// glaze, lotuses and leaves have their own times
function rbFinalTime(A, it, cnt, nLot) {
  const k = cnt[it.final] = (cnt[it.final] || 0) + 1;
  const from = A.dur * RB_FINISH_FROM, to = A.dur * RB_FINISH_TO;
  if (it.final === 'glaze') return A.dur * RB_GLAZE_AT;
  if (it.final === 'lotus') return from + (to - from) * (k - 1) / Math.max(1, nLot - 1);   // spread out, so no two flowers land in one frame
  if (it.final === 'leaf')  return A.dur * rbR(0.4, 1);
  return from + (to - from) * rbR(0, 1);
}
// Gives every queued item a time t and sorts the queue by it.
// A stroke's time = start of its layer + (how far its front has reached) within a reveal window.
function rbSchedule(A) {
  if (!RB_ANIM) { rbQ.forEach(it => { it.t = 0; }); return; }
  const nL = Math.max(1, rbLayerNo), W = A.dur * A.win, cnt = {};
  const nLot = rbQ.filter(it => it.final === 'lotus').length;
  // squeezes the layer starts so the last stroke (including the weave delay) ends at RB_STROKES_END
  const span = rbCl((A.dur * RB_STROKES_END - W * (1 + A.jit + RB_WEAVE)) / Math.max(0.01, A.dur - W), 0.3, 1);
  rbQ.forEach(it => { it.t = rbItemTime(A, it, nL, W, span, cnt, nLot); });
  rbQ.forEach(it => { it.t += A.t0; });   // the ribbon waits for the background
  rbQ.sort((a, b) => a.t - b.t);
}
// time of one queued item: glaze, flowers and leaves have their own times; a stroke starts with its layer
// and is shifted by how far its layer's reveal front has reached, plus the weave delay if it is the "over" thread
function rbItemTime(A, it, nL, W, span, cnt, nLot) {
  if (it.final) { return rbFinalTime(A, it, cnt, nLot); }
  if (it.layer === 0) { return 0; }
  const start = nL > 1 ? (A.dur - W) * span * (it.layer - 1) / (nL - 1) : 0;
  const f = it.kind === 1 ? 0.5 : Math.pow(rbFront(A, it.u, it.layer), A.ease);
  return Math.max(0, start + W * (f + A.jit * rbR(-1, 1)) + rbWeaveLift(it, W));
}
// makes the animation plan with its own random stream (so it never disturbs the painting's random numbers)
function rbPlan() {
  const keep = rbRS;
  rbRS = (rbSeed * 2654435 + 977) | 0;
  rbAnim = rbMakeAnim();
  rbSchedule(rbAnim);
  rbRS = keep;
  console.log('animation: ' + rbAnim.kind + ', ' + rbAnim.dur.toFixed(1) + ' s');
}

// enters or leaves the clip to the ribbon outline (stroke items are clipped, whole-step items may not be)
function rbSwitchClip(on) {
  const c = rbCtx;
  if (on) { c.save(); rbPath(rbClipPoly); c.clip(); } else { c.restore(); }
}
// WEBPAGE: while the visitor is scrolling, the animation only paints small strokes, with a smaller budget.
// The big steps (shading, glaze, flowers) wait until scrolling pauses, so scrolling never freezes.
let rbScrollAt = -1e9;
addEventListener('scroll', () => { rbScrollAt = performance.now(); }, { passive: true });
const rbScrolling = () => performance.now() - rbScrollAt < RB_SCROLL_IDLE_MS;
// Paints every queued item whose time has come (t <= current time), until the frame budget (budgetMs) runs out.
function rbPlay(t, budgetMs) {
  const c = rbCtx, start = performance.now();
  let clipped = false;
  c.save();
  c.scale(rbSC, rbSC);
  c.lineCap = 'round';
  c.lineJoin = 'round';
  while (rbDue(t, start, budgetMs)) { clipped = rbPlayItem(rbQ[rbQi++], clipped); }
  if (clipped) { c.restore(); }
  c.restore();
}
// true while the next queued item is due, there is frame time left, and it is not a big step during scrolling
function rbDue(t, start, budgetMs) {
  if (rbQi >= rbQ.length || rbQ[rbQi].t > t || performance.now() - start >= budgetMs) return false;
  return !(rbScrolling() && (rbQ[rbQi].kind === 1 || rbQ[rbQi].final));   // big step: wait for the scroll to stop
}
// paints one item (inside the ribbon clip if it asks for it) and returns the clip state for the next item
function rbPlayItem(it, clipped) {
  if (it.clip !== clipped) { rbSwitchClip(it.clip); }
  rbCtx.save();
  rbTry('play', it.run);
  rbCtx.restore();
  return it.clip;
}

// ======================================================================
// p5 ENTRY POINTS AND ON-SCREEN DISPLAY
// The painting is drawn on a hidden canvas (rbFG). The visible p5 canvas only shows a copy of it.
// ======================================================================
let rbReady = false, rbInstant = false, rbT0 = -1;   // build finished, skip the animation, animation clock start (ms)
let rbMainCtx, rbFG, rbScratch, rbScr, rbReveal = null;   // visible canvas context, hidden painting canvas, masking scratch canvas and its context, reveal mask

// WEBPAGE: fixed 1920 px render; CSS scales the canvas to the window, so no repaint on resize.
function rbLayout() {
  rbCw = RB_RENDER_W;
  rbCh = Math.round(rbCw * 9 / 16);   // exactly 1920 x 1080 as the brief asks (the drawing is 1.7 px taller than 16:9, so its last 2 px are cut off)
}
// WEBPAGE: moves the p5 canvas into the page and tells the CSS which palette is active
function rbMountCanvas() {
  const mount = document.getElementById('art-mount');
  if (mount) { mount.appendChild(drawingContext.canvas); }
  document.documentElement.setAttribute('data-theme', String(rbThemeIdx));
}
// WEBPAGE: the CSS fades the canvas in and the loading screen finishes when body has this class
const rbMarkReady = () => document.body.classList.add('art-ready');
// WEBPAGE: the landing page keeps #art-mount at opacity 0 until the visitor scrolls, so the animation
// waits until the art is at least slightly visible; otherwise it would finish before anyone sees it.
function rbArtSeen() {
  const m = document.getElementById('art-mount');
  if (!m || m.style.opacity === '') { return true; }
  return parseFloat(m.style.opacity) > 0.12;
}
// checks every 150 ms whether the art has become visible, then starts the animation clock and the draw loop
function rbWaitForArt() {
  const timer = setInterval(() => {
    if (!rbArtSeen()) { return; }
    clearInterval(timer);
    rbT0 = -1;   // the animation clock starts now
    loop();
  }, 150);
}
// Creates the hidden painting canvas (rbFG) and a second scratch canvas (used for the fade-in mask).
// rbCtx, the context every painting function draws on, is the hidden canvas.
function rbMakeLayers() {
  const pd = pixelDensity(), w = Math.round(rbCw * pd), h = Math.round(rbCh * pd);
  rbMainCtx = drawingContext;
  rbFG = document.createElement('canvas');
  rbScratch = document.createElement('canvas');
  [rbFG, rbScratch].forEach(cv => { cv.width = w; cv.height = h; });
  rbCtx = rbFG.getContext('2d');
  rbCtx.setTransform(pd, 0, 0, pd, 0, 0);
  rbScr = rbScratch.getContext('2d');
}

// ---- background fade-in ----
// The background is revealed gradually along the ribbon. A small mask canvas holds one pixel per grid cell;
// its opacity rises over time and it is applied to the hidden painting when it is shown.

// time at which the spot (x, y) starts to fade in. j = nearest ribbon sample.
// Uses the same front as the ribbon animation, plus a delay with distance from the ribbon.
function rbRevealStart(sys, wd, x, y, j) {
  const A = rbAnim, c = sys.C[j], span = (sys.u1 - sys.u0) || 1;
  const u = rbCl((j / (sys.n - 1) - sys.u0) / span, 0, 1);
  const lag = rbCl(Math.hypot(x - c[0], y - c[1]) / RB_BG_LAGPX, 0, 1);
  const wob = rbFbm2(x / 140, y / 140, rbSeed % 997) - 0.5;   // ragged front, no random stream used
  const f = rbCl((1 - RB_BG_LAG) * rbFront(A, u, 0) + RB_BG_LAG * lag + 0.16 * wob, 0, 1);
  const t = f * A.bgDur * (1 - RB_BG_FADE);
  // spots under the ribbon must be fully visible by the time the ribbon starts painting
  return rbInRibbon(sys, wd, x, y, RB_BG_RIBBON_PAD) ? Math.min(t, A.t0 - A.bgDur * RB_BG_FADE) : t;
}
// one start time per cell of the wave grid, plus a small canvas that holds the mask
function rbBuildReveal(sys, wd) {
  rbReveal = null;
  if (rbInstant) return;   // instant rebuild (after a resize) has no fade-in, so no mask is needed
  if (!RB_BG_ANIM || !RB_ANIM || !wvGrid) return;
  const g = wvGrid, start = new Float32Array(g.gw * g.gh);
  rbRepeat(g.gh, gy => rbRevealRow(sys, wd, gy, start));
  const cv = document.createElement('canvas');
  cv.width = g.gw; cv.height = g.gh;
  const cx = cv.getContext('2d');
  rbReveal = { start, cv, cx, img: cx.createImageData(g.gw, g.gh), fade: rbAnim.bgDur * RB_BG_FADE };
}
// start times of one row of the wave grid
function rbRevealRow(sys, wd, gy, start) {
  const g = wvGrid, y = gy * WV_CELL - WV_PAD + WV_CELL / 2;
  for (let gx = 0; gx < g.gw; gx++) {
    const k = gy * g.gw + gx, x = gx * WV_CELL - WV_PAD + WV_CELL / 2;
    start[k] = rbRevealStart(sys, wd, x, y, rbCl(g.own[k], 0, sys.n - 1));
  }
}
// sets the mask opacity for time t. returns true once every spot is fully visible
function rbRevealUpdate(t) {
  const R = rbReveal, d = R.img.data;
  let done = true;
  for (let k = 0; k < R.start.length; k++) {
    const a = rbSm((t - R.start[k]) / R.fade);
    d[k * 4 + 3] = a * 255;
    if (a < 1) done = false;
  }
  R.cx.putImageData(R.img, 0, 0);
  return done;
}
// puts the hidden layer on screen (through the mask while the background is still fading in).
// While fading: copy the painting to the scratch canvas, cut it with the mask ('destination-in'),
// fill the screen with paper colour, and draw the masked copy on top. Returns true when the fade is over.
function rbShow(t) {
  const m = rbMainCtx, done = rbReveal ? rbRevealUpdate(t) : true;
  if (done) { m.drawImage(rbFG, 0, 0, rbCw, rbCh); return true; }
  const s = rbScr, k = rbSC * pixelDensity(), g = wvGrid;
  s.globalCompositeOperation = 'copy';
  s.drawImage(rbFG, 0, 0);
  s.globalCompositeOperation = 'destination-in';
  s.imageSmoothingEnabled = true;
  s.drawImage(rbReveal.cv, -WV_PAD * k, -WV_PAD * k, g.gw * WV_CELL * k, g.gh * WV_CELL * k);
  m.fillStyle = rbRgba(RB_PAPER, 1);
  m.fillRect(0, 0, rbCw, rbCh);
  m.drawImage(rbScratch, 0, 0, rbCw, rbCh);
  return false;
}

// p5 setup: creates the visible canvas and puts it into the webpage. Nothing is painted yet.
function setup() {
  rbLayout();
  createCanvas(rbCw, rbCh);
  pixelDensity(Math.min(RB_MAX_DPR, displayDensity()));
  rbApplyTheme(rbThemeIdx);
  rbMountCanvas();   // WEBPAGE
  console.log('palette: ' + TH.name + '   seed: ' + rbSeed);
}

// WEBPAGE: add ?timing to the page address (for example index.html?timing) to print how long each build step takes in the console.
const RB_TIMING = /[?&]timing\b/.test(location.search);
let rbLapT = 0;
function rbLap(label) {
  if (!RB_TIMING) return;
  try { rbCtx.getImageData(0, 0, 1, 1); } catch (e) { /* ignore */ }   // makes the browser finish the drawing so the time is real
  const t = performance.now();
  console.log('build  ' + label.padEnd(12) + (t - rbLapT).toFixed(0) + ' ms');
  rbLapT = t;
}
// Builds the whole scene once: paints the static background straight onto the hidden canvas,
// queues the ribbon, leaves and flowers, then makes the animation plan and the reveal mask.
// Steps run in this order: paper -> streaks -> ribbon shape -> background -> background waves -> ribbon -> leaves.
function rbRender() {
  rbLapT = performance.now();
  rbMakeLayers();
  rbResetState();
  rbPrepareCanvas();
  const built = rbBuildScene();
  rbCtx.restore();
  rbPlan();
  rbTry('bg reveal', () => rbBuildReveal(built.sys, built.wd));
  rbLap('reveal mask');
  rbRS = (rbSeed * 1299709 + 31) | 0;   // the random stream used while painting the queue
}
// clears all state of the previous painting and starts the main random stream from the seed
function rbResetState() {
  rbRS = rbSeed * 7919 + 13;
  rbFluid = null;
  wvGrid = null;
  rbQ = []; rbQi = 0; rbLayerNo = 0; rbRecording = false; rbBlurNow = 0;
  rbSC = rbCw / RB_W;
  rbBL = rbSC * pixelDensity();
}
// paper colour, then scales the context so all coordinates are on the 1136 x 640 design grid
function rbPrepareCanvas() {
  const c = rbCtx;
  c.fillStyle = rbRgba(RB_PAPER, 1);
  c.fillRect(0, 0, rbCw, rbCh);
  c.save();
  c.scale(rbSC, rbSC);
  c.lineCap = 'round';
  c.lineJoin = 'round';
}
// builds everything in order: paper streaks, ribbon shape, background, background waves, ribbon, leaves
function rbBuildScene() {
  rbTry('streaks', rbStreaks);
  rbLap('streaks');
  const built = rbBuild(), sys = built.sys, wd = built.wd;
  rbLap('ribbon shape');
  rbBuildBackground(sys, wd);
  rbAnimSys = sys;
  rbTry('ribbon', () => rbPaintRibbon(sys, wd));
  rbLap('ribbon');
  rbIsolated('leaves', 7, () => rbLeaves(sys, wd));
  rbLap('leaves');
  return built;
}
function rbBuildBackground(sys, wd) {
  rbTry('background', () => rbBackground(sys, wd));
  rbLap('background');
  rbIsolated('bg waves', 6, () => rbBgWaves(sys, wd));
  rbLap('bg waves');
  if (!WV_ON || !wvGrid) { wvBuildGrid(sys, wd); }
}

let rbWait = true;   // the first call to draw only paints the paper colour, so the page can show before the heavy build
// p5 draw loop. Three phases:
//   1. first call: paint paper colour only and pause briefly, so the page appears before the heavy work
//   2. second call: build the scene (rbRender), show frame 0 and tell the page it is ready
//   3. every later call: advance the animation clock, paint the queue items that are due, show the result;
//      stop looping once everything is painted and the background has faded in
function draw() {
  if (!rbReady) { rbBuildFrame(); return; }
  if (rbT0 < 0) { rbT0 = millis(); }
  const t = (millis() - rbT0) / 1000;
  rbPlay(t, rbScrolling() ? RB_SCROLL_MS : RB_FRAME_MS);
  const bgDone = rbShow(t);
  if (rbQi >= rbQ.length && bgDone) { noLoop(); }
}
// the two build frames: the first only paints the paper colour so the page can show; the second builds the scene
function rbBuildFrame() {
  if (rbWait) {
    rbWait = false;
    background(RB_PAPER[0], RB_PAPER[1], RB_PAPER[2]);
    noLoop();
    setTimeout(loop, 80);              // build starts after the browser has painted the page
    return;
  }
  rbRender();                          // this frame builds the scene
  rbReady = true;
  rbT0 = -1;
  rbStartPlayback();
}
// after the build: show the first frame (or the finished picture at once when there is no animation) and tell the page
function rbStartPlayback() {
  const animated = !rbInstant && RB_ANIM;
  if (animated) { rbShow(0); frameRate(RB_FPS); } else { rbPlay(1e9, 1e9); rbShow(1e9); noLoop(); }   // WEBPAGE: 30 fps so the page can scroll while it plays
  rbMarkReady();                       // WEBPAGE: build done, the painting starts to appear
  rbAfterBuild();                      // WEBPAGE: tell the page that a (new) painting is ready
  if (animated && !rbArtSeen()) { noLoop(); rbWaitForArt(); }   // WEBPAGE: hold the animation until the art can be seen
}
// WEBPAGE: no windowResized(). The canvas is always 1920 x 1080 and CSS scales it.

// WEBPAGE: "Weave a new silk". Repaints only the artwork with a new seed and palette, without reloading the page.
// The picture is made exactly as on a fresh visit (same code, new seed), and the animation plays again.
let rbBusy = false;   // true while a new painting is being built, so a double click does nothing
// called after every build: updates the page colours to the active palette and tells the page (event "art:ready")
function rbAfterBuild() {
  document.documentElement.setAttribute('data-theme', String(rbThemeIdx));   // the page colours follow the palette
  document.body.classList.remove('art-weaving');
  rbBusy = false;
  window.dispatchEvent(new CustomEvent('art:ready'));
}
window.rbWeaveNew = function () {
  if (rbBusy || !rbReady) { return false; }
  rbBusy = true;
  noLoop();                                      // stop the old animation
  document.body.classList.add('art-weaving');
  rbSeed = Math.floor(Math.random() * 1e6);
  rbThemeIdx = RB_FORCE_THEME >= 0 ? RB_FORCE_THEME % RB_THEMES.length : Math.floor(Math.random() * RB_THEMES.length);
  rbApplyTheme(rbThemeIdx);
  rbReady = false; rbWait = false; rbInstant = false;
  rbReveal = null; rbQ = []; rbQi = 0; rbT0 = -1;
  console.log('new silk - palette: ' + TH.name + '   seed: ' + rbSeed);
  setTimeout(loop, 60);                          // lets the page show the "weaving" state before the build starts
  return true;
};

// WEBPAGE speed: p5 normally waits for the window "load" event, which only fires after every image on the page
// (about 12 MB of PNG files) has been downloaded, and only then starts the build. Here p5 is started as soon as the
// page structure is ready, so the painting is built while the images download. If this fails for any reason, p5
// still starts by itself at "load" as before. The picture itself is not affected.
(function rbEarlyStart() {
  if (typeof p5 === 'undefined' || p5.instance || document.readyState === 'complete') return;
  const start = () => {
    try { if (!p5.instance) { new p5(); } } catch (e) { console.warn('early p5 start failed, waiting for load:', e); }
  };
  if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', start, { once: true }); } else { start(); }
})();