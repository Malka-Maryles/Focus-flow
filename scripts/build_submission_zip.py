import os
import zipfile
import shutil

def build_submission():
    zip_filename = "assignment3.zip"

    # Ensure PROJECT_INFO.docx is generated
    if not os.path.exists("PROJECT_INFO.docx"):
        from create_project_docx import create_docx
        create_docx("PROJECT_INFO.docx")

    # Ensure a safe .env file exists for the submission
    # We copy .env.example ensuring no secrets are present
    env_content = open(".env.example", "r", encoding="utf-8").read()
    with open(".env", "w", encoding="utf-8") as f:
        f.write(env_content)

    # Build the zip archive with EXACTLY the 3 root-level files
    files_to_pack = [
        ("docker-compose.yml", "docker-compose.yml"),
        (".env", ".env"),
        ("PROJECT_INFO.docx", "PROJECT_INFO.docx")
    ]

    with zipfile.ZipFile(zip_filename, "w", zipfile.ZIP_DEFLATED) as zipf:
        for local_path, archive_name in files_to_pack:
            if not os.path.exists(local_path):
                raise FileNotFoundError(f"Missing required file: {local_path}")
            zipf.write(local_path, arcname=archive_name)
            print(f"Added to {zip_filename}: {archive_name} ({os.path.getsize(local_path)} bytes)")

    # Validate contents of assignment3.zip
    print("\n--- Validating assignment3.zip contents ---")
    with zipfile.ZipFile(zip_filename, "r") as zipf:
        names = zipf.namelist()
        print(f"Archive files: {names}")
        assert set(names) == {"docker-compose.yml", ".env", "PROJECT_INFO.docx"}, \
            f"Error: ZIP does not contain exactly the required 3 files! Found: {names}"
        assert len(names) == 3, f"Expected exactly 3 files, found {len(names)}"

    print(f"\n🎉 Validation PASSED: {zip_filename} was built successfully with exactly the 3 required files!")

if __name__ == "__main__":
    build_submission()
