from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import re
from database import Database
from file_based_hints import FileBasedHints
from typing import Dict
from google_classroom import GoogleClassroomClient, get_creds
from git import GitHub
from models import GenerateHintsRequest, AddApiKeyRequest, AddGithubRequest, DeleteGithubRequest, StartingUpRequest, GitPushRequest, JoinCourseRequest
import base64

app = FastAPI()

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify your frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

hinter = FileBasedHints()


def extract_links(text):
    links = re.findall(r'https?://[^\s]+', text)
    return "\n".join(links)


@app.post("/submit/github")
async def github_submit(req: GitPushRequest):
    try:
        db = Database()
        github_info = db.get_github(req.username)
        github_name = github_info['github_name']
        github_token = github_info['github_token']

        github=GitHub(github_name, github_token)
        success, error = github.create_repo(req.repo_name)
        if not success:
            print("Error in creating repo:", error)
            return {"error": error}

        for filename, code in req.code_files.items():
            ok, result = github.push_file(req.repo_name, filename, code, "Initial commit")
            if not ok:
                return {"error": f"Failed to push {filename}: {result}"}
        
        github_link =f"https://github.com/{github_name}/{req.repo_name}"
        gcr_client = GoogleClassroomClient(info=req.info)
        print("Uploading to drive")
        drive_link, file_id = gcr_client.upload_to_drive(req.code_files, req.repo_name)
        print("Uploaded to drive:", drive_link, file_id)
        if drive_link is None:
            return {"success": False, "error": file_id}
        data = gcr_client.submit_to_classroom(req.course_id, req.assignment_id, file_id)
        if data["success"] == False:
            github.delete_repo(req.repo_name)
        return data
    except Exception as e:
        github.delete_repo(req.repo_name)
        return {"error": str(e)}

@app.post("/add_api_key")
async def add_api_key(request: AddApiKeyRequest):
    db = Database()
    db.set_api(request.username, request.api_key)
    return {"message": "API key added successfully"}

@app.post("/join_course")
async def join_course(request: JoinCourseRequest):
    course_id = request.course_id
    print("course_id", course_id)
    print("enrollment_code", request.enrollment_code)
    # If course_id is not all digits, convert to base64
    if not course_id.isdigit():
        course_id = base64.b64decode(course_id).decode("utf-8")
    gcr = GoogleClassroomClient(info=request.info)
    print("course_id changed", course_id)
    return gcr.join_course_as_student(course_id, request.enrollment_code)

@app.post("/add_github")
async def add_github(request: AddGithubRequest):
    db = Database()
    db.set_github(request.username, request.github_name, request.github_token)
    return {"message": "Github added successfully"}

@app.post("/delete_github")
async def delete_github(request: DeleteGithubRequest):
    if not request.username:
        return {"error": "Username is required"}
    db = Database()
    db.delete_github(request.username)
    return {"message": "GitHub credentials deleted successfully"}

@app.post("/get_gcr_data")
async def get_gcr_data(request: StartingUpRequest):
    # print(request.info)
    gcr = GoogleClassroomClient(info=request.info)
    gcr_result = gcr.get_gcr_data()
    
    if isinstance(gcr_result, dict) and "error" in gcr_result:
        print(gcr_result["error"])
        return {"error": gcr_result["error"]}
    
    return {"gcr_data": gcr_result}


@app.post("/logout")
async def logout(request: StartingUpRequest):
    gcr = GoogleClassroomClient(info=request.info)
    gcr.logout()
    return {"message": "Logged out successfully"}


@app.post("/get_user_name")
async def get_user_name(request: StartingUpRequest):
    gcr = GoogleClassroomClient(info=request.info)
    return {"user_name": gcr.get_user_name()}

@app.post("/get_credentials")
async def get_credentials():
    return get_creds()

def transform_concepts_to_array(hint: dict) -> dict:
    """
    Transforms a hint dict with concepts as a dict of topic: description
    into a hint dict with concepts as a list of topic names.
    """
    if "concepts" in hint and isinstance(hint["concepts"], dict):
        hint["concepts"] = list(hint["concepts"].keys())
    return hint

@app.post("/generate_hints")
async def generate_hints(request: GenerateHintsRequest):
    print("---------------------------------------")
    print("request", request)
    code_dict = request.code_dict
    question_data = request.question_data
    db = Database()
    api_key = db.get_api(request.username)
    result = hinter.get_general_hints(code_dict, question_data, api_key, request.topic)
    
    if result.get("error"):
        return {"error": result["error"]}
    
    result1 = transform_concepts_to_array(result)
    result1['hint'] = transform_concepts_to_array(result1['hint'])
    # print("---------------------------------------")
    # print("result1", result1)
    return result1