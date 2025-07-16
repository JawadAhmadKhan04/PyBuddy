import os
import re
import base64
from datetime import datetime
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from pytz import timezone, utc
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request
from google_auth_oauthlib.flow import InstalledAppFlow
from typing import Optional

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
            "https://www.googleapis.com/auth/drive.file"
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

    def upload_to_drive(self, file_path: str) -> str:
        try:
            drive_service = build('drive', 'v3', credentials=self.creds)
            file_metadata = {'name': os.path.basename(file_path)}
            media = MediaFileUpload(file_path, mimetype='application/zip')
            file = drive_service.files().create(
                body=file_metadata,
                media_body=media,
                fields='id'
            ).execute()
            return file['id']
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Drive upload failed: {str(e)}")

    def submit_to_classroom(self, course_id: str, assignment_id: str, file_id: str) -> None:
        try:
            submission = {
                "assignmentSubmission": {
                    "attachments": [{"driveFile": {"id": file_id}}]
                }
            }
            result = self.service.courses().courseWork().studentSubmissions().patch(
                courseId=course_id,
                courseWorkId=assignment_id,
                updateMask="assignmentSubmission.attachments",
                body=submission
            ).execute()
            
            self.service.courses().courseWork().studentSubmissions().turnIn(
                courseId=course_id,
                courseWorkId=assignment_id,
                id=result['id']
            ).execute()
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Classroom submission failed: {str(e)}")

gcr_client = GoogleClassroomClient()

# === Endpoints ===
@app.post("/submit/classroom")
async def classroom_submit(course_id: str, assignment_id: str):
    try:
        zip_path = "code_submission.zip"
        if not os.path.exists(zip_path):
            raise HTTPException(status_code=400, detail="Zipped code not found")

        if not os.path.exists("token.json"):
            raise HTTPException(status_code=403, detail="Not authenticated")

        creds = Credentials.from_authorized_user_file("token.json", gcr_client.SCOPES)
        file_id = gcr_client.upload_to_drive(zip_path)
        gcr_client.submit_to_classroom(course_id, assignment_id, file_id)

        return {
            "status": "classroom_success",
            "drive_file_id": file_id,
            "assignment_url": f"https://classroom.google.com/c/{course_id}/a/{assignment_id}"
        }
    except HTTPException as e:
        raise e
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Classroom submission failed: {str(e)}")

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

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8001)