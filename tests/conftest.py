import os
import tempfile

os.environ.setdefault(
    "SMARTSTART_PROFILE_PATH", os.path.join(tempfile.mkdtemp(prefix="smartstart-test-"), "ira_profiles.json")
)
