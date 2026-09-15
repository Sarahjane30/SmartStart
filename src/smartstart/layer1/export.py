"""Export helpers for Layer 1 cohort bundles."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import numpy as np

from smartstart.layer1.schemas import CohortBundle


def export_json(bundle: CohortBundle, path: Path) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(bundle.model_dump_json(indent=2), encoding="utf-8")
    return path


def export_jsonl(bundle: CohortBundle, path: Path) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as fh:
        for subject in bundle.subjects:
            fh.write(subject.model_dump_json())
            fh.write("\n")
    return path


def export_manifest(bundle: CohortBundle, path: Path) -> Path:
    """Compact cohort summary without raw EEG samples."""
    path.parent.mkdir(parents=True, exist_ok=True)
    rows: list[dict[str, Any]] = []
    for s in bundle.subjects:
        rows.append(
            {
                "subject_id": s.subject_id,
                "synthetic": s.synthetic,
                "severity": s.severity.value,
                "outcome": s.outcome.value,
                "latent_risk": s.latent_risk,
                "gestational_age_weeks": s.clinical.gestational_age_weeks,
                "birth_weight_g": s.clinical.birth_weight_g,
                "apgar_5min": s.clinical.apgar_5min,
                "cord_ph": s.clinical.cord_ph,
                "therapeutic_hypothermia": s.clinical.therapeutic_hypothermia,
                "sex": s.clinical.sex,
                "eeg_bsr": s.eeg.burst_suppression_ratio,
                "eeg_spectral_edge_hz": s.eeg.spectral_edge_hz,
                "mri_injury_burden": s.mri.injury_burden_score,
                **{
                    f"mri_{name}": value
                    for name, value in zip(s.mri.feature_names, s.mri.values, strict=True)
                },
            }
        )
    payload = {
        "dataset_id": bundle.dataset_id,
        "synthetic": bundle.synthetic,
        "created_at": bundle.created_at.isoformat(),
        "seed": bundle.seed,
        "n_subjects": bundle.n_subjects,
        "subjects": rows,
    }
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    return path


def export_npz(bundle: CohortBundle, path: Path) -> Path:
    """Compact numeric arrays for ML loaders."""
    path.parent.mkdir(parents=True, exist_ok=True)
    if not bundle.subjects:
        raise ValueError("cannot export empty cohort")

    eeg = np.stack(
        [np.asarray(s.eeg.samples, dtype=np.float32) for s in bundle.subjects],
        axis=0,
    )
    mri = np.stack(
        [np.asarray(s.mri.values, dtype=np.float32) for s in bundle.subjects],
        axis=0,
    )
    risk = np.asarray([s.latent_risk for s in bundle.subjects], dtype=np.float32)
    severity = np.asarray([s.severity.value for s in bundle.subjects])
    outcome = np.asarray([s.outcome.value for s in bundle.subjects])
    subject_ids = np.asarray([s.subject_id for s in bundle.subjects])

    np.savez_compressed(
        path,
        eeg=eeg,
        mri=mri,
        latent_risk=risk,
        severity=severity,
        outcome=outcome,
        subject_ids=subject_ids,
        eeg_channels=np.asarray(bundle.subjects[0].eeg.channels),
        mri_feature_names=np.asarray(bundle.subjects[0].mri.feature_names),
        sample_rate_hz=np.asarray(bundle.subjects[0].eeg.sample_rate_hz),
        synthetic=np.asarray(True),
        dataset_id=np.asarray(bundle.dataset_id),
        seed=np.asarray(bundle.seed),
    )
    return path
