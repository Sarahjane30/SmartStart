import os
import tempfile

os.environ.setdefault(
    "SMARTSTART_PROFILE_PATH", os.path.join(tempfile.mkdtemp(prefix="smartstart-test-"), "ira_profiles.json")
)
# Tests never poll a locally running mock iCIMS; ingest is exercised directly.
os.environ["SMARTSTART_ICIMS_SYNC"] = "0"
