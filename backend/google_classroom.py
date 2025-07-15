from __future__ import print_function
import os
from google.auth.transport.requests import Request
from google_auth_oauthlib.flow import InstalledAppFlow
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
import re

class GoogleClassroomClient:
    def __init__(self, credentials_path='credentials.json', token_path='token.json'):
        self.credentials_path = credentials_path
        self.token_path = token_path
        
        
        self.SCOPES = [
    "https://www.googleapis.com/auth/classroom.courses",                  # Read course metadata
    "https://www.googleapis.com/auth/classroom.rosters",
    "https://www.googleapis.com/auth/classroom.coursework.me"
]



        # Load token if it exists
        if os.path.exists(self.token_path):
            self.creds = Credentials.from_authorized_user_file(self.token_path, self.SCOPES)
            print("✅ Token loaded.")
        else:
            self.creds = None
        try:
            self.service = build('classroom', 'v1', credentials=self.creds)
            print("✅ Service built.")
        except Exception as e:
            print(f"❌ Error building service: {e}")
            self.service = None
            
    def get_assignments(self, course_id):
        if not self.service:
            print("❌ Not logged in.")
            return {"error": "Not logged in"}

        try:
            results = self.service.courses().courseWork().list(courseId=course_id).execute()
            assignments = results.get('courseWork', [])

            if not assignments:
                print(f"📭 No assignments found for course ID: {course_id}")
            else:
                print(f"📚 Assignments in course {course_id}:")
                print(assignments)
                for a in assignments:
                    print(f"- {a['title']} (ID: {a['id']})")

            return assignments
        except Exception as e:
            print(f"❌ Failed to fetch assignments: {e}")
            return {"error": str(e)}

            
    def extract_course_id(self, classroom_url):
        match = re.search(r'/c/([a-zA-Z0-9]+)', classroom_url)
        if match:
            return match.group(1)
        else:
            raise ValueError("Invalid Google Classroom URL. Course ID not found.")
        
    def join_course(self, classroom_url = None, course_id = None):
        if not self.service:
            print("❌ Not logged in.")
            return {"error": "Not logged in"}
        try:
            if classroom_url:
                course_id = self.extract_course_id(classroom_url)
            print(f"✅ Joining course with ID: {course_id}")
            self.service.courses().students().create(
            courseId=course_id,
            body={"userId": "me"}
        ).execute()
            print(f"✅ Successfully joined course with ID: {course_id}")
        except Exception as e:
            print(f"❌ Failed to join course: {e}")


    def login(self):
        try:
            if self.creds and self.creds.valid:
                print("✅ Already logged in.")
                return

            # If credentials are not valid, perform login
            if not self.creds or not self.creds.valid:
                if self.creds and self.creds.expired and self.creds.refresh_token:
                    self.creds.refresh(Request())
                else:
                    if not os.path.exists(self.credentials_path):
                        print("❌ credentials.json not found.")
                        return
                    flow = InstalledAppFlow.from_client_secrets_file(self.credentials_path, self.SCOPES)
                    print("flow", flow)
                    self.creds = flow.run_local_server(port=0)
                    print("self.creds", self.creds)

                # Save the credentials
                with open(self.token_path, 'w') as token_file:
                    token_file.write(self.creds.to_json())

            self.service = build('classroom', 'v1', credentials=self.creds)
            print("✅ Login successful.")
        except Exception as e:
            print(f"❌ Login failed: {e}")

    def get_courses(self, limit=10):
        if not self.service:
            print("❌ Not logged in.")
            return {"error": "Not logged in"}

        results = self.service.courses().list(pageSize=limit).execute()
        print("results", results)
        courses = results.get('courses', [])

        if not courses:
            print('No courses found.')
            return {"error": "No courses found"}
        else:
            print('Courses:')
            for course in courses:
                print(f"{course['name']} ({course['id']})")

        return {"courses": courses}


    def logout(self):
        if os.path.exists(self.token_path):
            os.remove(self.token_path)
            self.creds = None
            self.service = None
            print("✅ Logged out and token removed.")
        else:
            print("No token file to delete.")


# gcr = GoogleClassroomClient()
# while True:
#     choice = int(input("1. Login\n2. Get Courses\n3. Logout\n4. Join Course\n5. Debug Account\n 6. Assignemnt\n 7. Exit\n"))
#     if choice == 1:
#         gcr.login()
#     elif choice == 2:
#         gcr.get_courses()
#     elif choice == 3:
#         gcr.logout()
#     elif choice == 4:
#         classroom_url = input("Enter the classroom URL: ")
#         gcr.join_course(classroom_url)
#     elif choice == 6:
#         course_id = input("Enter the course ID: ")
#         gcr.get_assignments(course_id)
#     elif choice == 7:
#         break
#     else:
#         print("Invalid choice.")
