import os
import subprocess
import shutil
import requests
from fastapi import HTTPException
from typing import Optional

class GitHub:
    def __init__(self, github_username: str, github_token: str):
        self.github_username = github_username
        self.github_token = github_token
    
    def delete_repo(self, repo_name: str) -> bool:
        url = f"https://api.github.com/repos/{self.github_username}/{repo_name}"
        headers = {"Authorization": f"token {self.github_token}"}
        response = requests.delete(url, headers=headers)
        return response.status_code == 204
    
    def repo_exists(self, repo_name: str) -> bool:
        url = f"https://api.github.com/repos/{self.github_username}/{repo_name}"
        headers = {"Authorization": f"token {self.github_token}"}
        response = requests.get(url, headers=headers)
        return response.status_code == 200

    def create_repo(self, repo_name: str) -> bool:
        if self.repo_exists(repo_name):
            if not self.delete_repo(repo_name):
                raise HTTPException(status_code=500, detail="Failed to delete existing repository")
        
        url = "https://api.github.com/user/repos"
        headers = {
            "Authorization": f"token {self.github_token}",
            "Accept": "application/vnd.github+json"
        }
        data = {"name": repo_name, "private": False}
        response = requests.post(url, headers=headers, json=data)
        return response.status_code == 201

    def push_code(self, folder_path: str, repo_name: str) -> None:
        try:
            os.chdir(folder_path)
            if os.path.exists(os.path.join(folder_path, ".git")):
                shutil.rmtree(os.path.join(folder_path, ".git"), ignore_errors=True)

            subprocess.run(["git", "init"], check=True)
            subprocess.run(["git", "add", "."], check=True)
            subprocess.run(["git", "commit", "-m", "Initial commit"], check=True)
            subprocess.run(["git", "branch", "-M", "main"], check=True)
            repo_url = f"https://{self.github_username}:{self.github_token}@github.com/{self.github_username}/{repo_name}.git"
            subprocess.run(["git", "remote", "add", "origin", repo_url], check=True)
            subprocess.run(["git", "push", "-u", "origin", "main"], check=True)
            os.chdir("..")
        except subprocess.CalledProcessError as e:
            raise HTTPException(status_code=500, detail=f"Git operation failed: {str(e)}")

    @staticmethod
    def zip_folder(folder_path: str, zip_path: str) -> None:
        shutil.make_archive(zip_path.replace(".zip", ""), 'zip', folder_path)