import os
import re
import base64
from datetime import datetime
from fastapi import FastAPI, HTTPException, Body
from pydantic import BaseModel
from pytz import timezone, utc
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload, MediaIoBaseUpload
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request
from google_auth_oauthlib.flow import InstalledAppFlow
from typing import Optional
import io
import zipfile

app = FastAPI()

# === Models ===
class CourseJoinRequest(BaseModel):
    classroom_url: Optional[str] = None
    course_id: Optional[str] = None

# === Classroom Implementation ===
class GoogleClassroomClient:
    def __init__(self, credentials_path='credentials.json', token_path='token.json'):
        self.credentials_path = credentials_path
        self.token_path = token_path
        self.SCOPES = [
            "https://www.googleapis.com/auth/classroom.courses.readonly",
            "https://www.googleapis.com/auth/classroom.rosters.readonly",
            "https://www.googleapis.com/auth/classroom.coursework.me",
            "https://www.googleapis.com/auth/drive.file",
            "https://www.googleapis.com/auth/classroom.coursework.students"
        ]
        self.creds = self._load_credentials()
        self.service = build('classroom', 'v1', credentials=self.creds) if self.creds else None

    def _load_credentials(self):
        if os.path.exists(self.token_path):
            creds = Credentials.from_authorized_user_file(self.token_path, self.SCOPES)
            if creds.expired and creds.refresh_token:
                creds.refresh(Request())
            return creds
        return None

    def upload_to_drive(self, files_dict: dict, zip_name: str = "submission.zip") -> tuple:
        try:
            # Create in-memory zip
            zip_buffer = io.BytesIO()
            with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zip_file:
                for filename, filedata in files_dict.items():
                    zip_file.writestr(filename, filedata)
            zip_buffer.seek(0)
            drive_service = build('drive', 'v3', credentials=self.creds)
            file_metadata = {'name': zip_name}
            media = MediaIoBaseUpload(zip_buffer, mimetype='application/zip', resumable=True)
            file = drive_service.files().create(
                body=file_metadata,
                media_body=media,
                fields='id, webViewLink'
            ).execute()
            return file['webViewLink'], file['id']
        except Exception as e:
            return None, f"Drive upload failed: {str(e)}"
    
    def create_assignment(self, course_id: str):
    # Load credentials (make sure you've done OAuth flow and saved token.json)
        # creds = Credentials.from_authorized_user_file(
        #     token_path,
        #     scopes=[
        #         "https://www.googleapis.com/auth/classroom.coursework.me",
        #         "https://www.googleapis.com/auth/classroom.coursework.students"
        #     ]
        # )

        # service = build('classroom', 'v1', credentials=creds)
        try:
            assignment = {
            "title": "Machine Learning",
            "description": """Task: Build a movie recommendation system using scikit‑learn.
 
Focus: Implementing collaborative filtering, handling input/output from users, evaluating model performance.

Submission:

Create a script that
Loads a movie-ratings dataset .
Implements user-based or item-based collaborative filtering .
Handles user input, e.g. you can accept a user ID or input a movie+users rating for it, and find similar ones that user may like based on that info , you can customize the exact type of input expected from the user, based on your use case.
Evaluate recommendations using metrics like RMSE or MAE.
Must: Push your code to github (public repo), Add a README  file with instructions to reproduce results and sample outputs, add screenshots in the readme , push to github and submit the github link.

Helpful links
https://realpython.com/build-recommendation-engine-collaborative-filtering/
this kaggle notebook can be a good starting point https://www.kaggle.com/code/ibtesama/getting-started-with-a-movie-recommendation-system
Building a Movie Recommendation Engine in Python using Scikit-Learn: https://medium.com/%40sumanadhikari/building-a-movie-recommendation-engine-using-scikit-learn-8dbb11c5aa4b

One of the many movies datasets you can find on kaggle: https://www.kaggle.com/datasets/tmdb/tmdb-movie-metadata  (you can look for more depending on what info you want to see about the movies)

Be ready to explain how you cleaned the dataset,  and how did you compute similarity!

RUBRIC
Data preprocessing
Loading data, preprocessing, cleaning
5 pts

User based or item based collaborative filtering
implement either user-based or item-based collaborative filtering using scikit-learn. The logic behind similarity calculation (e.g. cosine similarity, k-NN) should be well-reasoned and correctly implemented.
10 pts

User input
Calculations based on user input, not hard coded
5 pts

Model evaluation
Evaluate using appropriate metrics like RMSE or MAE, and provide a brief interpretation of the results.
10 pts

Code quality
Well-structured, logically organized, and properly commented code. Variable/function names should be clear and meaningful
5 pts

Github and README
Submit a link to your github repo. A README file should be submitted as mentioned
5 pts
""",
            "materials": [],
            "state": "PUBLISHED",
            "workType": "ASSIGNMENT",
            "assignment": {},  # 🔥 Required when workType is ASSIGNMENT

            "maxPoints": 100,
            "dueDate": {
                "year": 2025,
                "month": 7,
                "day": 30
            },
            "dueTime": {
                "hours": 23,
                "minutes": 59
            }
        }

            response = self.service.courses().courseWork().create(
                courseId=course_id,
                body=assignment
            ).execute()

            print("✅ Assignment created:")
            print("Title:", response["title"])
            print("ID:", response["id"])
        except Exception as e:
            print("Exception in create_assignment:", repr(e))
            raise HTTPException(status_code=500, detail=f"Assignment creation failed: {str(e)}")
        return response
    
    def get_assignments(self, course_id: str):
        try:
            response = self.service.courses().courseWork().list(courseId=course_id).execute()
            return response
        except Exception as e:
            print("Exception in get_assignments:", repr(e))
            return {"error": str(e)}
    
    def get_courses(self):
        try:
            response = self.service.courses().list().execute()
            return response
        except Exception as e:
            print("Exception in get_courses:", repr(e))
            raise HTTPException(status_code=500, detail=f"Course retrieval failed: {str(e)}")

    def submit_to_classroom(self, course_id: str, assignment_id: str, link: str, file_id: str) -> dict:
        try:
            # Step 1: Get student submission ID
            submissions = self.service.courses().courseWork().studentSubmissions().list(
                courseId=course_id,
                courseWorkId=assignment_id,
                userId='me'
            ).execute()

            if 'studentSubmissions' not in submissions or not submissions['studentSubmissions']:
                return {"success": False, "error": "No submission found for this user."}

            submission = submissions['studentSubmissions'][0]
            submission_id = submission['id']
            print("Using submission_id:", submission_id)

            # If already turned in, unsubmit first
            if submission['state'] == 'TURNED_IN':
                print("Submission already turned in. Reclaiming (unsubmitting) first...")
                self.service.courses().courseWork().studentSubmissions().reclaim(
                    courseId=course_id,
                    courseWorkId=assignment_id,
                    id=submission_id
                ).execute()
                print("Submission reclaimed.")
                # Remove all existing attachments
                existing_attachments = submission.get('assignmentSubmission', {}).get('attachments', [])
                if existing_attachments:
                    remove_body = {
                        "removeAttachments": [
                            {k: v for k, v in att.items()} for att in existing_attachments
                        ]
                    }
                    print("Removing attachments:", remove_body)
                    self.service.courses().courseWork().studentSubmissions().modifyAttachments(
                        courseId=course_id,
                        courseWorkId=assignment_id,
                        id=submission_id,
                        body=remove_body
                    ).execute()
                    print("Existing attachments removed.")
                    
            print("Area 1: ", file_id)

            # Step 2: Modify attachments (add the link)
            modify_body = {
    "addAttachments": [
        {
            "driveFile": {
                "id": file_id,  # from your uploaded file
            }
        }
    ]
}

            print("Area 2: ", modify_body)


            result = self.service.courses().courseWork().studentSubmissions().modifyAttachments(
                courseId=course_id,
                courseWorkId=assignment_id,
                id=submission_id,
                body=modify_body
            ).execute()

            print("modifyAttachments result:", result)

            # Step 3: Turn in the submission
            self.service.courses().courseWork().studentSubmissions().turnIn(
                courseId=course_id,
                courseWorkId=assignment_id,
                id=submission_id
            ).execute()

            print("✅ Submission turned in successfully.")
            return {"success": True, "message": "Submission turned in successfully."}

        except Exception as e:
            print("Exception in submit_to_classroom:", repr(e))
            return {"success": False, "error": f"Classroom submission failed: {str(e)}"}

gcr_client = GoogleClassroomClient()

# === Endpoints ===
@app.post("/submit/classroom")
async def classroom_submit(course_id: str, assignment_id: str, files: dict = Body(...)):
    print(course_id, assignment_id, files.keys())
    try:
        drive_link, file_id = gcr_client.upload_to_drive(files)
        if drive_link is None:
            return {"success": False, "error": file_id}  # file_id contains the error message here
        print("Uploaded to drive:", drive_link)
        return gcr_client.submit_to_classroom(course_id, assignment_id, drive_link, file_id)
    except HTTPException as e:
        raise e
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Classroom submission failed: {str(e)}")
    
@app.post("/create/assignment")
async def classroom_create_assignment(course_id: str):
    gcr_client.create_assignment(course_id)
    return {"status": "assignment_created"}

@app.post("/classroom/get_assignments")
async def classroom_get_assignments(course_id: str):
    return gcr_client.get_assignments(course_id)

@app.post("/classroom/login")
async def classroom_login():
    try:
        if not os.path.exists(gcr_client.credentials_path):
            raise HTTPException(status_code=404, detail="credentials.json not found")
        
        flow = InstalledAppFlow.from_client_secrets_file(
            gcr_client.credentials_path,
            gcr_client.SCOPES
        )
        gcr_client.creds = flow.run_local_server(port=0)
        with open(gcr_client.token_path, 'w') as token_file:
            token_file.write(gcr_client.creds.to_json())
        
        gcr_client.service = build('classroom', 'v1', credentials=gcr_client.creds)
        return {"status": "login_success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Login failed: {str(e)}")

@app.post("/classroom/get_courses")
async def classroom_get_courses():
    return gcr_client.get_courses()


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8001)