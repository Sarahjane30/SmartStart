import os
import tempfile

os.environ.setdefault(
    "SMARTSTART_PROFILE_PATH", os.path.join(tempfile.mkdtemp(prefix="smartstart-test-"), "ira_profiles.json")
)
os.environ["SMARTSTART_KB_STORE"] = os.path.join(tempfile.mkdtemp(prefix="smartstart-kb-"), "knowledge_sources.json")
# Answers in tests come from retrieval only, even if a model key is set on the machine.
os.environ["SMARTSTART_LLM"] = "off"
# Tests never poll a locally running mock iCIMS; ingest is exercised directly.
os.environ["SMARTSTART_ICIMS_SYNC"] = "0"
