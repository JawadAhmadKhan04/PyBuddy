from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import re
from file_based_hints import FileBasedHints
from typing import Dict
from google_classroom import GoogleClassroomClient

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
gcr = GoogleClassroomClient()

class QuestionRequest(BaseModel):
    file_path:str

class PreprocessingRequest(BaseModel):
    file_path: str
    folder_name: str
    file_creation_method: str

class GenerateHintsRequest(BaseModel):
    file_path: str
    code_dict: Dict[str, str]

class AddApiKeyRequest(BaseModel):
    api_key: str

# class ChatRequest(BaseModel):
#     message: str



def extract_links(text):
    links = re.findall(r'https?://[^\s]+', text)
    return "\n".join(links)


@app.post("/preprocessing_file")
async def get_root(request: PreprocessingRequest):
    try:
        print(f"Received: {request.file_path}, {request.folder_name}, {request.file_creation_method}")
        auto_file_creation = request.file_creation_method == "Create files on auto"
        # Check if file exists
        print("Backend Received...")

        import os
        if not os.path.exists(request.file_path):
            return {"error": f"File not found: {request.file_path}"}
        
        result = hinter.execute_preprocessing(request.file_path, request.folder_name, auto_file_creation)
        print("result:", result)
        # Determine the absolute folder path (parent of cwd + folder_name)
        cwd = os.getcwd()
        parent_dir = os.path.dirname(cwd)
        folder_path = os.path.join(parent_dir, request.folder_name)
        folder_path = os.path.abspath(folder_path)
        # print(hinter.get_general_hints(request.folder_name, 1))
        print(f"Folder path: {folder_path} which is to be opened in the frontend")
        if result.get("error"):
            return {"error": "API Key is Invalid. Either enter a valid API key or check if the API key is not expired."}
        return {"message": "Preprocessing completed successfully", "folder_path": folder_path}
    except Exception as e:
        print(f"Error in preprocessing: {str(e)}")
        return {"error": f"Preprocessing failed: {str(e)}"}

@app.post("/add_api_key")
async def add_api_key(request: AddApiKeyRequest):
    api_key = request.api_key
    hinter.add_api_key(api_key)
    return {"message": "API key added successfully"}

@app.post("/get_question")
async def get_question(request: QuestionRequest):
    _, question_number, parent_of_question_folder = preprocess_file(request.file_path)
    question_text, instructions = hinter.get_question_text(parent_of_question_folder, int(question_number))
    return {"question_text": question_text, "instructions": instructions, "links": extract_links(question_text)}

@app.post("/generate_hints")
async def generate_hints(request: GenerateHintsRequest):
    folder_path, question_number, parent_of_question_folder = preprocess_file(request.file_path)
    # return hinter.get_general_hints(request.file_code, parent_of_question_folder, int(question_number))

    code_dict = request.code_dict
    # You may need to extract parent_of_question_folder and question_number from the code_dict or request if needed
    # For now, just pass code_dict to hinter.get_general_hints
    result = hinter.get_general_hints(code_dict, parent_of_question_folder, int(question_number))
    
    # Check if the result contains an error
    if result.get("error"):
        return {"error": result["error"]}
    
    return result

    import os
    file_path = request.file_path
    folder_path = os.path.dirname(file_path)
    question_folder = os.path.basename(folder_path)
    parent_of_question_folder = os.path.basename(os.path.dirname(folder_path))
    # Extract question number from question_X
    question_number = None
    if question_folder.startswith('question_'):
        try:
            question_number = question_folder.split('_')[1]
            return hinter.get_general_hints(get_entire_code(folder_path), parent_of_question_folder, int(question_number))

        except IndexError:
            question_number = None
    if question_number is None:
        file_name = os.path.basename(file_path)
        if file_name.startswith('question_') and file_name.endswith('.py'):
            try:
                # print("IIINNNN")
                question_number = file_name.split('_')[1].split('.')[0]
                return hinter.get_general_hints(get_entire_code(folder_path), parent_of_question_folder, int(question_number))
            except IndexError:
                question_number = None
    
    # print(f"File path: {file_path}, Folder name: {parent_of_question_folder}, Question number: {question_number}")
    # return {"folder_name": parent_of_question_folder, "question_number": question_number}
    
def preprocess_file(file_path: str):
    import os
    file_path = file_path
    folder_path = os.path.dirname(file_path)
    question_folder = os.path.basename(folder_path)
    parent_of_question_folder = os.path.basename(os.path.dirname(folder_path))
    # Extract question number from question_X
    question_number = None
    if question_folder.startswith('question_'):
        try:
            question_number = question_folder.split('_')[1]

        except IndexError:
            question_number = None
    if question_number is None:
        file_name = os.path.basename(file_path)
        if file_name.startswith('question_') and file_name.endswith('.py'):
            try:
                # print("IIINNNN")
                question_number = file_name.split('_')[1].split('.')[0]
            except IndexError:
                question_number = None
    return folder_path, question_number, parent_of_question_folder

def get_entire_code(folder_path: str) -> dict[str, str]:
    import os
    code_dict = {}
    for file_name in os.listdir(folder_path):
        file_path = os.path.join(folder_path, file_name)
        if os.path.isfile(file_path):
            with open(file_path, 'r', encoding='utf-8') as f:
                code_dict[file_name] = f.read()
    print("code_dict:", code_dict)
    return code_dict



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


@app.post("/login")
async def login():
    gcr.login()
    return {"message": "Logged in successfully"}

@app.post("/get_courses")
async def get_courses():
    courses = gcr.get_courses()
    if courses.get("error"):
        return {"error": courses["error"]}
    return {"courses": courses["courses"]}

@app.post("/logout")
async def logout():
    gcr.logout()
    return {"message": "Logged out successfully"}

    