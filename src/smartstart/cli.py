"""SmartStart CLI entrypoint."""

from __future__ import annotations

from pathlib import Path
from typing import Optional

import typer
from rich.console import Console
from rich.table import Table

from smartstart import __version__
from smartstart.layer1 import GenerationConfig, SyntheticDataEngine
from smartstart.layer1.export import (
    export_json,
    export_jsonl,
    export_manifest,
    export_npz,
)

app = typer.Typer(
    name="smartstart",
    help="SmartStart research toolkit. Layer 1: synthetic data engine.",
    no_args_is_help=True,
)
layer1_app = typer.Typer(help="Layer 1 — synthetic data engine commands")
app.add_typer(layer1_app, name="layer1")
console = Console()


@app.command("version")
def version() -> None:
    """Print package version."""
    console.print(f"smartstart {__version__}")


@layer1_app.command("generate")
def layer1_generate(
    n_subjects: int = typer.Option(64, "--n-subjects", "-n", help="Cohort size"),
    seed: int = typer.Option(42, "--seed", "-s", help="RNG seed"),
    output_dir: Path = typer.Option(
        Path("artifacts/layer1"),
        "--output-dir",
        "-o",
        help="Directory for exported cohort files",
    ),
    eeg_duration: float = typer.Option(10.0, "--eeg-duration", help="EEG duration (sec)"),
    sample_rate: float = typer.Option(256.0, "--sample-rate", help="EEG sample rate (Hz)"),
    dataset_id: str = typer.Option("smartstart-layer1-synth-v1", "--dataset-id"),
) -> None:
    """Generate a fully synthetic multimodal cohort and export artifacts."""
    config = GenerationConfig(
        n_subjects=n_subjects,
        seed=seed,
        eeg_duration_sec=eeg_duration,
        eeg_sample_rate_hz=sample_rate,
        dataset_id=dataset_id,
    )
    engine = SyntheticDataEngine(config)
    bundle = engine.generate()
    output_dir.mkdir(parents=True, exist_ok=True)
    paths = {
        "cohort_json": export_json(bundle, output_dir / "cohort.json"),
        "cohort_jsonl": export_jsonl(bundle, output_dir / "cohort.jsonl"),
        "manifest": export_manifest(bundle, output_dir / "manifest.json"),
        "arrays": export_npz(bundle, output_dir / "arrays.npz"),
    }

    table = Table(title="SmartStart Layer 1 — Synthetic Cohort")
    table.add_column("Field")
    table.add_column("Value")
    table.add_row("dataset_id", config.dataset_id)
    table.add_row("synthetic", "true")
    table.add_row("n_subjects", str(bundle.n_subjects))
    table.add_row("seed", str(seed))
    table.add_row(
        "severity mix",
        ", ".join(
            f"{label}={sum(1 for s in bundle.subjects if s.severity.value == label)}"
            for label in ("mild", "moderate", "severe")
        ),
    )
    table.add_row(
        "outcomes",
        ", ".join(
            f"{label}={sum(1 for s in bundle.subjects if s.outcome.value == label)}"
            for label in ("favorable", "unfavorable")
        ),
    )
    for name, path in paths.items():
        table.add_row(name, str(path))
    console.print(table)
    console.print(
        "[dim]All records are synthetic. Not for clinical use or diagnosis.[/dim]"
    )


@layer1_app.command("info")
def layer1_info() -> None:
    """Describe Layer 1 capabilities."""
    console.print(
        """
[bold]Layer 1 — Synthetic Data Engine[/bold]

Produces reproducible, fully synthetic multimodal cohorts for SmartStart:

  • clinical covariates (GA, birth weight, Apgar, cord pH, hypothermia)
  • multi-channel EEG time series with risk-linked burst-suppression
  • MRI-derived biomarker feature vectors
  • HIE severity + neurodevelopmental outcome labels

Exports: cohort.json, cohort.jsonl, manifest.json, arrays.npz

Downstream roadmap:
  Layer 2 — feature store / dataset registry
  Layer 3 — model training & evaluation
  Layer 4 — research inference prototypes
""".strip()
    )


def main(argv: Optional[list[str]] = None) -> None:
    app(args=argv)


if __name__ == "__main__":
    app()
