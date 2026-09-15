"""Physically inspired synthetic generators for Layer 1."""

from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np

from smartstart.layer1.config import GenerationConfig
from smartstart.layer1.schemas import (
    ClinicalCovariates,
    EEGRecording,
    HIESeverity,
    MRIFeatures,
    NeuroOutcome,
)


@dataclass(frozen=True)
class LatentProfile:
    """Shared latent state that couples clinical, EEG, MRI, and outcome."""

    risk: float  # 0..1
    severity: HIESeverity
    outcome: NeuroOutcome


def sample_latent(rng: np.random.Generator, noise: float) -> LatentProfile:
    """Draw a latent HIE risk profile with noisy severity/outcome mapping."""
    risk = float(rng.beta(2.0, 3.5))
    if risk < 0.33:
        severity = HIESeverity.MILD
    elif risk < 0.66:
        severity = HIESeverity.MODERATE
    else:
        severity = HIESeverity.SEVERE

    # Outcome odds rise with risk; noise softens the decision boundary
    logit = (risk - 0.45) / max(noise, 1e-3) - 0.5
    p_unfav = 1.0 / (1.0 + math.exp(-logit))
    outcome = (
        NeuroOutcome.UNFAVORABLE
        if rng.random() < p_unfav
        else NeuroOutcome.FAVORABLE
    )
    return LatentProfile(risk=risk, severity=severity, outcome=outcome)


def generate_clinical(
    rng: np.random.Generator,
    latent: LatentProfile,
    missingness_rate: float,
) -> ClinicalCovariates:
    """Clinical covariates correlated with latent risk."""
    ga = float(rng.normal(38.5 - 1.8 * latent.risk, 1.2))
    ga = float(np.clip(ga, 32.0, 42.0))
    bw = float(rng.normal(3200 - 650 * latent.risk, 350))
    bw = float(np.clip(bw, 1200, 4500))
    apgar = int(np.clip(round(rng.normal(8.2 - 4.5 * latent.risk, 1.1)), 0, 10))
    hypothermia = latent.severity != HIESeverity.MILD or rng.random() < 0.15
    sex = str(rng.choice(["F", "M", "X"], p=[0.48, 0.48, 0.04]))

    cord_ph: float | None
    if rng.random() < missingness_rate:
        cord_ph = None
    else:
        cord_ph = float(np.clip(rng.normal(7.22 - 0.18 * latent.risk, 0.06), 6.8, 7.45))

    return ClinicalCovariates(
        gestational_age_weeks=round(ga, 1),
        birth_weight_g=round(bw, 1),
        apgar_5min=apgar,
        cord_ph=None if cord_ph is None else round(cord_ph, 3),
        therapeutic_hypothermia=bool(hypothermia),
        sex=sex,
    )


def generate_eeg(
    rng: np.random.Generator,
    latent: LatentProfile,
    config: GenerationConfig,
) -> EEGRecording:
    """Multi-channel EEG with risk-linked burst-suppression and spectral edge."""
    n_ch = len(config.eeg_channels)
    n_t = config.eeg_n_samples
    t = np.arange(n_t, dtype=np.float64) / config.eeg_sample_rate_hz

    # Higher risk → more burst-suppression, lower spectral edge
    bsr = float(np.clip(0.05 + 0.7 * latent.risk + rng.normal(0, 0.04), 0.0, 0.95))
    spectral_edge = float(np.clip(18.0 - 12.0 * latent.risk + rng.normal(0, 0.8), 3.0, 22.0))

    suppressed = rng.random(n_t) < bsr
    # Smooth suppression mask
    kernel = np.ones(max(3, int(0.05 * config.eeg_sample_rate_hz)))
    suppressed = np.convolve(suppressed.astype(float), kernel / kernel.sum(), mode="same") > 0.4

    channels: list[list[float]] = []
    for ch_idx in range(n_ch):
        # Background: mix of delta/theta/alpha-like tones + noise
        amp = 35.0 * (1.0 - 0.45 * latent.risk)
        signal = (
            amp
            * (
                0.55 * np.sin(2 * np.pi * (1.5 + 0.3 * ch_idx) * t + rng.uniform(0, 2 * np.pi))
                + 0.30 * np.sin(2 * np.pi * (4.0 + 0.2 * latent.risk) * t)
                + 0.15 * np.sin(2 * np.pi * spectral_edge * 0.35 * t)
            )
            + rng.normal(0.0, 4.0 + 6.0 * latent.risk, size=n_t)
        )
        # Occasional epileptiform-like spikes more common at higher risk
        spike_rate = 0.002 + 0.02 * latent.risk
        spike_idx = rng.random(n_t) < spike_rate
        signal[spike_idx] += rng.normal(80.0, 15.0, size=int(spike_idx.sum()))
        signal[suppressed] *= 0.08
        channels.append(np.round(signal, 4).tolist())

    return EEGRecording(
        channels=list(config.eeg_channels),
        sample_rate_hz=config.eeg_sample_rate_hz,
        duration_sec=config.eeg_duration_sec,
        samples=channels,
        burst_suppression_ratio=round(bsr, 4),
        spectral_edge_hz=round(spectral_edge, 3),
    )


def generate_mri(
    rng: np.random.Generator,
    latent: LatentProfile,
    config: GenerationConfig,
) -> MRIFeatures:
    """Synthetic MRI biomarker vector correlated with latent injury burden."""
    injury = float(np.clip(latent.risk + rng.normal(0, 0.08), 0.0, 1.0))
    # ADC-like features fall with injury; T2/volume scores rise
    means = {
        "thalamic_adc": 1.15 - 0.45 * injury,
        "basal_ganglia_adc": 1.10 - 0.40 * injury,
        "watershed_t2_score": 0.4 + 3.2 * injury,
        "pl_ic_fraction_anisotropy": 0.55 - 0.25 * injury,
        "cortical_volume_z": -0.2 - 1.6 * injury,
        "ventricle_volume_z": 0.1 + 1.4 * injury,
    }
    values: list[float] = []
    for name in config.mri_feature_names:
        base = means.get(name, injury)
        values.append(round(float(rng.normal(base, 0.08)), 4))

    return MRIFeatures(
        feature_names=list(config.mri_feature_names),
        values=values,
        injury_burden_score=round(injury, 4),
    )
