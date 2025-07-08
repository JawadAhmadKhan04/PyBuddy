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
            self.save_questions(questions_dict, folder_name)
            return {"message": "Preprocessing completed successfully"}
        except Exception as e:
            print(e)
            return {"error": "Error in preprocessing file"}
        
    def save_questions(self, questions_dict: dict[int, str], folder_name: str) -> None:
        """
        Saves the questions to a file.
        """
        self.db.save_doc(folder_name, questions_dict)
        
    def create_questions(self, file_path: str) -> dict:
        """
        Creates questions for the file using the language model.
        """
        file_data_encoded = pathlib.Path(file_path)        
        prompt = """This is an assignment, I want to separate each question separately from the assignment, 
        and return the entire question in the asked format.
        If there are any for the entire assignment, then return the instructions for the entire assignment.
        For example, it could be the submission criteria, or if a specific topic for example "Recursion" is a must.
        Return the instructions in the asked format.
        Questions would always be starting with Q1, Q2, Q3 or like 'Question 1', 'Question 2', 'Question 3', etc.
        They can also start with 'Task 1', 'Task 2', 'Task 3', etc. or any synonym like 'Problem 1', 'Problem 2', 'Problem 3', etc.
        Each Questions can also contain sub-questions, you must not cater the sub-questions.
        If for instance you think there is a question but there is no heading, then it will not be considered as a question.
        If a new question is starting, it would specifically mention it.
        For example, if the text is:
        Question 1:
        Solve all of the following questions:
        1. Reverse a string
        2. Find the sum of two numbers
        Ignore any images, even if it lies inside a question. Instead of an image you should just return "IMAGE HERE".
        Then you should return that the entire question is as a single question"Question 1: Solve all of the following questions: 1. Reverse a string 2. Find the sum of two numbers".
        Make sure the questions are not overlapping with each other, and the questions are not repeated.
        Make sure the formatting of the questions is correct. For instance if inside a question, there is a new line, then the output should also has it as a new line.
        Lets take it step by step.
        """
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
            print(json.dumps(result, indent=2, ensure_ascii=False))
            return result
        except Exception as e:
            print("Could not parse response as JSON, printing raw text:")
            print(response.text)
            return None
    
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
        return question_text, instructions
 
        
