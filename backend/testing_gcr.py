from __future__ import print_function
import os.path
import google.auth.exceptions
from google.auth.transport.requests import Request
from google_auth_oauthlib.flow import InstalledAppFlow
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

# If modifying scopes, delete token.json
SCOPES = ['https://www.googleapis.com/auth/classroom.courses.readonly']

def main():
    creds = None

    # Load token if it exists
    if os.path.exists('token.json'):
        creds = Credentials.from_authorized_user_file('token.json', SCOPES)

    # If no valid credentials, go through OAuth flow
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            try:
                flow = InstalledAppFlow.from_client_secrets_file('credentials.json', SCOPES)
                creds = flow.run_local_server(port=0)
            except FileNotFoundError:
                print("❌ credentials.json not found.")
                return

        # Save the credentials
        with open('token.json', 'w') as token:
            token.write(creds.to_json())

    # Access GCR API
    service = build('classroom', 'v1', credentials=creds)

    # List the first 10 courses
    results = service.courses().list(pageSize=10).execute()
    courses = results.get('courses', [])

    if not courses:
        print('No courses found.')
    else:
        print('Courses:')
        for course in courses:
            print(f"{course['name']} ({course['id']})")

if __name__ == '__main__':
    main()
