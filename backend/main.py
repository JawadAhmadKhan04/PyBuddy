from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import re
from database import Database
from file_based_hints import FileBasedHints
from typing import Dict
from google_classroom import GoogleClassroomClient
from git import GitHub
from models import GenerateHintsRequest, AddApiKeyRequest, AddGithubRequest, DeleteGithubRequest, StartingUpRequest, GitPushRequest

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
        return gcr_client.submit_to_classroom(req.course_id, req.assignment_id, file_id)
        
    except Exception as e:
        return {"error": str(e)}

@app.post("/add_api_key")
async def add_api_key(request: AddApiKeyRequest):
    db = Database()
    db.set_api(request.username, request.api_key)
    return {"message": "API key added successfully"}

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

@app.post("/generate_hints")
async def generate_hints(request: GenerateHintsRequest):
    code_dict = request.code_dict
    question_data = request.question_data
    db = Database()
    api_key = db.get_api(request.username)
    result = hinter.get_general_hints(code_dict, question_data, api_key)
    
    if result.get("error"):
        return {"error": result["error"]}
    return result

    # import os
    # file_path = request.file_path
    # folder_path = os.path.dirname(file_path)
    # question_folder = os.path.basename(folder_path)
    # parent_of_question_folder = os.path.basename(os.path.dirname(folder_path))
    # # Extract question number from question_X
    # question_number = None
    # if question_folder.startswith('question_'):
    #     try:
    #         question_number = question_folder.split('_')[1]
    #         return hinter.get_general_hints(get_entire_code(folder_path), parent_of_question_folder, int(question_number))

    #     except IndexError:
    #         question_number = None
    # if question_number is None:
    #     file_name = os.path.basename(file_path)
    #     if file_name.startswith('question_') and file_name.endswith('.py'):
    #         try:
    #             # print("IIINNNN")
    #             question_number = file_name.split('_')[1].split('.')[0]
    #             return hinter.get_general_hints(get_entire_code(folder_path), parent_of_question_folder, int(question_number))
    #         except IndexError:
    #             question_number = None
    
    # print(f"File path: {file_path}, Folder name: {parent_of_question_folder}, Question number: {question_number}")
    # return {"folder_name": parent_of_question_folder, "question_number": question_number}
    
# def preprocess_file(file_path: str):
#     import os
#     file_path = file_path
#     folder_path = os.path.dirname(file_path)
#     question_folder = os.path.basename(folder_path)
#     parent_of_question_folder = os.path.basename(os.path.dirname(folder_path))
#     # Extract question number from question_X
#     question_number = None
#     if question_folder.startswith('question_'):
#         try:
#             question_number = question_folder.split('_')[1]

#         except IndexError:
#             question_number = None
#     if question_number is None:
#         file_name = os.path.basename(file_path)
#         if file_name.startswith('question_') and file_name.endswith('.py'):
#             try:
#                 # print("IIINNNN")
#                 question_number = file_name.split('_')[1].split('.')[0]
#             except IndexError:
#                 question_number = None
#     return folder_path, question_number, parent_of_question_folder

# def get_entire_code(folder_path: str) -> dict[str, str]:
#     import os
#     code_dict = {}
#     for file_name in os.listdir(folder_path):
#         file_path = os.path.join(folder_path, file_name)
#         if os.path.isfile(file_path):
#             with open(file_path, 'r', encoding='utf-8') as f:
#                 code_dict[file_name] = f.read()
#     print("code_dict:", code_dict)
#     return code_dict



# @app.post("/chat")
# async def chat(request: ChatRequest):
#     try:
#         # For now, return a simple response
#         # In the future, this could integrate with the hint system
#         response = f"I received your message: '{request.message}'. This is a placeholder response. The chat functionality is being developed."
#         return {"response": response}
#     except Exception as e:
#         print(f"Error in chat: {str(e)}")
#         return {"error": f"Chat failed: {str(e)}"}


# @app.post("/login")
# async def login(request: StartingUpRequest):
#     gcr = GoogleClassroomClient(info=request.info)
#     gcr.login()
#     return {"message": "Logged in successfully"}


    
# @app.post("/preprocessing_file")
# async def get_root(request: PreprocessingRequest):
#     try:
#         print(f"Received: {request.file_path}, {request.folder_name}, {request.file_creation_method}")
#         auto_file_creation = request.file_creation_method == "Create files on auto"
#         # Check if file exists
#         print("Backend Received...")

#         import os
#         if not os.path.exists(request.file_path):
#             return {"error": f"File not found: {request.file_path}"}
        
#         result = hinter.execute_preprocessing(request.file_path, request.folder_name, auto_file_creation)
#         print("result:", result)
#         # Determine the absolute folder path (parent of cwd + folder_name)
#         cwd = os.getcwd()
#         parent_dir = os.path.dirname(cwd)
#         folder_path = os.path.join(parent_dir, request.folder_name)
#         folder_path = os.path.abspath(folder_path)
#         # print(hinter.get_general_hints(request.folder_name, 1))
#         print(f"Folder path: {folder_path} which is to be opened in the frontend")
#         if result.get("error"):
#             return {"error": "API Key is Invalid. Either enter a valid API key or check if the API key is not expired."}
#         return {"message": "Preprocessing completed successfully", "folder_path": folder_path}
#     except Exception as e:
#         print(f"Error in preprocessing: {str(e)}")
#         return {"error": f"Preprocessing failed: {str(e)}"}


# @app.post("/get_question")
# async def get_question(request: QuestionRequest):
#     _, question_number, parent_of_question_folder = preprocess_file(request.file_path)
#     question_text, instructions = hinter.get_question_text(parent_of_question_folder, int(question_number))
#     return {"question_text": question_text, "instructions": instructions, "links": extract_links(question_text)}


# @app.post("/starting_up")
# async def starting_up(request: StartingUpRequest):
#     # global hinter
#     # global gcr
#     # hinter = FileBasedHints()
#     gcr = GoogleClassroomClient(info=request.info)
#     return {"message": "Starting up..."}

# @app.post("/submit/gcr")
# async def gcr_submit(request: GcrSubmitRequest):
#     gcr = GoogleClassroomClient(info=request.info)
#     gcr.submit_to_classroom(request.course_id, request.assignment_id, request.file_id)
#     return {"message": "Submitted to Google Classroom successfully"}
