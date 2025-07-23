from pydantic import BaseModel
from typing import Dict

class GenerateHintsRequest(BaseModel):
    question_data: str
    code_dict: Dict[str, str]
    username: str

class AddApiKeyRequest(BaseModel):
    username: str
    api_key: str

class AddGithubRequest(BaseModel):
    username: str
    github_name: str
    github_token: str

class DeleteGithubRequest(BaseModel):
    username: str

class StartingUpRequest(BaseModel):
    info: str

class GitPushRequest(BaseModel):
    username: str
    repo_name: str
    course_id: str
    assignment_id: str
    code_files: Dict[str, str]
    info: str

class JoinCourseRequest(BaseModel):
    course_id: str = None
    enrollment_code: str = None
    info: str
