import os
from pydantic import BaseModel
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
        self.model = None
        self.llm = None

    def get_general_hints(self, present_code: dict[str, str], question_data: str, api_key: str, topic: str) -> dict:
        """
        Generates hints for the file using the language model.

        Args:
            present_code (dict[str, str]): Dictionary containing the current code files
            question_data (str): The problem statement
            api_key (str): API key for the language model
            topic (str): Topic of the question
        """
        try:
            current_code = ""
            if present_code:
                for filename, code_content in present_code.items():
                    if filename.endswith('.py'):
                        lines = code_content.split('\n')
                        code_lines = [
                            line for line in lines
                            if not line.strip().startswith('#') or 'This is question' not in line
                        ]
                        current_code += '\n'.join(code_lines).strip()

            prompt = f"""You are a professional yet informal and friendly Python tutor. Your job is to guide the student step by step — not give away answers, but always focus on the *next* fix or improvement.

== Problem ==
{question_data}

== Student's Current Code ==
{current_code}

== Task ==
Based on the problem and current code, provide exactly ONE short but highly actionable hint in **JSON format**. This hint should:
- Focus on fixing or understanding ONE small step.
- Clearly explain *why* something is wrong if it is.
- If the code is not working, help find the most critical logic or syntax issue and explain it gently.
- Avoid giving code or solutions; instead, help the student discover it.
- Always simplify advanced terms or abstract ideas.
- Do not say “Your solution looks complete!” unless the student has written the full end-to-end logic for solving the problem.
- A complete solution must include:
    - All loops and decision logic needed for solving the problem.
    - A correct and meaningful return value or printed output at the end.
    - Use of all necessary inputs (e.g., weights, values, capacity in knapsack).
- If any part is missing (e.g., return statement, reconstruction of solution, base conditions, or complete iteration), consider the code incomplete and give the next required concept.
- Even if the structure is correct, treat the solution as incomplete until it computes the actual answer and returns or prints it.
== Format ==
Return only a valid JSON object like this:

{{
  "hint_text": "<A clear, friendly tip about what to fix or think about next — no code.>",
  "hint_topic": "<One to three words max — e.g., 'loop', 'base case', 'recurrence'>",
  "concepts": {{
    "concept1": "Explain this simply, like you're talking to a beginner.",
    "concept2": "Another simple explanation.",
    "concept3": "One more, no unnecessary jargon."
  }}
}}

== Additional Instructions ==
- Return only the raw JSON — no markdown, no comments, no explanation.
- If there’s a mistake in logic or syntax, identify it politely.
- Always focus the hint on what the student should think about next.
- Be concise, casual, and approachable — like you're tutoring a beginner in person.
- Explain all terms used in the hint in the concepts section.
- If the solution is now totally correct, say “Your solution looks complete!” and give no new concepts.

== Examples of Better Style ==
BAD: “Use nested loops to fill the dp table.”
GOOD: “Try looping over each item and for each one, check all capacities — this helps you fill the DP table step by step.”

BAD: “Your recurrence is wrong.”
GOOD: “It looks like you're only choosing one option for the item. What if we also check the value when we skip it?”

== Output ==
Now return one helpful JSON hint for the student based on the code above.
"""
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
                cleaned_text = response.text.strip()
                if cleaned_text.startswith("```json"):
                    cleaned_text = cleaned_text.removeprefix("```json").strip()
                if cleaned_text.endswith("```"):
                    cleaned_text = cleaned_text.removesuffix("```").strip()

                hint_data = json.loads(cleaned_text)
                print("Generated hint:", hint_data)
                return {"hint": hint_data}
            except json.JSONDecodeError as e:
                print(f"Failed to parse hint response: {response.text}")
                return {"error": f"Failed to parse hint response: {str(e)}"}

        except Exception as e:
            print(f"Error generating hint: {str(e)}")
            error_str = str(e).lower()
            if "api" in error_str and ("key" in error_str or "invalid" in error_str or "unauthorized" in error_str or "authentication" in error_str):
                return {
                    "error": "API Key is Invalid. Either enter a valid API key or check if the API key is not expired."
                }
            return {"error": f"Error generating hint: {str(e)}"}
