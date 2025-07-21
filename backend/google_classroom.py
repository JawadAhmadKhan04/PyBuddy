from __future__ import print_function
from google.auth.transport.requests import Request
from google_auth_oauthlib.flow import InstalledAppFlow
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

class GoogleClassroomClient:
    def __init__(self, info: str):
        # self.credentials_path = credentials_path
        # self.token_path = token_path
        
        self.SCOPES = [
    "https://www.googleapis.com/auth/classroom.courses.readonly",                  # Read course metadata
    "https://www.googleapis.com/auth/classroom.rosters",
    "https://www.googleapis.com/auth/classroom.coursework.me"
]
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
            
    def submit_to_classroom(self, course_id: str, assignment_id: str, link: str) -> dict:
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
                        "link": {
                            "url": link
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

            
    # def get_courses(self, limit=100):
    #     if not self.service:
    #         print("❌ Not logged in.")
    #         return {"error": "Not logged in"}

    #     results = self.service.courses().list(pageSize=limit).execute()
    #     courses = results.get('courses', [])

    #     if not courses:
    #         print("📭 No courses found.")
    #         return {"error": "No courses found"}

    #     return {"courses": courses}


# from concurrent.futures import ThreadPoolExecutor, as_completed

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



    # def get_assignments(self, course_id):
    #     if not self.service:
    #         print("❌ Not logged in.")
    #         return []

    #     try:
    #         response = self.service.courses().courseWork().list(courseId=course_id).execute()
    #         coursework = response.get("courseWork", [])
    #         result = []

    #         def fetch_submission(work):
    #             course_work_id = work["id"]
    #             try:
    #                 submission_response = self.service.courses().courseWork().studentSubmissions().list(
    #                     courseId=course_id,
    #                     courseWorkId=course_work_id,
    #                     userId="me"
    #                 ).execute()

    #                 submissions = submission_response.get("studentSubmissions", [])
    #                 submission_state = submissions[0]["state"] if submissions else "UNKNOWN"

    #                 return {
    #                     "assignmentId": work.get("id", ""),
    #                     "title": work.get("title", ""),
    #                     "description": work.get("description", f"No description given for {work.get('title', '')}"),
    #                     "dueDate": work.get("dueDate", {}),
    #                     "dueTime": work.get("dueTime", {}),
    #                     "submissionState": submission_state
    #                 }
    #             except Exception as e:
    #                 print(f"❌ Error fetching submission for coursework {course_work_id}: {e}")
    #                 return None

    #         with ThreadPoolExecutor(max_workers=10) as executor:
    #             futures = [executor.submit(fetch_submission, work) for work in coursework]
    #             for future in as_completed(futures):
    #                 res = future.result()
    #                 if res:
    #                     result.append(res)

    #         print("result", result)
    #         return result

    #     except Exception as e:
    #         print(f"❌ Failed to fetch assignments for course {course_id}: {e}")
    #         return None


    def get_user_name(self):
        if not self.service:
            print("❌ Not logged in.")
            return None
        profile = self.service.userProfiles().get(userId="me").execute()
        return profile["name"]["fullName"]
            
            
    # def extract_course_id(self, classroom_url):
    #     match = re.search(r'/c/([a-zA-Z0-9]+)', classroom_url)
    #     if match:
    #         return match.group(1)
    #     else:
    #         raise ValueError("Invalid Google Classroom URL. Course ID not found.")
        
    # def join_course(self, classroom_url = None, course_id = None):
    #     if not self.service:
    #         print("❌ Not logged in.")
    #         return {"error": "Not logged in"}
    #     try:
    #         if classroom_url:
    #             course_id = self.extract_course_id(classroom_url)
    #         print(f"✅ Joining course with ID: {course_id}")
    #         self.service.courses().students().create(
    #         courseId=course_id,
    #         body={"userId": "me"}
    #     ).execute()
    #         print(f"✅ Successfully joined course with ID: {course_id}")
    #     except Exception as e:
    #         print(f"❌ Failed to join course: {e}")


    # def login(self):
    #     try:
    #         if self.creds and self.creds.valid:
    #             print("✅ Already logged in.")
    #             return

    #         # If credentials are not valid, perform login
    #         if not self.creds or not self.creds.valid:
    #             if self.creds and self.creds.expired and self.creds.refresh_token:
    #                 self.creds.refresh(Request())
    #             else:
    #                 if not os.path.exists(self.credentials_path):
    #                     print("❌ credentials.json not found.")
    #                     return
    #                 flow = InstalledAppFlow.from_client_secrets_file(self.credentials_path, self.SCOPES)
    #                 print("flow", flow)
    #                 self.creds = flow.run_local_server(port=0)
    #                 print("self.creds", self.creds)

    #             # Save the credentials
    #             with open(self.token_path, 'w') as token_file:
    #                 token_file.write(self.creds.to_json())

    #         print("self.creds", self.creds)
    #         self.service = build('classroom', 'v1', credentials=self.creds)
    #         print("✅ Login successful.")
    #     except Exception as e:
    #         print(f"❌ Login failed: {e}")

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

            # for course in courses:
            #     print(f"{course['name']} ({course['id']})")
            print('Courses DONE')
                

        return {"courses": courses}


    def logout(self):
        # if os.path.exists(self.token_path):
        #     os.remove(self.token_path)
        self.creds = None
        self.service = None
        #     print("✅ Logged out and token removed.")
        # else:
        #     print("No token file to delete.")


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
