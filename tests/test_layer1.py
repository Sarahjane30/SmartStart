"""Tests for SmartStart Layer 1 synthetic data engine."""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pytest

from smartstart.layer1 import GenerationConfig, SyntheticDataEngine
from smartstart.layer1.schemas import HIESeverity, NeuroOutcome


def test_generate_cohort_shape_and_flags():
    engine = SyntheticDataEngine(GenerationConfig(n_subjects=12, seed=7, eeg_duration_sec=2.0))
    bundle = engine.generate()

    assert bundle.synthetic is True
    assert bundle.n_subjects == 12
    assert bundle.seed == 7
    assert all(s.synthetic for s in bundle.subjects)

    subject = bundle.subjects[0]
    assert subject.subject_id.startswith("SYN-0007-")
    assert len(subject.eeg.channels) == 8
    assert len(subject.eeg.samples) == 8
    assert len(subject.eeg.samples[0]) == engine.config.eeg_n_samples
    assert len(subject.mri.values) == len(subject.mri.feature_names)
    assert isinstance(subject.severity, HIESeverity)
    assert isinstance(subject.outcome, NeuroOutcome)


def test_reproducibility_same_seed():
    cfg = GenerationConfig(n_subjects=8, seed=123, eeg_duration_sec=1.0)
    a = SyntheticDataEngine(cfg).generate()
    b = SyntheticDataEngine(cfg).generate()

    assert a.model_dump()["subjects"] == b.model_dump()["subjects"]


def test_different_seeds_diverge():
    a = SyntheticDataEngine(GenerationConfig(n_subjects=5, seed=1, eeg_duration_sec=1.0)).generate()
    b = SyntheticDataEngine(GenerationConfig(n_subjects=5, seed=2, eeg_duration_sec=1.0)).generate()
    assert a.subjects[0].latent_risk != b.subjects[0].latent_risk or (
        a.subjects[0].eeg.samples[0][:10] != b.subjects[0].eeg.samples[0][:10]
    )


def test_export_artifacts(tmp_path: Path):
    engine = SyntheticDataEngine(GenerationConfig(n_subjects=6, seed=9, eeg_duration_sec=1.0))
    paths = engine.generate_and_export(tmp_path)

    assert paths["cohort_json"].exists()
    assert paths["cohort_jsonl"].exists()
    assert paths["manifest"].exists()
    assert paths["arrays"].exists()

    payload = json.loads(paths["cohort_json"].read_text(encoding="utf-8"))
    assert payload["synthetic"] is True
    assert len(payload["subjects"]) == 6

    lines = paths["cohort_jsonl"].read_text(encoding="utf-8").strip().splitlines()
    assert len(lines) == 6

    arrays = np.load(paths["arrays"], allow_pickle=True)
    assert arrays["eeg"].shape[0] == 6
    assert arrays["mri"].shape[0] == 6
    assert bool(arrays["synthetic"]) is True


def test_risk_correlates_with_mri_injury():
    bundle = SyntheticDataEngine(
        GenerationConfig(n_subjects=80, seed=3, eeg_duration_sec=1.0, severity_noise=0.1)
    ).generate()
    risks = np.array([s.latent_risk for s in bundle.subjects])
    injury = np.array([s.mri.injury_burden_score for s in bundle.subjects])
    corr = np.corrcoef(risks, injury)[0, 1]
    assert corr > 0.7


def test_config_rejects_empty_channels():
    with pytest.raises(Exception):
        GenerationConfig(eeg_channels=())
