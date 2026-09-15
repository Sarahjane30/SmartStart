# SmartStart

Research stack for **neonatal hypoxic-ischemic encephalopathy (HIE)** multimodal modeling.

This repository is bootstrapped at **Layer 1: Synthetic Data Engine** — a reproducible generator of fully synthetic clinical + EEG + MRI feature cohorts for offline research and pipeline development.

> All Layer 1 outputs are synthetic. They are **not** clinical data, **not** diagnostic, and must not be used for patient care.

## Architecture

| Layer | Status | Role |
|------:|:------:|------|
| **1** | **Implemented** | Synthetic data engine (clinical · EEG · MRI biomarkers · labels) |
| 2 | Planned | Feature store / dataset registry |
| 3 | Planned | Model training & evaluation |
| 4 | Planned | Research inference prototypes |

See [docs/architecture.md](docs/architecture.md) for the layer contract.

## Quick start

```bash
python -m pip install -e ".[dev]"
smartstart layer1 info
smartstart layer1 generate -n 32 -s 42 -o artifacts/layer1
pytest
```

### Python API

```python
from smartstart.layer1 import GenerationConfig, SyntheticDataEngine

engine = SyntheticDataEngine(GenerationConfig(n_subjects=32, seed=42))
bundle = engine.generate()
paths = engine.generate_and_export("artifacts/layer1")
```

### Exports

| File | Contents |
|------|----------|
| `cohort.json` | Full cohort with EEG samples |
| `cohort.jsonl` | One subject per line |
| `manifest.json` | Tabular summary without raw EEG |
| `arrays.npz` | `eeg`, `mri`, labels, ids for ML loaders |

## Safety / research use

- Every record is flagged `synthetic: true`.
- Subject IDs use the `SYN-` prefix.
- Latent risk couples modalities for supervised experiments; it is simulated, not measured.
