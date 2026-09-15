"""Layer 1 SyntheticDataEngine — orchestrates cohort generation."""

from __future__ import annotations

from pathlib import Path

import numpy as np

from smartstart.layer1.config import GenerationConfig
from smartstart.layer1.export import (
    export_json,
    export_jsonl,
    export_manifest,
    export_npz,
)
from smartstart.layer1.generators import (
    generate_clinical,
    generate_eeg,
    generate_mri,
    sample_latent,
)
from smartstart.layer1.schemas import CohortBundle, SubjectRecord


class SyntheticDataEngine:
    """Reproducible synthetic multimodal cohort generator (Layer 1)."""

    def __init__(self, config: GenerationConfig | None = None) -> None:
        self.config = config or GenerationConfig()

    def generate(self) -> CohortBundle:
        rng = np.random.default_rng(self.config.seed)
        subjects: list[SubjectRecord] = []

        for i in range(self.config.n_subjects):
            latent = sample_latent(rng, self.config.severity_noise)
            clinical = generate_clinical(rng, latent, self.config.missingness_rate)
            eeg = generate_eeg(rng, latent, self.config)
            mri = generate_mri(rng, latent, self.config)
            subjects.append(
                SubjectRecord(
                    subject_id=f"SYN-{self.config.seed:04d}-{i:05d}",
                    synthetic=True,
                    severity=latent.severity,
                    outcome=latent.outcome,
                    clinical=clinical,
                    eeg=eeg,
                    mri=mri,
                    latent_risk=round(latent.risk, 6),
                    metadata={
                        "dataset_id": self.config.dataset_id,
                        "layer": 1,
                        "modality": ["clinical", "eeg", "mri"],
                    },
                )
            )

        return CohortBundle(
            dataset_id=self.config.dataset_id,
            synthetic=True,
            seed=self.config.seed,
            config=self.config.model_dump(),
            subjects=subjects,
        )

    def generate_and_export(self, output_dir: Path | str) -> dict[str, Path]:
        """Generate a cohort and write JSON, JSONL, manifest, and NPZ artifacts."""
        out = Path(output_dir)
        out.mkdir(parents=True, exist_ok=True)
        bundle = self.generate()
        paths = {
            "cohort_json": export_json(bundle, out / "cohort.json"),
            "cohort_jsonl": export_jsonl(bundle, out / "cohort.jsonl"),
            "manifest": export_manifest(bundle, out / "manifest.json"),
            "arrays": export_npz(bundle, out / "arrays.npz"),
        }
        return paths
