from fastapi import FastAPI
from pydantic import BaseModel
import requests
import base64

app = FastAPI()

# === Request Model ===
class GitPushRequest(BaseModel):
    github_username: str
    github_token: str
    repo_name: str
    code_files: dict  # {"filename.py": "code"}

# === GitHub Utility Class ===
class GitHub:
    def __init__(self, username: str, token: str):
        self.username = username
        self.token = token
        self.headers = {
            "Authorization": f"token {token}",
            "Accept": "application/vnd.github+json"
        }

    def repo_exists(self, repo_name):
        url = f"https://api.github.com/repos/{self.username}/{repo_name}"
        response = requests.get(url, headers=self.headers)
        return response.status_code == 200

    def delete_repo(self, repo_name):
        url = f"https://api.github.com/repos/{self.username}/{repo_name}"
        response = requests.delete(url, headers=self.headers)
        return response.status_code == 204

    def create_repo(self, repo_name):
        if self.repo_exists(repo_name):
            if not self.delete_repo(repo_name):
                return False, "Failed to delete existing repository."

        url = "https://api.github.com/user/repos"
        data = {"name": repo_name, "private": False}
        response = requests.post(url, headers=self.headers, json=data)

        if response.status_code != 201:
            return False, f"GitHub API Error: {response.status_code} - {response.text}"
        return True, None

    def push_file(self, repo_name, file_path, content, commit_message="Add file"):
        url = f"https://api.github.com/repos/{self.username}/{repo_name}/contents/{file_path}"
        encoded_content = base64.b64encode(content.encode('utf-8')).decode('utf-8')
        
        # Check if file already exists (for SHA)
        get_resp = requests.get(url, headers=self.headers)
        sha = get_resp.json().get('sha') if get_resp.status_code == 200 else None

        data = {
            "message": commit_message,
            "content": encoded_content
        }
        if sha:
            data["sha"] = sha

        put_resp = requests.put(url, headers=self.headers, json=data)
        return put_resp.status_code in [200, 201], put_resp.json()
