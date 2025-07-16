import os
import subprocess
import shutil
import requests
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import Optional

app = FastAPI()

# === Models ===
class GitPushRequest(BaseModel):
    github_username: str
    github_token: str
    repo_name: str
    course_id: str
    assignment_id: str

# === GitHub Implementation ===
def delete_repo(repo_name: str, token: str, username: str) -> bool:
    url = f"https://api.github.com/repos/{username}/{repo_name}"
    headers = {"Authorization": f"token {token}"}
    response = requests.delete(url, headers=headers)
    return response.status_code == 204

def repo_exists(repo_name: str, token: str, username: str) -> bool:
    url = f"https://api.github.com/repos/{username}/{repo_name}"
    headers = {"Authorization": f"token {token}"}
    response = requests.get(url, headers=headers)
    return response.status_code == 200

def create_github_repo(repo_name: str, token: str, username: str) -> bool:
    if repo_exists(repo_name, token, username):
        print(f"⚠️ Repo '{repo_name}' already exists. Deleting...")
        if not delete_repo(repo_name, token, username):
            raise HTTPException(status_code=500, detail="Failed to delete existing repository")
    
    url = "https://api.github.com/user/repos"
    headers = {
        "Authorization": f"token {token}",
        "Accept": "application/vnd.github+json"
    }
    data = {"name": repo_name, "private": False}
    response = requests.post(url, headers=headers, json=data)
    return response.status_code == 201

def push_code_folder(folder_path: str, repo_name: str, username: str, token: str) -> None:
    try:
        os.chdir(folder_path)
        if os.path.exists(os.path.join(folder_path, ".git")):
            shutil.rmtree(os.path.join(folder_path, ".git"), ignore_errors=True)

        subprocess.run(["git", "init"], check=True)
        subprocess.run(["git", "add", "."], check=True)
        subprocess.run(["git", "commit", "-m", "Initial commit"], check=True)
        subprocess.run(["git", "branch", "-M", "main"], check=True)
        repo_url = f"https://{username}:{token}@github.com/{username}/{repo_name}.git"
        subprocess.run(["git", "remote", "add", "origin", repo_url], check=True)
        subprocess.run(["git", "push", "-u", "origin", "main"], check=True)
        os.chdir("..")
    except subprocess.CalledProcessError as e:
        raise HTTPException(status_code=500, detail=f"Git operation failed: {str(e)}")

def zip_code_folder(folder_path: str, zip_path: str) -> None:
    shutil.make_archive(zip_path.replace(".zip", ""), 'zip', folder_path)

# === Endpoints ===
@app.post("/submit/github")
async def github_submit(req: GitPushRequest):
    try:
        folder_path = os.path.join(os.path.dirname(__file__), "code")
        if not os.path.isdir(folder_path):
            raise HTTPException(status_code=400, detail="Code folder not found")

        # GitHub operations
        if not create_github_repo(req.repo_name, req.github_token, req.github_username):
            raise HTTPException(status_code=500, detail="Failed to create GitHub repository")
        
        push_code_folder(folder_path, req.repo_name, req.github_username, req.github_token)
        zip_code_folder(folder_path, "code_submission.zip")

        return {
            "status": "github_success",
            "repo_url": f"https://github.com/{req.github_username}/{req.repo_name}"
        }
    except HTTPException as e:
        raise e
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"GitHub submission failed: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)