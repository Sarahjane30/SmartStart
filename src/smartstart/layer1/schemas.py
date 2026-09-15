"""Pydantic schemas for Layer 1 synthetic records."""

from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


class HIESeverity(str, Enum):
    MILD = "mild"
    MODERATE = "moderate"
    SEVERE = "severe"


class NeuroOutcome(str, Enum):
    FAVORABLE = "favorable"
    UNFAVORABLE = "unfavorable"


class ClinicalCovariates(BaseModel):
    gestational_age_weeks: float
    birth_weight_g: float
    apgar_5min: int = Field(ge=0, le=10)
    cord_ph: float | None = None
    therapeutic_hypothermia: bool
    sex: str  # "F" | "M" | "X" (synthetic only)


class EEGRecording(BaseModel):
    channels: list[str]
    sample_rate_hz: float
    duration_sec: float
    # Channel-major samples; kept as nested lists for JSON portability
    samples: list[list[float]]
    burst_suppression_ratio: float
    spectral_edge_hz: float


class MRIFeatures(BaseModel):
    feature_names: list[str]
    values: list[float]
    injury_burden_score: float


class SubjectRecord(BaseModel):
    subject_id: str
    synthetic: bool = True
    severity: HIESeverity
    outcome: NeuroOutcome
    clinical: ClinicalCovariates
    eeg: EEGRecording
    mri: MRIFeatures
    latent_risk: float = Field(
        description="Ground-truth latent risk used to couple modalities (research only)"
    )
    metadata: dict[str, Any] = Field(default_factory=dict)


class CohortBundle(BaseModel):
    dataset_id: str
    synthetic: bool = True
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    generator: str = "smartstart.layer1.SyntheticDataEngine"
    generator_version: str = "0.1.0"
    seed: int
    config: dict[str, Any]
    subjects: list[SubjectRecord]

    @property
    def n_subjects(self) -> int:
        return len(self.subjects)
