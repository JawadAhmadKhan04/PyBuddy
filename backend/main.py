from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from file_based_hints import FileBasedHints

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

class PreprocessingRequest(BaseModel):
    file_path: str
    folder_name: str
    file_creation_method: str

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
        # Determine the absolute folder path (parent of cwd + folder_name)
        cwd = os.getcwd()
        parent_dir = os.path.dirname(cwd)
        folder_path = os.path.join(parent_dir, request.folder_name)
        folder_path = os.path.abspath(folder_path)
        # print(hinter.get_general_hints(request.folder_name, 1))
        print(f"Folder path: {folder_path} which is to be opened in the frontend")
        return {"message": "Preprocessing completed successfully", "folder_path": folder_path}
    except Exception as e:
        print(f"Error in preprocessing: {str(e)}")
        return {"error": f"Preprocessing failed: {str(e)}"}
    
@app.post("/get_general_hints/{folder_name}/{question_no}")
async def get_general_hints(present_code: str,folder_name: str, question_no: int):
    return hinter.get_general_hints(present_code, folder_name, question_no)
    

