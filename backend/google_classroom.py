from __future__ import print_function
from google.auth.transport.requests import Request
from google_auth_oauthlib.flow import InstalledAppFlow
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
import io
import zipfile
from googleapiclient.http import MediaIoBaseUpload

SCOPES = [
    "https://www.googleapis.com/auth/classroom.courses.readonly",
            "https://www.googleapis.com/auth/classroom.rosters",
            "https://www.googleapis.com/auth/classroom.coursework.me",
            "https://www.googleapis.com/auth/drive.file",
            "https://www.googleapis.com/auth/classroom.coursework.students",
            "https://www.googleapis.com/auth/classroom.profile.emails"
]

def get_creds():
        import os
        import json
        credentials_path = os.path.join(os.path.dirname(__file__), "credentials.json")
        if not os.path.exists(credentials_path):
            return {"error": "credentials.json not found"}
        with open(credentials_path, "r") as f:
            credentials = json.load(f)
        # Return only the 'installed' part if present, else the whole file
        creds_obj = credentials.get("installed", credentials)
        return {
            "credentials": creds_obj,
            "scopes": SCOPES
        }
           

class GoogleClassroomClient:
    def __init__(self, info: str):
        
        
        self.SCOPES = SCOPES
        # Load token if it exists
        if info and info.strip():
            try:
                # Parse the JSON string into a dictionary
                import json
                info_dict = json.loads(info)
                self.creds = Credentials.from_authorized_user_info(info_dict, self.SCOPES)
                print("✅ Token loaded.")
            except (json.JSONDecodeError, ValueError) as e:
                print(f"❌ Invalid token format: {e}")
                self.creds = None

        try:
            self.service = build('classroom', 'v1', credentials=self.creds)
            print("✅ Service built.")
        except Exception as e:
            print(f"❌ Error building service: {e}")
            self.service = None
            
     
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
            
    def submit_to_classroom(self, course_id: str, assignment_id: str, file_id: str) -> dict:
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

            # Step 2: Modify attachments (add the link)
            modify_body = {
    "addAttachments": [
        {
            "driveFile": {
                "id": file_id  # just the ID of the file, no URL
            }
        }
    ]
}


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

            
    def get_gcr_data(self):
        course_result = self.get_courses()

        if "error" in course_result:
            return course_result

        final_data = []

        for course in course_result["courses"]:
            course_id = course["id"]
            course_name = course["name"]

            try:
                assignments = self.get_assignments(course_id)
            except Exception as e:
                print(f"⚠️ Skipping course {course_name} ({course_id}) due to permission error: {e}")
                continue  # Skip this course
            
            if not assignments:
                continue

            final_data.append({
                "courseId": course_id,
                "courseName": course_name,
                "assignments": assignments
            })

        return final_data


    def get_assignments(self, course_id):
        if not self.service:
            print("❌ Not logged in.")
            return []

        try:
            response = self.service.courses().courseWork().list(courseId=course_id).execute()
            coursework = response.get("courseWork", [])
            result = []

            for work in coursework:
                course_work_id = work["id"]
                
                # Fetch student submission
                submission_response = self.service.courses().courseWork().studentSubmissions().list(
                    courseId=course_id,
                    courseWorkId=course_work_id,
                    userId="me"
                ).execute()

                submissions = submission_response.get("studentSubmissions", [])
                submission = submissions[0] if submissions else None
                
                # Initialize grade info
                grade_info = None
                if submission and submission.get("state") == "RETURNED":
                    grade_info = {
                        "assignedGrade": submission.get("assignedGrade"),
                        "draftGrade": submission.get("draftGrade"),
                        "maxPoints": work.get("maxPoints")
                    }
                # print(grade_info)
                result.append({
                    "assignmentId": work.get("id", ""),
                    "title": work.get("title", ""),
                    "description": work.get("description", "No description given"),
                    "dueDate": work.get("dueDate", {}),
                    "dueTime": work.get("dueTime", {}),
                    "submissionState": submission.get("state") if submission else "UNKNOWN",
                    "gradeInfo": grade_info
                })

            return result
        except Exception as e:
            print(f"❌ Failed to fetch assignments for course {course_id}: {e}")
            
            return None
    def join_course_as_student(self, course_id, enrollment_code):
        """
        Enroll the authenticated student into a Google Classroom course.

        Parameters:
            service (googleapiclient.discovery.Resource): Authenticated Classroom API service.
            course_id (str): The ID of the course to join.
            enrollment_code (str): The enrollment code provided by the teacher.

        Returns:
            dict: The response from the API (student enrollment details).
        """
        try:
            student = self.service.courses().students().create(
                courseId=course_id,
                enrollmentCode=enrollment_code,
                body={"userId": "me"}
            ).execute()

            print(f"✅ Successfully joined course: {student['courseId']}")
            return {"message": "Successfully joined course"}

        except Exception as e:
            print(f"❌ Failed to join course: {e}")
            return {"error": "Failed to join course"}




    def get_user_name(self):
        if not self.service:
            print("❌ Not logged in.")
            return None
        profile = self.service.userProfiles().get(userId="me").execute()
        # print("profile", profile)

        email = profile.get("emailAddress")
        if email:
            username = email.split('@')[0]
            return username
        else:
            return None

    

    def get_courses(self, limit=100):
        if not self.service:
            print("❌ Not logged in.")
            return {"error": "Not logged in"}

        results = self.service.courses().list(
            pageSize=limit,
            courseStates=["ACTIVE"]
            ).execute()
        # print("results", results)
        courses = results.get('courses', [])

        if not courses:
            print('No courses found.')
            return {"error": "No courses found"}
        else:
            
            profile = self.service.userProfiles().get(userId="me").execute()
            current_user_id = profile["id"]

            courses = [course for course in courses if course.get("ownerId") != current_user_id]

            print('Courses DONE')
                

        return {"courses": courses}


    def logout(self):
        self.creds = None
        self.service = None
