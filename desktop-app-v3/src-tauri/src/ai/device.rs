//! Compute-device selection for on-device AI. CPU by default; CUDA when the
//! `cuda` feature is compiled in and a device initializes. Falls back to CPU
//! (with a warning) if CUDA init fails, so a GPU build still runs when the GPU
//! is busy or absent.

use candle_core::Device;

/// Pick the compute device for AI inference. On a `cuda` build, use CUDA
/// device 0 when `prefer_gpu` is true and it initializes, otherwise fall back
/// to CPU. On a non-`cuda` build, always CPU. Logs the chosen device.
pub fn select_device(prefer_gpu: bool) -> Device {
    #[cfg(feature = "cuda")]
    {
        if prefer_gpu {
            match Device::cuda_if_available(0) {
                Ok(dev) if dev.is_cuda() => {
                    tracing::info!("AI compute device: CUDA(0)");
                    return dev;
                }
                Ok(_) => tracing::warn!("CUDA feature built but no CUDA device; using CPU"),
                Err(e) => tracing::warn!(?e, "CUDA init failed; using CPU"),
            }
        } else {
            tracing::info!("AI compute device: CPU (user preference)");
        }
        return Device::Cpu;
    }
    #[cfg(not(feature = "cuda"))]
    {
        let _ = prefer_gpu; // CPU-only build ignores the preference
        tracing::info!("AI compute device: CPU");
        Device::Cpu
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[cfg(not(feature = "cuda"))]
    #[test]
    fn default_build_ignores_pref_and_selects_cpu() {
        // On the shipping CPU-only build, the preference is irrelevant — both
        // values must resolve to CPU.
        assert!(matches!(select_device(true), Device::Cpu));
        assert!(matches!(select_device(false), Device::Cpu));
    }
}
