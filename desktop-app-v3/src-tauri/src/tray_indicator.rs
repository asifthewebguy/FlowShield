//! Renders the dynamic tray icon shown while a focus session is running.
//!
//! Composes three layers onto a transparent square canvas:
//!   1. A faint background ring (full circle) — shows the "track" the
//!      progress sweep moves around.
//!   2. The progress sweep itself, an arc from 12 o'clock (top) clockwise
//!      to `progress * 360°`. Painted in FlowShield's brand color.
//!   3. The FlowShield logo, scaled to fit inside the ring.
//!
//! Implemented with the `image` crate's pixel-level access (no need for
//! a full 2D path engine like skia at this size — the ring math is just
//! polar-coordinate filtering, which anti-aliases acceptably at 32px).

use image::{ImageFormat, Rgba, RgbaImage};
use std::sync::OnceLock;

/// Embedded FlowShield logo. Uses the same source PNG that bundles the
/// installer-side icons (PR #48).
const BASE_ICON_PNG: &[u8] = include_bytes!("../icons/icon.png");

/// Decoded base icon, cached forever after first render.
static BASE_ICON: OnceLock<RgbaImage> = OnceLock::new();

fn base_icon() -> &'static RgbaImage {
    BASE_ICON.get_or_init(|| {
        image::load_from_memory_with_format(BASE_ICON_PNG, ImageFormat::Png)
            .expect("base FlowShield icon failed to decode (was bundled wrong?)")
            .into_rgba8()
    })
}

/// Brand color: sky-500 (#0ea5e9). Matches the web app + the
/// `primary-500` Tailwind token used across the desktop UI.
const RING_COLOR: Rgba<u8> = Rgba([14, 165, 233, 255]);
/// Faint backdrop for the unfilled portion of the ring.
const TRACK_COLOR: Rgba<u8> = Rgba([100, 116, 139, 90]);

/// Render the tray icon for the given progress (0.0 = no fill, 1.0 = full
/// circle). `size` is the output square edge in pixels (32 is a good fit
/// for most Linux trays; macOS handles HiDPI itself).
///
/// Returns the raw `RgbaImage` — caller hands `(img.into_raw(), w, h)` to
/// `tauri::image::Image::new` (which expects raw RGBA, not PNG).
pub fn render_progress_icon(progress: f32, size: u32) -> RgbaImage {
    let progress = progress.clamp(0.0, 1.0);
    let mut canvas = RgbaImage::from_pixel(size, size, Rgba([0, 0, 0, 0]));

    let center = size as f32 / 2.0;
    let r_outer = (size as f32 / 2.0) - 0.5;
    let ring_thickness = (size as f32 * 0.12).max(2.0);
    let r_inner = r_outer - ring_thickness;
    let progress_rad = progress * std::f32::consts::TAU;

    // Layer 1+2: ring track + progress sweep.
    for y in 0..size {
        for x in 0..size {
            let dx = x as f32 + 0.5 - center;
            let dy = y as f32 + 0.5 - center;
            let dist = (dx * dx + dy * dy).sqrt();
            if dist >= r_inner && dist <= r_outer {
                // atan2 gives angle from +X axis (3 o'clock), positive CCW.
                // Remap so 12 o'clock = 0 and progress sweeps clockwise.
                let raw = (-dy).atan2(dx);
                let from_top =
                    (std::f32::consts::FRAC_PI_2 - raw).rem_euclid(std::f32::consts::TAU);
                let pixel = if from_top <= progress_rad {
                    RING_COLOR
                } else {
                    TRACK_COLOR
                };
                canvas.put_pixel(x, y, pixel);
            }
        }
    }

    // Layer 3: composite the FlowShield logo inside the ring.
    let inner_padding = (size as f32 * 0.08).round() as u32;
    let logo_size = size.saturating_sub(2 * (ring_thickness as u32 + inner_padding));
    if logo_size > 0 {
        let logo = image::imageops::resize(
            base_icon(),
            logo_size,
            logo_size,
            image::imageops::FilterType::Lanczos3,
        );
        let offset = ((size - logo_size) / 2) as i64;
        image::imageops::overlay(&mut canvas, &logo, offset, offset);
    }

    canvas
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn renders_correct_dimensions() {
        let img = render_progress_icon(0.0, 32);
        assert_eq!(img.width(), 32);
        assert_eq!(img.height(), 32);
    }

    #[test]
    fn full_progress_paints_more_ring_pixels_than_zero() {
        // Pixel-count sanity check: full ring should have strictly more
        // RING_COLOR pixels than no progress.
        let zero = render_progress_icon(0.0, 64);
        let full = render_progress_icon(1.0, 64);
        let count_ring = |img: &RgbaImage| -> u32 {
            img.pixels()
                .filter(|p| p[0] == RING_COLOR[0] && p[1] == RING_COLOR[1] && p[2] == RING_COLOR[2])
                .count() as u32
        };
        assert!(count_ring(&full) > count_ring(&zero));
    }

    #[test]
    fn clamps_out_of_range_progress() {
        // -0.5 and 2.0 should not panic.
        let _ = render_progress_icon(-0.5, 32);
        let _ = render_progress_icon(2.0, 32);
    }
}
