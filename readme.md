# PyBuddy: Google Classroom Assistant for VS Code


PyBuddy is a powerful Visual Studio Code extension that connects with Google Classroom, manages assignments, integrates GitHub for submissions, and provides intelligent AI-powered hints to enhance your learning experience — all from within your coding environment.

## Features

### Authentication
- Secure login to Google Classroom using OAuth
- Login button appears when not authenticated
- Logout button appears when authenticated
- Successful login opens confirmation tab with message:  
  "Your authentication is complete. You may close the tab."

### GoogleClassroom Panel

Collapsible sidebar showing:
- All enrolled courses
- Expandable course assignments
- Click assignments to view questions in Questions panel

**Toolbar Buttons:**

| Button | Action |
|--------|--------|
| ➕ | Join a Google Classroom |
|  <img src="https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png" width="16" height="16">| Add/Delete GitHub credentials |
| 🔁 | Refresh Classroom data |
| 🔑 | Add Google GenAI API key |
| Login/Logout | Login/Logout GCR|

### Questions Panel
Displays assignment details:
- 🟧 No Due date/time
- 🟩 Submitted Assignments
- 🟥 Missed assignments
- 🟦 Evaluated assignments
- Full question description

**Actions:**
- **Start**: Initializes assignment and creates local folder
- **Hint (💡)**: Generates contextual AI hints
  - Auto-saves code before hint generation
  - Maintains question-specific hint history

## Installation

### Prerequisites
- Visual Studio Code
- Python 3.x
- Redis server

### Setup Steps
## 1. Start Redis Server (Windows Only)
⚠️ Must be run using PowerShell as Administrator

    cd ..
    cd ..
    cd '.\Program Files\Redis\'
    ./redis-server.exe redis.windows.conf
Redis will run in the background to support real-time hint generation and assignment state tracking and saving.

## 2. Run backend server
The backend server is started using the following commands (in cmd or any terminal):-
   ```
C:\Users\Shekhani Laptops>cd PyBuddy3
C:\Users\Shekhani Laptops\PyBuddy3>cd backend
C:\Users\Shekhani Laptops\PyBuddy3\backend>pip install -r requirements.txt
C:\Users\Shekhani Laptops\PyBuddy3\backend>uvicorn main:app --reload
```
### Note:- You must open this in your own C drive and users folder where their is python terminal
## 3. Ngrok server 
To start the ngrok deployment server you need to first 
1. Install ngrok from their website https://ngrok.com
2. Installing according to their step by step procedure.
3. After installing start the ngrok server and write the command mentioned.
```
C:\Users\Shekhani Laptops\Desktop>ngrok http 8000 
```
4. Now your ngrok server has started
5. Now copy the link and paste it in your interface
It will be something like this:-
```
Web Interface                 http://127.0.0.1:4040                                                                         Forwarding                    https://d817a170a930.ngrok-free.app -> http://localhost:8000  
```
6. Now you can easily run your extension as the server is activated
### Note:- Keep in mind that your redis server must be activated.
### Note:- You must open this in your own C drive and users folder where their is python terminal
