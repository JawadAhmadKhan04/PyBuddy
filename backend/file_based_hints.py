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


    def get_general_hints(self, present_code: dict[str, str], question_data: str, api_key: str, topic: str) -> dict:
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

            prompt = f"""You are an intelligent and helpful Python tutor who is quite friendly and informal in nature but keeps in mind that they need to be professsional assisting a student with the following programming task.

== Problem ==
{question_data}

== Student's Current Code ==
{current_code}

== Task ==
Based on the problem and current code, provide one high-quality, structured hint in JSON format using this schema:
Provide exactly one JSON object with these fields:
- hint_text: Clear, actionable guidance for the next step (no code), and they must be short and specific.
- hint_topic: 1-3 word topic tag (e.g., 'loops', 'recursion')
- concepts: Dictionary of key terms with simple definitions

IMPORTANT:
1. Return ONLY the raw JSON object
2. No Markdown formatting (no ```json or ```)
3. No additional explanations
4. Valid JSON syntax only

{{
  "hint_text": "<a clear, helpful, and actionable explanation>",
@@ -88,35 +98,37 @@
- Include a dictionary of all programming terms, structures, or logic ideas you used in your hint.
- For each concept, give a simple, clear, **beginner-level explanation**.
- You must keep on simplifying the hints as the user keeps clicking the hints button.
- Clearly identify any syntax errors if they exist.
- Clearly tell what the user must do to solve any problem in the code.
- Clearly analyze the {topic} and your hint must completely revolve around it if it exists.
- If the user is stuck help themout with the syntax without giving code
- Your hints must stay within context also must tell the user in simpe terms what to do
- If your hint says “base case,” the concept for "base case" must explain what that is.
- You must keep it step by step, keep in mind dont move to the next step until perfecting the current step.
- Give at least 3 concepts but keep in mind to avoid giving unnecessary concepts.
- Keep the concept description informal and casual so that it is easy for the user to understand.
- Avoid vague or advanced language — make it easy for a student to grasp.
- You must keep in mind that you have to help user solve all edge cases one by one instead of after completing solution.
- Hints must be informal, user friendly such that it is giving hints to a student.
- Hints must become more and more specific if the user is still stuck on a specific point.
- You can provide built in functions in Hints but tell the user in one line what they do.
- Hints must be short not to long.
- Once the solution is complete tell the user its complete and stop giving hints.
- Once the solution is totally perfectly complete you should not be giving concepts

== Output ==
Return a **single valid JSON object** only — do not include explanations, markdown, or anything else outside the JSON.

Let's take it step by step."""

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