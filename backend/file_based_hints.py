import os
from database import Database
from pydantic import BaseModel
import os
from database import Database
from dotenv import load_dotenv
from google import genai
from google.genai import types
import pathlib
import json
import question_separator_prompt
load_dotenv()

class FileBasedHints:
    """
    A class to handle file-based hint generation using a language model.
    """
    
    class Question_Response(BaseModel):
        questions: list[str]
        instructions: str
    
    def __init__(self) -> None:
        """
        Initializes the FileBasedHints class.

        """
        self.db = Database()
        api_key = self.db.get_api_key()
        print("api_key:", api_key)
        if api_key:
            os.environ["GEMINI_API_KEY"] = api_key.decode("utf-8")
        self.model = "gemini-2.5-flash"
        self.llm = genai.Client(api_key=os.environ["GEMINI_API_KEY"])
        
    def create_files(self, folder_name: str, total_questions: int) -> None:
        cwd = os.getcwd()
        parent_dir = os.path.dirname(cwd)

        folder_path = os.path.join(parent_dir, folder_name)
        os.makedirs(folder_path, exist_ok=True)
        print("Current Working Directory:", folder_path)
        for i in range(total_questions):
            folder_name = f"question_{i+1}"
            subfolder_path = os.path.join(folder_path, folder_name)

            os.makedirs(subfolder_path, exist_ok=True)  # Create subfolder if it doesn't exist

            file_path = os.path.join(subfolder_path, f"{folder_name}.py")
            with open(file_path, "w") as f:
                f.write(f"# This is question {i+1}")


    def execute_preprocessing(self, file_path: str, folder_name: str = "default", auto_file_creation: bool = False) -> dict[int, str]:
        """
        Executes the workflow for the file.
        """
        print("Executing workflow...")
        try:
            # total_questions = 1
            # all_text = self.extract_text_pymupdf(file_path)
            questions_dict = self.create_questions(file_path)
            print(questions_dict)
            self.save_questions(questions_dict, folder_name)
            total_questions = len(questions_dict["questions"])
            # total_questions = 2
            if auto_file_creation:
                print(total_questions)
                self.create_files(folder_name, total_questions)
            else:
                pass
            return {"message": "Preprocessing completed successfully"}
        except Exception as e:
            print(f"Error in execute_preprocessing: {str(e)}")
            return {"error": f"Error in preprocessing file: {str(e)}"}
        
    def save_questions(self, questions_dict: dict[int, str], folder_name: str) -> None:
        """
        Saves the questions to a file.
        """
        self.db.save_doc(folder_name, questions_dict)
        
    def create_questions(self, file_path: str) -> dict:
        """
        Creates questions for the file using the language model.
        """
        try:
            file_data_encoded = pathlib.Path(file_path)
            
            # Check if file exists
            if not file_data_encoded.exists():
                raise Exception(f"File not found: {file_path}")
            
            prompt = question_separator_prompt.prompt
            response = self.llm.models.generate_content(
                model=self.model,
                contents=[
                    types.Part.from_bytes(
                        data=file_data_encoded.read_bytes(),
                        mime_type='application/pdf',
                    ),
                    prompt
                ],
                config={
                    "response_mime_type": "application/json",
                    "response_schema": self.Question_Response,
                },
            )
            try:
                parsed = json.loads(response.text)
                # Reformat to match desired DB structure
                questions_list = parsed.get('questions', [])
                instructions = parsed.get('instructions', "")
                questions_dict = {str(i+1): q for i, q in enumerate(questions_list)}
                result = {
                    "questions": questions_dict,
                    "instructions": instructions
                }
                # print(json.dumps(result, indent=2, ensure_ascii=False))
                return result
            except Exception as e:
                print("Could not parse response as JSON, printing raw text:")
                print(response.text)
                raise Exception(f"Failed to parse Gemini response: {str(e)}")
        except Exception as e:
            print(f"Error in create_questions: {str(e)}")
            raise e
    
    def get_question_text(self, folder_name: str, question_no: int) -> tuple[str, str]:
        """
        Returns the text of the question.
        """
        try:
            data = self.db.get_doc(folder_name)
            # print(data)
            question_text = data['questions'][str(question_no)]
            instructions = data['instructions']
            # print("question_text:", question_text)
            # print("instructions:", instructions)
            return question_text, instructions   # Return the specific question by index
        except Exception as e:
            print(e)
            return None

        # print("question:", question)
        
        # print(self.db.get_question(folder_name, question_no))
        # return questions_dict[str(question_no)]
        
    def add_api_key(self, api_key: str) -> None:
        """
        Adds the API key to the database.
        """
        self.db.save_api_key(api_key)
        self.llm = genai.Client(api_key=api_key)
        # print(os.getenv("GEMINI_API_KEY"))

                  
    def get_general_hints(self, present_code: str, folder_name: str, question_no: int) -> None:
        """
        Generates hints for the file using the language model.
        
        Args:
            question_no (int): The number of the question to generate hints for.
        """
        print(f"Generating hints for question number: {question_no}")
        (question_text, instructions) = self.get_question_text(folder_name, question_no)
        print("question_text:", question_text)
        print("instructions:", instructions)
        return "This is a hint for question number: " + str(question_no)
 
        
