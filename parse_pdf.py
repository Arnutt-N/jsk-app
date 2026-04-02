import sys
import subprocess
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parent
PDF_PATH = REPO_ROOT / ".claude" / "docs" / "The-Complete-Guide-to-Building-Skill-for-Claude.pdf"

def install_and_read():
    try:
        import pypdf
    except ImportError:
        print("Installing pypdf...")
        subprocess.check_call([sys.executable, "-m", "pip", "install", "pypdf", "--user", "--quiet"])
        import pypdf
    
    try:
        reader = pypdf.PdfReader(str(PDF_PATH))
        text = []
        for i, page in enumerate(reader.pages):
            text.append(f"--- Page {i+1} ---")
            text.append(page.extract_text())
        print("\n".join(text))
    except Exception as e:
        print(f"Error reading PDF: {e}")

if __name__ == "__main__":
    install_and_read()
