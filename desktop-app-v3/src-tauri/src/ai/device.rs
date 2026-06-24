//! Compute-device selection for on-device AI. CPU by default; CUDA when the
//! `cuda` feature is compiled in and a device initializes. Falls back to CPU
//! (with a warning) if CUDA init fails, so a GPU build still runs when the GPU
//! is busy or absent.

use candle_core::Device;

/// Pick the compute device for AI inference. On a `cuda` build, use CUDA
/// device 0 when it initializes, otherwise fall back to CPU. On a non-`cuda`
/// build, always CPU. Logs the chosen device.
pub fn select_device() -> Device {
    #[cfg(feature = "cuda")]
    {
        match Device::cuda_if_available(0) {
            Ok(dev) if dev.is_cuda() => {
                tracing::info!("AI compute device: CUDA(0)");
                return dev;
            }
            Ok(_) => tracing::warn!("CUDA feature built but no CUDA device; using CPU"),
            Err(e) => tracing::warn!(?e, "CUDA init failed; using CPU"),
        }
    }
    tracing::info!("AI compute device: CPU");
    Device::Cpu
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_build_selects_cpu() {
        // Default (non-cuda) feature set must resolve to CPU — the shipping
        // default that runs on any machine.
        #[cfg(not(feature = "cuda"))]
        assert!(matches!(select_device(), Device::Cpu));
    }
}
