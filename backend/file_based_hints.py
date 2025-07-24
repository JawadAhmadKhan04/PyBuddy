import os
from pydantic import BaseModel
import os
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
    
    class Hint(BaseModel):
        hint_text: str
        hint_topic: str
        concepts: dict[str, str]
    
    def __init__(self) -> None:
        """
        Initializes the FileBasedHints class.

        """


    def get_general_hints(self, present_code: dict[str, str], question_data: str, api_key: str) -> dict:
        """
        Generates hints for the file using the language model.
        
        Args:
            present_code (dict[str, str]): Dictionary containing the current code files
            folder_name (str): Name of the folder containing questions
            question_no (int): The number of the question to generate hints for.
        """
        try:
            current_code = ""
            if present_code:
                for filename, code_content in present_code.items():
                    if filename.endswith('.py'):
                        # Remove the initial comment and get actual code
                        lines = code_content.split('\n')
                        code_lines = [line for line in lines if not line.strip().startswith('#') or 'This is question' not in line]
                        current_code += '\n'.join(code_lines).strip()
            
            prompt = f"""You are an intelligent and helpful Python tutor assisting a student with the following programming task.

== Problem ==
{question_data}

== Student's Current Code ==
{current_code}

== Task ==
Based on the problem and current code, provide one high-quality, structured hint in JSON format using this schema:

{{
  "hint_text": "<a clear, helpful, and actionable explanation>",
  "hint_topic": "<a short topic tag like 'loops', 'API', 'data cleaning', 'indexing', 'syntax', 'modularization', etc>",
  "concepts": {{
    "<concept1>": "<a short, beginner-friendly definition of concept1, based on how it relates to this hint>",
    "<concept2>": "<definition of concept2>",
    ...
  }}
}}

== Goals ==
- Think line-by-line: guide only the **next logical step** toward the solution.
- Always **analyze the student’s current code** and **match it with the instructions** from the problem.
- Keep the user from drifting off-topic; redirect them if they do.
- If the student is stuck, guide them using concepts, not code.
- Help the student learn — don’t give away full solutions or jump steps.

== Rules for hint_text ==
- Be clear, actionable, and limited to the **next step**.
- Do NOT include any code.
- You may mention built-in Python functions, but don't give code examples.
- If the student is missing a key structure (like a loop or base case), tell them that and why it's needed.
- Mention missing imports or incorrect logic if applicable.
- If the answer is already fully correct, return a positive message confirming completion.

== Rules for hint_topic ==
- Use 1–3 lowercase words like: 'loops', 'recursion', 'list comprehension', 'syntax', 'error handling', 'logic', etc.

== Rules for concepts ==
- Include a dictionary of all programming terms, structures, or logic ideas you used in your hint.
- For each concept, give a simple, clear, **beginner-level explanation**.
- If your hint says “base case,” the concept for "base case" must explain what that is.
- Avoid vague or advanced language — make it easy for a student to grasp.

== Output ==
Return a **single valid JSON object** only — do not include explanations, markdown, or anything else outside the JSON.

Let’s take it step by step."""

            os.environ["GEMINI_API_KEY"] = api_key
            self.model = "gemini-2.5-flash"
            self.llm = genai.Client(api_key=os.environ["GEMINI_API_KEY"])
            response = self.llm.models.generate_content(
                model=self.model,
                contents=[{
                    "role": "user",
                    "parts": [{"text": prompt}]
                }]
            )
            try:
                hint_data = json.loads(response.text)
                print("Generated hint:", hint_data)
                return {"hint": hint_data}
            except json.JSONDecodeError as e:
                print(f"Failed to parse hint response: {response.text}")
                return {"error": f"Failed to parse hint response: {str(e)}"}
                
        except Exception as e:
            print(f"Error generating hint: {str(e)}")
            # Check if the error is related to API key
            error_str = str(e).lower()
            if "api" in error_str and ("key" in error_str or "invalid" in error_str or "unauthorized" in error_str or "authentication" in error_str):
                return {"error": "API Key is Invalid. Either enter a valid API key or check if the API key is not expired."}
            return {"error": f"Error generating hint: {str(e)}"}
