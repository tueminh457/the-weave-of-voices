# The Weave of Voices – SDG 5 Generative Art and Webpage
Version 1.1 · 25 November 2026 · COMM2754 Assignment 1 (26t3)

## Usage notes
A webpage about SDG 5 (Gender Equality) and the António Guterres quote "The central question of gender equality is a question of power."
The group's call to action is "Pass the mic. Nominate a woman. Change who decides."
The individual's call to action is "Use your voice to lift another."

The generative painting (p5.js) is the fixed background of the page.
It is different on every visit: one of three palettes (aqua/lilac,  rose/celadon, blue/blush) and a new random composition.
The strokes of the silk ribbon appear gradually, layer on top of each other, and the two halves of the ribbon weave over and under each other.
The painting starts only once it becomes visible (when the visitor scrolls past the landing stage).

- Use the "Weave a new silk" button (in the artwork section) to repaint only the artwork with a new seed and palette. Refreshing the page also gives a new painting.
- The page colours follow the palette of the painting.
- To lock a palette while testing, set `RB_FORCE_THEME` (0, 1 or 2) at the top of `sketch.js`.

## Installation instructions
Unzip the folder, start a web server in the `code` directory and open `index.html` in a browser.
No dependencies or plug-in installation are required: p5.js (v2.3.4) and p5.sound are included in `js/`.
An internet connection is only needed for the Google Fonts (Prata, Zhi Mang Xing); without it the page falls back to system fonts.
The page must be served from a web server (not opened as a `file://` address) so that the images and scripts load correctly.

## Files
- `index.html` – page structure and all text content (loading screen, landing stage, artwork, SDG, quote, call to action, artwork concept, credits)
- `css/style.css` – page styling
- `sketch.js` – the generative painting (p5.js). Lines marked `WEBPAGE` are the changes made to embed it in the page. The top of the file contains the acknowledgement of AI use
- `js/landing.js` – loading screen and the landing parallax
- `js/parallax.js` – scroll parallax for the ink-wash images (mountain, path, cloud, silk)
- `js/site.js` – current date, scroll reveal and the "Weave a new silk" button
- `js/p5.js`, `js/addons/p5.sound.min.js` – libraries (no sound plays in this version)
- `assets/` – self-made images
- `LICENSE` – GPL 3.0 license text

The three sound files (.wav) are delivered separately in the `designed-sounds` folder.

## Documentation
See the design document in `design-documents`.

## License information
Released under the GPL 3.0 license. See the `LICENSE` file for details.

## Credits
Created by Nguyen Hoang Tue Minh (s4183536) for COMM2754, RMIT University Vietnam, School of Communication and Design, Digital Media Program.
Group members: Nguyen Tuong Lam, Phan Le Phuong Uyen, Nguyen Huynh Hanh Nhi, Phan Minh Nghia.
p5.js is by the Processing Foundation (LGPL 2.1). Claude (Anthropic 2026) helped write and revise the JavaScript; see the acknowledgement at the top of `sketch.js`.
Contact: s4183536@rmit.edu.vn