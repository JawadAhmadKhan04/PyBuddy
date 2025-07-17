from __future__ import print_function
import os
from google.auth.transport.requests import Request
from google_auth_oauthlib.flow import InstalledAppFlow
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
import re

class GoogleClassroomClient:
    def __init__(self, credentials_path='credentials.json', info=''):
        self.credentials_path = credentials_path
        self.info = info
        
        self.SCOPES = [
    "https://www.googleapis.com/auth/classroom.courses.readonly",                  # Read course metadata
    "https://www.googleapis.com/auth/classroom.rosters",
    "https://www.googleapis.com/auth/classroom.coursework.me"
]

        # Load token if it exists
        if self.info and self.info.strip():
            try:
                # Parse the JSON string into a dictionary
                import json
                info_dict = json.loads(self.info)
                self.creds = Credentials.from_authorized_user_info(info_dict, self.SCOPES)
                print("✅ Token loaded.")
            except (json.JSONDecodeError, ValueError) as e:
                print(f"❌ Invalid token format: {e}")
                self.creds = None
        else:
            self.creds = None
        try:
            self.service = build('classroom', 'v1', credentials=self.creds)
            print("✅ Service built.")
        except Exception as e:
            print(f"❌ Error building service: {e}")
            self.service = None
            
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

            
    def get_courses(self, limit=10):
        if not self.service:
            print("❌ Not logged in.")
            return {"error": "Not logged in"}

        results = self.service.courses().list(pageSize=limit).execute()
        courses = results.get('courses', [])

        if not courses:
            print("📭 No courses found.")
            return {"error": "No courses found"}

        return {"courses": courses}

    def get_assignments(self, course_id):
        if not self.service:
            print("❌ Not logged in.")
            return []

        try:
            # Fetch all coursework for the course
            response = self.service.courses().courseWork().list(courseId=course_id).execute()
            coursework = response.get("courseWork", [])

            result = []

            for work in coursework:
                course_work_id = work["id"]

                # Fetch the student's submission for this assignment
                submission_response = self.service.courses().courseWork().studentSubmissions().list(
                    courseId=course_id,
                    courseWorkId=course_work_id,
                    userId="me"
                ).execute()

                submissions = submission_response.get("studentSubmissions", [])
                submission_state = submissions[0]["state"] if submissions else "UNKNOWN"

                result.append({
                    "assignmentId": work.get("id", ""),
                    "title": work.get("title", ""),
                    "description": work.get("description", "No description given of {work.title}"),
                    "dueDate": work.get("dueDate", {}),
                    "dueTime": work.get("dueTime", {}),
                    "submissionState": submission_state
                })

            return result

        except Exception as e:
            print(f"❌ Failed to fetch assignments for course {course_id}: {e}")
            return None

    def get_user_name(self):
        if not self.service:
            print("❌ Not logged in.")
            return None
        profile = self.service.userProfiles().get(userId="me").execute()
        return profile["name"]["fullName"]
            
            
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
                # with open(self.token_path, 'w') as token_file:
                #     token_file.write(self.creds.to_json())

            self.service = build('classroom', 'v1', credentials=self.creds)
            print("✅ Login successful.")
            print("self.creds", self.creds)
            return {"token": self.creds.to_json()}
        except Exception as e:
            print(f"❌ Login failed: {e}")
            return {"error": "Login failed"}

    def get_courses(self, limit=100):
        if not self.service:
            print("❌ Not logged in.")
            return {"error": "Not logged in"}

        results = self.service.courses().list(
            pageSize=limit,
            courseStates=["ACTIVE"]
            ).execute()
        print("results", results)
        courses = results.get('courses', [])

        if not courses:
            print('No courses found.')
            return {"error": "No courses found"}
        else:
            print('Courses:')
            profile = self.service.userProfiles().get(userId="me").execute()
            current_user_id = profile["id"]

            courses = [course for course in courses if course.get("ownerId") != current_user_id]

            for course in courses:
                print(f"{course['name']} ({course['id']})")
                

        return {"courses": courses}


    def logout(self):
        self.creds = None
        self.service = None
        print("✅ Logout successful.")
            

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
