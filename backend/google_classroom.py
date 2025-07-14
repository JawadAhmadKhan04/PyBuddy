from __future__ import print_function
import os
from google.auth.transport.requests import Request
from google_auth_oauthlib.flow import InstalledAppFlow
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

class GoogleClassroomClient:
    def __init__(self, credentials_path='credentials.json', token_path='token.json'):
        self.credentials_path = credentials_path
        self.token_path = token_path
        self.scopes = ['https://www.googleapis.com/auth/classroom.courses.readonly']
        # Load token if it exists
        if os.path.exists(self.token_path):
            self.creds = Credentials.from_authorized_user_file(self.token_path, self.scopes)
            print("✅ Token loaded.")
        else:
            self.creds = None
        try:
            self.service = build('classroom', 'v1', credentials=self.creds)
            print("✅ Service built.")
        except Exception as e:
            print(f"❌ Error building service: {e}")
            self.service = None

    def login(self):
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
                flow = InstalledAppFlow.from_client_secrets_file(self.credentials_path, self.scopes)
                self.creds = flow.run_local_server(port=0)

            # Save the credentials
            with open(self.token_path, 'w') as token_file:
                token_file.write(self.creds.to_json())

        self.service = build('classroom', 'v1', credentials=self.creds)
        print("✅ Login successful.")

    def get_courses(self, limit=10):
        if not self.service:
            print("❌ Not logged in.")
            return {"error": "Not logged in"}

        results = self.service.courses().list(pageSize=limit).execute()
        courses = results.get('courses', [])

        if not courses:
            print('No courses found.')
            return {"error": "No courses found"}
        else:
            print('Courses:')
            for course in courses:
                print(f"{course['name']} ({course['id']})")

        return {"courses": courses}

    # Placeholder for future method
    def get_assignments(self, course_id):
        pass

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
#     choice = int(input("1. Login\n2. Get Courses\n3. Logout\n4. Exit\n"))
#     if choice == 1:
#         gcr.login()
#     elif choice == 2:
#         gcr.get_courses()
#     elif choice == 3:
#         gcr.logout()
#     elif choice == 4:
#         break
#     else:
#         print("Invalid choice.")
