import subprocess
import os
import shutil

def run(cmd):
    print(f"Running: {cmd}")
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    print(f"STDOUT: {result.stdout}")
    print(f"STDERR: {result.stderr}")
    return result

log_file = "fix_git.log"
with open(log_file, "w") as f:
    import sys
    sys.stdout = f
    sys.stderr = f

    # 1. Force remove from git index
    run("git rm -r --cached .agents/skills/notebooklm")

    # 2. Physcially remove .git folder if it exists
    git_dir = os.path.join(".agents", "skills", "notebooklm", ".git")
    if os.path.exists(git_dir):
        print(f"Found .git at {git_dir}, removing...")
        shutil.rmtree(git_dir)
    else:
        print(f"No .git folder found at {git_dir}")

    # 3. Add the folder back
    run("git add .agents/skills/notebooklm")

    # 4. Check status
    run("git status .agents/skills/notebooklm")
