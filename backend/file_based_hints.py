import os
from database import Database
from dotenv import load_dotenv
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain.chains import ConversationChain
from langchain.memory import ConversationBufferMemory
# from typing import List
import fitz  # PyMuPDF
from pydantic import BaseModel
from langchain_core.output_parsers import PydanticOutputParser
from langchain_core.prompts import PromptTemplate

# def process_pdfs_in_folder(folder_path: str) -> None:
#     """
#     Processes all PDF files in a given folder, extracting text and images from each.

#     Args:
#         folder_path (str): The path to the folder containing PDF files.
#     """
#     pdf_files = glob.glob(os.path.join(folder_path, '*.pdf'))
#     if not pdf_files:
#         print(f"No PDF files found in {folder_path}")
#         return
#     for pdf_file in pdf_files:
#         print(f"\nProcessing: {pdf_file}")
#         file_based_hints = FileBasedHints(pdf_file)
#         file_based_hints.extract_text_and_images_pymupdf()

load_dotenv()

class FileBasedHints:
    """
    A class to handle file-based hint generation using a language model.
    """
    
    class Question_Response(BaseModel):
        questions_created_number: int
        first_line_of_question: list[str]
    
    def __init__(self) -> None:
        """
        Initializes the FileBasedHints class.

        """
        self.db = Database()
        self.model = "gemini-2.5-flash"
        os.environ["LANGCHAIN_TRACING_V2"] = "true"
        os.environ["LANGCHAIN_API_KEY"] = os.getenv("LANGSMITH_API_KEY")
        os.environ["LANGCHAIN_PROJECT"] = "PyBuddy_Creating_Questions" # Give your project a name
        os.environ["GOOGLE_API_KEY"] = os.getenv("GEMINI_API_KEY")
        # self.client = genai.Client(api_key=self.gemini_api_key)
        self.llm = ChatGoogleGenerativeAI(
            model=self.model,
            temperature=0.7,
        )

        self.memory = ConversationBufferMemory(return_messages=True)
        self.conversation = ConversationChain(
            llm=self.llm,
            memory=self.memory,
            verbose=True  # This prints the internal prompt
        )
        
        self.parser = PydanticOutputParser(pydantic_object=self.Question_Response)
        self.prompt = PromptTemplate(
            template="Answer the user query.\n{format_instructions}\n{query}\n",
            input_variables=["query"],
            partial_variables={"format_instructions": self.parser.get_format_instructions()},
        )
        self.chain = self.prompt | self.llm | self.parser

    def execute_preprocessing(self, file_path: str, folder_name: str = "default") -> dict[int, str]:
        """
        Executes the workflow for the file.
        """
        print("Executing workflow...")
        try:
            all_text = self.extract_text_pymupdf(file_path)
            questions_dict = self.create_questions(all_text)
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
        
    def create_questions(self, all_text: list[str]) -> dict[int, str]:
        """
        Creates questions for the file using the language model.

        Args:
            all_text (List[str]): The text extracted from the PDF.
        """
        #  print("Before clearing memory: ", self.memory.chat_memory)
        # self.memory.clear()
        # print("After clearing memory: ", self.memory.chat_memory)
        print("Creating questions...")
        query_text = """This is a portion of an assignment, I want to separate the tasks from the text, 
        and return the number of questions created and the first line of the question. Look at our previous chat as well, 
        there is a chance that the first line of the text might be the start of the question. If that is the case, 
        then you should return the first line of the text as the first line of the next question.
        Questions would always be starting with Q1, Q2, Q3 or like 'Question 1', 'Question 2', 'Question 3', etc.
        They can also start with 'Task 1', 'Task 2', 'Task 3', etc. or any synonym like 'Problem 1', 'Problem 2', 'Problem 3', etc.
        Each Questions can also contain sub-questions, so you should return the number of questions created and the first line of the question.
        If for instance you think there is a question but there is no heading, then it will not be considered as a question.
        If a new question is starting, it would specifically mention it.
        For example, if the text is:
        Question 1:
        Solve all of the following questions:
        1. Reverse a string
        2. Find the sum of two numbers
        Then you should return the number of questions created as 1 and the first line of the question as "Question 1".
        Lets take it step by step.
        """
        
        structured = []
        for page in all_text:
            # print(page)
            structured_response: list[self.Question_Response] = self.chain.invoke({"query": query_text + "\n" + page})
            # print("-----------------------------------------------------------------------------------------------------------")
            # print(structured_response)
            structured.append(structured_response)
        # print("Before memory: ", self.memory.chat_memory)

        # print(structured)

        # for i,data in enumerate(structured):
        #     print(f"Page number: {i+1}")
        #     print(data.questions_created_number)
        #     # print(data.questions_created_number)
        #     print(data.first_line_of_question)
        #     print("-----------------------------------------------------------------------------------------------------------")
        
        questions_dict = self.questions_divided(structured, all_text)
        return questions_dict
    
    def questions_divided(self, structured: list[Question_Response], all_text: list[str]) -> dict[int, str]:
        """
        I have the questions into json format, with each page having which question and the number of questions created.
        Now converting to a format so that each question is a separate json object.
        
        Returns:
            dict[int, str]: Dictionary where keys are question numbers and values are the complete question text.
        """
        
        # First, collect all questions across all pages to understand the complete structure
        print("\n" * 5)
        all_questions = []
        first = True
        text = ""
        for page_no, page in enumerate(all_text):
            if structured[page_no].questions_created_number > 0:
                # print(structured[page_no].first_line_of_question)
                for question in structured[page_no].first_line_of_question:
                    # print(question)
                    index = page.find(question)
                    text += page[:index]
                    if not first:
                        all_questions.append(text)
                    page = page[index:]
                    text = ""
                    first = False
                text += page
            else:
                text += page
        all_questions.append(text)
            
        questions_dict = {}
        
        for i, question in enumerate(all_questions):
            questions_dict[i+1] = question
        
        return questions_dict
        
    def extract_text_pymupdf(self, file_path: str) -> list[str]:
        """
        Extracts and prints text from each page of a PDF using PyMuPDF.

        Args:
            path (str): The file path to the PDF document.
        """
        print("Extracting text from PYMUPDF...")
        doc = fitz.open(file_path)

        all_text: list[str] = []
        for page in doc:
            text = page.get_text()
            all_text.append(text)
            # print(f"\n--- Page {i+1} ---\n{text}")
        return all_text
    
    def get_question_text(self, folder_name: str, question_no: int) -> str:
        """
        Returns the text of the question.
        """
        try:
            data = self.db.get_doc(folder_name, question_no)
            return data.get(str(question_no))     # Return only the specific question
        except Exception as e:
            print(e)
            return None

        # print("question:", question)
        
        # print(self.db.get_question(folder_name, question_no))
        # return questions_dict[str(question_no)]
                  
    def get_general_hints(self, folder_name: str, question_no: int) -> None:
        """
        Generates hints for the file using the language model.
        
        Args:
            question_no (int): The number of the question to generate hints for.
        """
        print(f"Generating hints for question number: {question_no}")
        question_text = self.get_question_text(folder_name, question_no)
        
        print("question_text:", question_text)
        return question_text
        
        # response = self.client.models.generate_content(
        #     model=self.model, contents="Explain how AI works in a few words"
        # )
        # print(response.text)