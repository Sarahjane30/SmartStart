"""Configuration for Layer 1 synthetic cohort generation."""

from __future__ import annotations

from pydantic import BaseModel, Field, field_validator


class GenerationConfig(BaseModel):
    """Controls size, sampling rates, and correlation strength of synthetic data."""

    n_subjects: int = Field(default=64, ge=1, le=100_000)
    seed: int = Field(default=42, ge=0)

    # EEG
    eeg_channels: tuple[str, ...] = (
        "Fp1",
        "Fp2",
        "C3",
        "C4",
        "O1",
        "O2",
        "T3",
        "T4",
    )
    eeg_sample_rate_hz: float = Field(default=256.0, gt=0)
    eeg_duration_sec: float = Field(default=10.0, gt=0)

    # MRI feature vector (synthetic scalar biomarkers, not voxels)
    mri_feature_names: tuple[str, ...] = (
        "thalamic_adc",
        "basal_ganglia_adc",
        "watershed_t2_score",
        "pl_ic_fraction_anisotropy",
        "cortical_volume_z",
        "ventricle_volume_z",
    )

    # Outcome / severity coupling
    severity_noise: float = Field(default=0.15, ge=0.0, le=1.0)
    missingness_rate: float = Field(
        default=0.05,
        ge=0.0,
        lt=1.0,
        description="Fraction of optional clinical fields set to None",
    )

    # Provenance
    dataset_id: str = Field(default="smartstart-layer1-synth-v1")
    synthetic_flag: bool = Field(default=True)

    @field_validator("eeg_channels", "mri_feature_names")
    @classmethod
    def _non_empty(cls, value: tuple[str, ...]) -> tuple[str, ...]:
        if not value:
            raise ValueError("must contain at least one name")
        return value

    @property
    def eeg_n_samples(self) -> int:
        return int(round(self.eeg_sample_rate_hz * self.eeg_duration_sec))
