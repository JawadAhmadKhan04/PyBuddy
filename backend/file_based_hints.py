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
Provide exactly one JSON object with these fields:
- hint_text: Clear, actionable guidance for the next step (no code)
- hint_topic: 1-3 word topic tag (e.g., 'loops', 'recursion')
- concepts: Dictionary of key terms with simple definitions

IMPORTANT:
1. Return ONLY the raw JSON object
2. No Markdown formatting (no ```json or ```)
3. No additional explanations
4. Valid JSON syntax only

{{
  "hint_text": "<a clear, helpful, and actionable explanation>",
  "hint_topic": "<a short topic tag like 'loops', 'API', 'data cleaning', 'indexing', 'syntax', 'modularization', etc>"
}}

- Note that the hints that you will provide must move from generic to specific.
- Also you must carefully analyze the instructions, rubrics, links and anything given in the question and your hints must revolve around them.
- You must also give simple hints without complicating them so that anyone can understand
== Rules for hint_text ==
- Be clear, concise, and helpful for the next immediate step don't make it too much detailed.
- Do NOT include any code.
- If a task requires a built in function provide that to the user
- If a taske requires any concept provide that to the user in your hints
- Clearly explain any logic or syntax mistake if present.
- Guide in built in functions if user gets stuck, you must keep in mind they are a beginner
- Guide formatting improvements if output is confusing or non-standard.
- Mention missing imports if needed.
- If the task is from an assignment module (e.g., EDA, API, NLP), align the hint to the rubric.
- Do not repeat the problem or recap existing code.
- If the code is complex, recommend using functions or classes.
- If already solved, say so — no extra features.
- If the user asks for a hint again on the same step, make it simpler and more direct.

== Rules for hint_topic ==
- Use 1–3 lowercase words like: 'loops', 'recursion', 'list comprehension', 'syntax', 'error handling', 'logic', etc.

== Rules for concepts ==
- Include a dictionary of all programming terms, structures, or logic ideas you used in your hint.
- For each concept, give a simple, clear, **beginner-level explanation**.
- If your hint says “base case,” the concept for "base case" must explain what that is.
- Give at least 3 concepts.
- Keep the concept description informal and casual so that it is easy for the user to understand.
- Avoid vague or advanced language — make it easy for a student to grasp.

== Output ==
Return only a single valid JSON object conforming to the above schema.
Do NOT include any extra explanation or markdown.
If nothing further is needed, return a hint_text that confirms the solution is complete and correct.

Let's take it step by step."""


    
            os.environ["GEMINI_API_KEY"] = api_key
            self.model = "gemini-2.5-flash"
            self.llm = genai.Client(api_key=os.environ["GEMINI_API_KEY"])
            response = self.llm.models.generate_content(
                model=self.model,
                contents=[prompt],
                config={
                    "response_mime_type": "application/json",
                    "response_schema": self.Hint,
                }
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
