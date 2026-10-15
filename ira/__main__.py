"""python -m ira — launch the IRA desktop companion."""

from pathlib import Path

import ira
from ira.app import main

if __name__ == "__main__":
    print(f"[IRA] desktop companion {ira.__version__} · code from {Path(ira.__file__).resolve().parent}")
    raise SystemExit(main())
