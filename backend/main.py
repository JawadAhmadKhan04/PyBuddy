from fastapi import FastAPI
from file_based_hints import FileBasedHints
app = FastAPI()
hinter = FileBasedHints()

@app.post("/preprocessing_file")
async def get_root(file_path: str, folder_name: str):
    hinter.execute_preprocessing(file_path, folder_name)
    print(hinter.get_general_hints(folder_name, 1))
    return {"message": "Preprocessing completed successfully"}
    
@app.post("/get_general_hints/{question_no}")
async def get_general_hints(question_no: int):
    return hinter.get_general_hints(question_no)
    

