from pydantic import BaseModel
import os
from database import Database
from dotenv import load_dotenv
from google import genai
from google.genai import types
import pathlib
import httpx

load_dotenv()

class FileBasedHints:
    """
    A class to handle file-based hint generation using a language model.
    """
    class Question_Response(BaseModel):
        questions: list[str]
    
    def __init__(self):
        self.db = Database()
        self.model = "gemini-2.5-flash"
        self.llm = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))


        
    def execute_preprocessing(self, file_path: str, folder_name: str = "default") -> dict[int, str]:
        """
        Executes the workflow for the file.
        """
        print("Executing workflow...")
        try:
            # all_text = self.extract_text_pymupdf(file_path)
            questions_dict = self.create_questions(file_path)
            print(questions_dict)
            # self.save_questions(questions_dict, folder_name)
            return {"message": "Preprocessing completed successfully"}
        except Exception as e:
            print(e)
            return {"error": "Error in preprocessing file"}
        
    def create_questions(self, file_path: str) -> dict[int, str]:
        """
        Creates questions for the file using the language model.
        """
        file_data_encoded = pathlib.Path(file_path)        
        prompt = "Separate questions from the pdf."
        response = self.llm.models.generate_content(
        model=self.model,
        contents=[
            types.Part.from_bytes(
                data=file_data_encoded.read_bytes(),
                mime_type='application/pdf',
            ),
            prompt],
            config={
        "response_mime_type": "application/json",
        "response_schema": list[self.Question_Response],
    },)
        print(response.text)
        return 
    
    def save_questions(self, questions_dict: dict[int, str], folder_name: str) -> None:
        """
        Saves the questions to a file.
        """
        self.db.save_doc(folder_name, questions_dict)
        

