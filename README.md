# Baseball Stitch Stencil Designer

A zero-dependency, browser-based studio for designing vertical baseball-stitch wall stencils — comparing **Straight vertical stitches** against **Curved baseball stitches**, previewing designs at true scale on a 2D wall mockup or calibrated room photo, and exporting **1:1 printable PDFs** and **cutting-machine SVGs**.

## Features

- **Two Focused Starter Presets**: *Straight vertical stitches* and *Curved baseball stitches* (opposing baseball-seam pairs or parallel waves).
- **Full Geometry Controls**: Horizontal stripe spacing, horizontal shift, curve amplitude & wave cycles, stitch length, thickness, vertical pitch, V-angle, center gap, thread bow, and tip style (`Tapered`, `Rounded`, `Square`).
- **Two Room Mockup Modes**:
  - **2D Wall Builder**: True-scale wall dimensions, trim, rulers, 1-ft grid, and draggable/resizable furniture obstacles (bed, window, door, dresser, shelf).
  - **Photo Overlay**: Upload a real wall photo and lock stitches to exact inches with a 2-point scale calibration tool (e.g., two painter's tape marks 48" apart) + realistic `Multiply` paint blend.
- **Shareable Design Links**: Click **🔗 Copy Link** to copy a URL (`#d=...`) with your exact design parameters so someone else can open it on their phone, tablet, or laptop.
- **Side-by-Side & Split-Wipe Comparison**: Save favorite snapshots and compare them side-by-side or with an interactive wipe slider.
- **1:1 Stencil Exports**:
  - **Printable PDF (US Letter)**: 1-Page Reusable Vertical Stencil Strip (with top/bottom alignment ghosts), Single Full-Height Vertical Stripe Tiled PDF (flip left-to-right for opposing curved stripes), or Full-Wall Tiled PDF — all with ink-saver cut outlines and a `2.00"` scale verification box.
  - **Cutting Machine SVG**: Closed filled vector cutouts in exact inches for `12"×24"`, `12"×12"`, `8.5"×11"`, single full-height stripe, or full wall.

> **Privacy Note:** Any bedroom photos you upload in *Photo Overlay* mode stay 100% local in your browser's IndexedDB and are never uploaded or included in shared links.

## Run Locally

```bash
python3 serve.py --open
```

Then open `http://127.0.0.1:8000` (and optionally `http://127.0.0.1:8000/tests/test-runner.html` to run the built-in unit tests).

## Deploy to GitHub Pages

1. Push this repository to GitHub (e.g., `baseball_stencil`):
   ```bash
   git add -A
   git commit -m "Prepare for GitHub Pages and add shareable design links"
   git branch -M main
   git remote add origin https://github.com/<your-username>/baseball_stencil.git
   git push -u origin main
   ```
2. On GitHub, go to **Settings → Pages**:
   - Under **Build and deployment → Source**, choose **GitHub Actions** (the included `.github/workflows/pages.yml` will deploy automatically on every push to `main` or `master`), **or** choose **Deploy from a branch** (`main` / `/ (root)`).
3. Your live app will be available at:
   `https://<your-username>.github.io/baseball_stencil/`
