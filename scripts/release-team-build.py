"""Publish the team branch's tested GitHub artifact using the owner's Firebase CLI."""
import argparse
import base64
import hashlib
import json
import re
import shutil
import stat
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
import zipfile
from pathlib import Path, PurePosixPath


REPO = "seungju5/BOB"
BRANCH = "codex/warming-up-firebase"
PROJECT = "warming-up-bapmunna"
ORIGIN = "https://" + PROJECT + ".web.app"
WORKFLOW = ".github/workflows/firebase-hosting.yml"
ROUTES = {"": "index.html", "login/": "login/index.html", "privacy/": "privacy/index.html", "connect/": "connect/index.html", "account/": "account/index.html"}


def api(endpoint):
    data = subprocess.check_output(["gh", "api", "repos/" + REPO + "/" + endpoint])
    return json.loads(data)


def ensure(ok, message):
    if not ok:
        raise ValueError(message)


def latest_sha():
    ref = api("git/ref/heads/" + BRANCH)
    sha = ref["object"]["sha"]
    ensure(ref["ref"] == "refs/heads/" + BRANCH and re.fullmatch(r"[0-9a-f]{40}", sha), "Unexpected team branch.")
    return sha


def tested_artifact(sha):
    runs = api("actions/runs?event=push&head_sha=" + sha + "&per_page=100")["workflow_runs"]
    run = next((r for r in runs if r["path"] == WORKFLOW and r["head_branch"] == BRANCH and
                r["head_sha"] == sha and r["head_repository"]["id"] == 1421511921), None)
    ensure(run is not None, "No workflow run exists for the latest team commit yet.")
    run_path = "actions/runs/" + str(run["id"])
    jobs = api(run_path + "/attempts/" + str(run["run_attempt"]) + "/jobs?per_page=100")["jobs"]
    ensure(any(j["name"] == "build" and j["conclusion"] == "success" for j in jobs), "The build must pass before release.")
    expected = "warming-up-" + sha + "-" + str(run["run_attempt"])
    items = [a for a in api(run_path + "/artifacts?per_page=100")["artifacts"] if a["name"] == expected and not a["expired"]]
    ensure(len(items) == 1, "The verified artifact has expired or is unavailable. Re-run the team workflow.")
    return run["id"], items[0]


def unpack(artifact, target):
    ensure(0 < artifact["size_in_bytes"] <= 100_000_000 and re.fullmatch(r"sha256:[0-9a-f]{64}", artifact["digest"]),
           "Invalid build size or digest.")
    archive = target.parent / "github.zip"
    with archive.open("wb") as output:
        subprocess.run(["gh", "api", "repos/" + REPO + "/actions/artifacts/" + str(artifact["id"]) + "/zip"], stdout=output, check=True)
    ensure("sha256:" + hashlib.sha256(archive.read_bytes()).hexdigest() == artifact["digest"], "The GitHub archive digest differs.")
    with zipfile.ZipFile(archive) as bundle:
        ensure(sum(f.file_size for f in bundle.infolist()) <= 250_000_000, "The expanded build is unexpectedly large.")
        seen = set()
        for entry in bundle.infolist():
            path = PurePosixPath(entry.filename)
            ensure(not path.is_absolute() and ".." not in path.parts and "\\" not in entry.filename and path not in seen,
                   "Invalid or duplicate archive path.")
            ensure(stat.S_IFMT(entry.external_attr >> 16) in (0, stat.S_IFREG, stat.S_IFDIR), "Unusual archive entry.")
            seen.add(path)
            if entry.is_dir():
                continue
            file = target.joinpath(*path.parts)
            file.parent.mkdir(parents=True, exist_ok=True)
            with bundle.open(entry) as source, file.open("xb") as output:
                shutil.copyfileobj(source, output)
    for file in ROUTES.values():
        ensure((target / file).is_file(), "Required page missing: " + file)


def hosting_config(sha):
    source = api("contents/firebase.json?ref=" + sha)
    config = json.loads(base64.b64decode(source["content"]))["hosting"]
    ensure(set(config) == {"site", "public", "ignore", "rewrites", "headers"} and
           config["site"] == PROJECT and config["public"] == "out", "Unexpected Hosting configuration.")
    readiness = {"regex": "^/api/smartthings/config/?$", "destination": "/service-status/smartthings.json"}
    gateway = {"source": "/api/smartthings/**", "run": {"serviceId": "warming-up-smartthings", "region": "asia-northeast3"}}
    ensure(config["rewrites"] in ([readiness], [gateway]), "Unexpected SmartThings destination.")
    return {"hosting": config}


def verify_live(export, sha, hosting):
    routes = dict(ROUTES)
    if "destination" in hosting["rewrites"][0]:
        routes["api/smartthings/config"] = "service-status/smartthings.json"
    for route, file in routes.items():
        expected = (export / file).read_bytes()
        for attempt in range(5):
            req = urllib.request.Request(ORIGIN + "/" + route + "?release=" + sha, headers={"Cache-Control": "no-cache"})
            try:
                with urllib.request.urlopen(req, timeout=20) as response:
                    actual_url = response.geturl().split("?")[0]
                    if route == "api/smartthings/config":
                        ensure(response.headers.get_content_type() == "application/json" and
                               "no-store" in response.headers.get("Cache-Control", ""), "Unexpected API readiness response.")
                    if actual_url == ORIGIN + "/" + route and response.read() == expected:
                        break
            except urllib.error.HTTPError as error:
                if error.code != 404 or attempt == 4:
                    raise
            if attempt == 4:
                raise ValueError("Live page differs from the verified artifact: /" + route)
            time.sleep(2)


def main():
    options = argparse.ArgumentParser(description=__doc__)
    options.add_argument("--check-live", action="store_true", help="compare GitHub and the public site without publishing")
    args = options.parse_args()
    sha = latest_sha()
    run, artifact = tested_artifact(sha)
    with tempfile.TemporaryDirectory(prefix="warming-up-release-") as directory:
        base = Path(directory)
        export = base / "out"
        unpack(artifact, export)
        current_config = hosting_config(sha)
        if not args.check_live:
            config = base / "firebase.json"
            config.write_text(json.dumps(current_config), encoding="utf-8")
            ensure(latest_sha() == sha, "A newer team commit arrived. Run the command again.")
            subprocess.run(["firebase", "deploy", "--non-interactive", "--only", "hosting", "--project", PROJECT,
                            "--config", str(config), "-m", REPO + "@" + sha + " (verified build " + str(run) + ")"],
                           cwd=base, check=True)
        verify_live(export, sha, current_config["hosting"])
    print("Verified " + ORIGIN + " against GitHub run " + str(run) + " at " + sha + ".")


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, KeyError, subprocess.CalledProcessError, zipfile.BadZipFile) as error:
        sys.exit(str(error))
