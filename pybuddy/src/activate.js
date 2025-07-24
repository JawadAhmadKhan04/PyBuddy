const vscode = require('vscode');
const path = require('path');
const fs = require('fs');
const os = require('os');

const ChatProvider = require('./chatProvider');
const QuestionProvider = require('./questionProvider');
const ClassroomTreeProvider = require('./classroomTreeProvider');

const { handleLoginFlow, handleGenerateHints, handleShowHints, handleGenerateQuestions, handleAddApiKey, backendLogout, fetchGCRData, getUserName, submitAssignmentToGithub, loginWithGoogle, saveGithubCredentialsToBackend, deleteGithubCredentialsFromBackend, joinClassroomToBackend } = require('./backendHelpers');
const { openFolderInExplorer } = require('./fileHelpers');

/**
 * Transform backend GCR data to the tree structure expected by ClassroomTreeProvider.
 * @param {Array} gcrData
 * @returns {Array}
 */
function transformGCRDataToTree(gcrData) {
    return gcrData.map(course => ({
        label: course.courseName,
        courseId: course.courseId,
        children: [
            {
                label: 'Assignments',
                children: (course.assignments || []).map(assignment => ({
                    label: assignment.title,
                    description: assignment.description,
                    assignmentId: assignment.assignmentId,
                    dueDate: assignment.dueDate,
                    dueTime: assignment.dueTime,
                    submissionState: assignment.submissionState,
                    gradeInfo: assignment.gradeInfo 
                }))
            }
            // You can add Resources/People here if backend provides them
        ]
    }));
}

// Helper to set parent references on all nodes in the tree
function setParentReferences(tree, parent = null) {
    for (const node of tree) {
        node.parent = parent;
        if (node.children) {
            setParentReferences(node.children, node);
        }
    }
}

// Helper to find assignment node by folder name
function findAssignmentNode(tree, assignmentFolder) {
    for (const course of tree) {
        if (course.children) {
            for (const section of course.children) {
                if (section.label === 'Assignments' && section.children) {
                    for (const assignment of section.children) {
                        // Compare sanitized names
                        const safeLabel = assignment.label.replace(/[^a-zA-Z0-9-_ ]/g, '').replace(/ +/g, '_');
                        if (safeLabel === assignmentFolder) {
                            return assignment;
                        }
                    }
                }
            }
        }
    }
    return null;
}

// Global variable to store token.json contents as a string
let globalTokenJson = '';
try {
    const tokenPath = path.join(__dirname, 'token.json');
    if (fs.existsSync(tokenPath)) {
        globalTokenJson = fs.readFileSync(tokenPath, 'utf8');
        console.log('Loaded token.json into globalTokenJson');
        console.log(globalTokenJson);
    } else {
        console.log('token.json not found, globalTokenJson is empty');
    }
} catch (err) {
    console.error('Error reading token.json:', err);
    globalTokenJson = '';
}

function activate(context) {
	console.log('PyBuddy extension is now active!');

	const chatProvider = new ChatProvider(context.extensionUri);
	const questionProvider = new QuestionProvider(context.extensionUri);
    const classroomTreeProvider = new ClassroomTreeProvider();
    vscode.window.registerTreeDataProvider('pybuddy-classroom-tree', classroomTreeProvider);

	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider('pybuddy-chat', chatProvider),
		vscode.window.registerWebviewViewProvider('pybuddy-questions', questionProvider)
	);

	// Check login state on activation
	const wasLoggedIn = context.globalState.get('pybuddyLoggedIn', false);
	vscode.commands.executeCommand('setContext', 'pybuddyLoggedIn', wasLoggedIn);
    classroomTreeProvider.setLoggedIn(wasLoggedIn);
    // On activation, if logged in, open the relevant workspace and fetch GCR data
    if (wasLoggedIn) {
        (async () => {
            // Get username and build workspace path
            let userId = context.globalState.get('pybuddy.username', '');
            const safeUserId = userId.replace(/[^a-zA-Z0-9-_]/g, '_');
            const desktopPath = path.join(os.homedir(), 'Desktop');
            const gclFolder = path.join(desktopPath, `GoogleClassroomLocal_${safeUserId}`);
            const currentWorkspace = vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders[0].uri.fsPath;
            if (!currentWorkspace || path.resolve(currentWorkspace) !== path.resolve(gclFolder)) {
                try {
                    if (!fs.existsSync(gclFolder)) {
                        fs.mkdirSync(gclFolder, { recursive: true });
                    }
                    // Read README content from template file
                    const readmePath = path.join(gclFolder, 'README.md');
                    const templatePath = path.join(__dirname, '../README_workspace.md');
                    let readmeContent = '';
                    if (fs.existsSync(templatePath)) {
                        readmeContent = fs.readFileSync(templatePath, 'utf8');
                    }
                    if (readmeContent) {
                        fs.writeFileSync(readmePath, readmeContent);
                    }
                    const uri = vscode.Uri.file(gclFolder);
                    await vscode.commands.executeCommand('vscode.openFolder', uri, false);
                } catch (err) {
                    vscode.window.showErrorMessage('Failed to create or open GoogleClassroomLocal folder: ' + err.message);
                }
            }
            classroomTreeProvider.setLoading(true);
            const gcrData = await fetchGCRData(globalTokenJson);
            const treeData = transformGCRDataToTree(gcrData);
            setParentReferences(treeData);
            classroomTreeProvider.setData(treeData);
            classroomTreeProvider.setLoading(false);
        })();
    } else {
        classroomTreeProvider.setData([]);
	}

	// Get the addApiKey command function
	const addApiKeyCommand = handleAddApiKey(context);

	context.subscriptions.push(
        vscode.commands.registerCommand('pybuddy.refreshGCRData', async () => {
            classroomTreeProvider.setLoading(true);
            const gcrData = await fetchGCRData(globalTokenJson);
            const treeData = transformGCRDataToTree(gcrData);
            setParentReferences(treeData);
            classroomTreeProvider.setData(treeData);
            classroomTreeProvider.setLoading(false);
            vscode.window.showInformationMessage('Google Classroom data refreshed!');
            
        }),
		vscode.commands.registerCommand('pybuddy.login', async () => {
        try {
            const tokens = await loginWithGoogle();
            globalTokenJson = JSON.stringify(tokens);
            context.globalState.update('pybuddyLoggedIn', true);
            vscode.commands.executeCommand('setContext', 'pybuddyLoggedIn', true);
            classroomTreeProvider.setLoggedIn(true);
            classroomTreeProvider.setLoading(true);
            // Fetch username from backendHelpers
            let userId = '';
            try {
                userId = await getUserName(globalTokenJson);
            } catch (err) {
                vscode.window.showWarningMessage('Could not fetch user name, using default folder.');
            }
            context.globalState.update('pybuddy.username', userId);
            const safeUserId = userId.replace(/[^a-zA-Z0-9-_]/g, '_');
            const desktopPath = path.join(os.homedir(), 'Desktop');
            const gclFolder = path.join(desktopPath, `GoogleClassroomLocal_${safeUserId}`);
            const currentWorkspace = vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders[0].uri.fsPath;
            if (!currentWorkspace || path.resolve(currentWorkspace) !== path.resolve(gclFolder)) {
                try {
                    if (!fs.existsSync(gclFolder)) {
                        fs.mkdirSync(gclFolder, { recursive: true });
                    }
                    const readmePath = path.join(gclFolder, 'README.md');
                    // Read README content from template file
                    const templatePath = path.join(__dirname, '../README_workspace.md');
                    let readmeContent = '';
                    if (fs.existsSync(templatePath)) {
                        readmeContent = fs.readFileSync(templatePath, 'utf8');
                    }
                    if (readmeContent) {
                        fs.writeFileSync(readmePath, readmeContent);
                    }

                  
                    const uri = vscode.Uri.file(gclFolder);
                    vscode.commands.executeCommand('vscode.openFolder', uri, false);
                    return; // Stop further activation until reload
                } catch (err) {
                    vscode.window.showErrorMessage('Failed to create or open GoogleClassroomLocal folder: ' + err.message);
                    return;
                }
            }
            // Fetch GCR data from backend
            const gcrData = await fetchGCRData(globalTokenJson);
            const treeData = transformGCRDataToTree(gcrData);
            setParentReferences(treeData);
            classroomTreeProvider.setData(treeData);
            classroomTreeProvider.setLoading(false);
        } catch (err) {
            vscode.window.showErrorMessage('Google login failed: ' + err.message);
            context.globalState.update('pybuddyLoggedIn', false);
            vscode.commands.executeCommand('setContext', 'pybuddyLoggedIn', false);
            classroomTreeProvider.setLoggedIn(false);
            classroomTreeProvider.setData([]);
        }
    }),
		vscode.commands.registerCommand('pybuddy.logout', async () => {
			await backendLogout(globalTokenJson);
			context.globalState.update('pybuddyLoggedIn', false);
			vscode.commands.executeCommand('setContext', 'pybuddyLoggedIn', false);
            classroomTreeProvider.setLoggedIn(false);
            classroomTreeProvider.setData([]);
            context.globalState.update('pybuddy.username', '');
            // Reset the question and hints panels to default
            if (questionProvider._webviewView) {
                questionProvider._webviewView.webview.postMessage({ type: 'clearQuestions' });
            }
            if (chatProvider._webviewView) {
                chatProvider._webviewView.webview.postMessage({ type: 'clearChat' });
            }
		}),
        vscode.commands.registerCommand('pybuddy.addApiKey', addApiKeyCommand),
		vscode.commands.registerCommand('pybuddy.showHints', handleShowHints(chatProvider)),
		vscode.commands.registerCommand('pybuddy.clearHints', () => {
			if (chatProvider._webviewView) {
				chatProvider._webviewView.webview.postMessage({ type: 'clearChat' });
			}
		}),
		vscode.commands.registerCommand('pybuddy.showQuestions', handleGenerateQuestions(questionProvider)),
		vscode.commands.registerCommand('pybuddy.clearQuestions', () => {
			if (questionProvider._webviewView) {
				questionProvider._webviewView.webview.postMessage({ type: 'clearQuestions' });
			}

            if (questionProvider && questionProvider._webviewView) {
                questionProvider._webviewView.webview.onDidReceiveMessage(async (data) => {
            if (data.type === 'questionsCleared') {
                // Open README.md in the workspace folder
                let userId = context.globalState.get('pybuddy.username', '');
                const safeUserId = userId.replace(/[^a-zA-Z0-9-_]/g, '_');
                const desktopPath = path.join(os.homedir(), 'Desktop');
                const gclFolder = path.join(desktopPath, `GoogleClassroomLocal_${safeUserId}`);
                const readmePath = path.join(gclFolder, 'README.md');
                if (fs.existsSync(readmePath)) {
                    const readmeUri = vscode.Uri.file(readmePath);
                    // Update README.md with a dynamic message
                    await vscode.window.showTextDocument(readmeUri);
                }
                }
            });
        }


		}),
		vscode.commands.registerCommand('pybuddy.helloWorld', () => {
			vscode.window.showInformationMessage('Hello World from PyBuddy!');
		}),
        vscode.commands.registerCommand('pybuddy.setGithubCredentials', async () => {
            // Show dropdown menu
            const choice = await vscode.window.showQuickPick([
                { label: 'Enter GitHub credentials', value: 'enter' },
                { label: 'Delete GitHub credentials', value: 'delete' }
            ], {
                placeHolder: 'Manage your GitHub credentials',
                ignoreFocusOut: true
            });
            if (!choice) return;
            if (choice.value === 'enter') {
                // Prompt for GitHub username
                const username = await vscode.window.showInputBox({
                    prompt: 'Enter your GitHub username',
                    ignoreFocusOut: true
                });
                if (!username) {
                    vscode.window.showWarningMessage('GitHub username is required.');
                    return;
                }
                // Prompt for GitHub token (password input)
                const token = await vscode.window.showInputBox({
                    prompt: 'Enter your GitHub personal access token',
                    ignoreFocusOut: true,
                    password: true
                });
                if (!token) {
                    vscode.window.showWarningMessage('GitHub token is required.');
                    return;
                }
                // vscode.window.showInformationMessage('GitHub credentials saved!');
                // Send credentials to backend as well
                const pybuddyUsername = context.globalState.get('pybuddy.username', '');
                const result = await saveGithubCredentialsToBackend({
                    username: pybuddyUsername,
                    github_name: username,
                    github_token: token
                });
                if (result && result.message) {
                    vscode.window.showInformationMessage(result.message);
                } else if (result && result.error) {
                    vscode.window.showErrorMessage('Failed to save GitHub credentials to backend: ' + result.error);
                }
            } else if (choice.value === 'delete') {
                // Call backend to delete GitHub credentials
                const pybuddyUsername = context.globalState.get('pybuddy.username', '');
                if (!pybuddyUsername) {
                    vscode.window.showWarningMessage('No username found. Please log in first.');
                    return;
                }
                const result = await deleteGithubCredentialsFromBackend(pybuddyUsername);
                if (result && result.message) {
                    vscode.window.showInformationMessage(result.message);
                } else if (result && result.error) {
                    vscode.window.showErrorMessage('Failed to delete GitHub credentials: ' + result.error);
                } else {
                    vscode.window.showErrorMessage('Failed to delete GitHub credentials.');
                }
            }
        }),
        vscode.commands.registerCommand('pybuddy.joinClassroom', async () => {
            const choice = await vscode.window.showQuickPick(
                [
                    { label: 'Enter Link', value: 'link' },
                    { label: 'Enter Codes', value: 'codes' }
                ],
                { placeHolder: 'How do you want to join the classroom?', ignoreFocusOut: true }
            );
            if (!choice) return;

            // Prepare payload
            let payload = {
                course_id: '',
                enrollment_code: '',
                info: globalTokenJson
            };

            if (choice.value === 'link') {
                const link = await vscode.window.showInputBox({
                    prompt: 'Enter the Google Classroom joining link',
                    ignoreFocusOut: true
                });
                if (!link) {
                    vscode.window.showWarningMessage('Joining link is required.');
                    return;
                }
                // Extract course_id and enrollment_code from the link
                const courseIdMatch = link.match(/\/c\/([^/?]+)/);
                const enrollmentCodeMatch = link.match(/[?&]cjc=([^&]+)/);
                if (!courseIdMatch || !enrollmentCodeMatch) {
                    vscode.window.showWarningMessage('Invalid Google Classroom link format.');
                    return;
                }
                payload.course_id = courseIdMatch[1];
                payload.enrollment_code = enrollmentCodeMatch[1];
            } else if (choice.value === 'codes') {
                const courseId = await vscode.window.showInputBox({
                    prompt: 'Enter the Course ID',
                    ignoreFocusOut: true
                });
                if (!courseId) {
                    vscode.window.showWarningMessage('Course ID is required.');
                    return;
                }
                const enrollmentCode = await vscode.window.showInputBox({
                    prompt: 'Enter the Enrollment Code',
                    ignoreFocusOut: true
                });
                if (!enrollmentCode) {
                    vscode.window.showWarningMessage('Enrollment code is required.');
                    return;
                }
                payload.course_id = courseId;
                payload.enrollment_code = enrollmentCode;
            }

            // Call backend once with the prepared payload
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: 'Joining classroom...',
                cancellable: false
            }, async () => {
                const result = await joinClassroomToBackend(payload);
                if (result.error) {
                    vscode.window.showErrorMessage("Failed to join course");
                } else {
                    // Refresh Google Classroom data
                    classroomTreeProvider.setLoading(true);
                    const gcrData = await fetchGCRData(globalTokenJson);
                    const treeData = transformGCRDataToTree(gcrData);
                    setParentReferences(treeData);
                    classroomTreeProvider.setData(treeData);
                    classroomTreeProvider.setLoading(false);
                    vscode.window.showInformationMessage('Course joined');
                }
            });
        }),
	);

    let currentAssignmentNode = null;
    let currentAssignmentDescription = null;

    // Register the command only once
    context.subscriptions.push(
        vscode.commands.registerCommand('pybuddy.showAssignmentDescription', (node) => {
            if (questionProvider && questionProvider._webviewView && node && node.label) {
                questionProvider._webviewView.webview.currentAssignmentLabel = node.label;
                currentAssignmentNode = node;
                currentAssignmentDescription = node.description; // Store description for hint generation
            }
            if (node && node.description !== undefined) {
                // Log the submissionState for debugging
                console.log('Assignment name: ', node.label, 'submissionState:', node.submissionState);
                let firstLine = '';
                // console.log(node.dueDate);
                // console.log(node.dueTime);
                if (!node.dueDate || !node.dueTime || 
                !node.dueDate.year || !node.dueDate.month || !node.dueDate.day ||
                !node.dueTime.hours || !node.dueTime.minutes) {
                    firstLine = '<span style="color: orange; font-weight: bold;">Due date is not mentioned</span>';
                } else {
                    // Compose a JS Date object from dueDate and dueTime
                    const due = new Date(
                        (node.dueDate?.year ?? 2050),
                        (node.dueDate?.month ?? 1) - 1, // Default to February (1), JS months are 0-based
                        (node.dueDate?.day ?? 1),
                        (node.dueTime?.hours ?? 23),
                        (node.dueTime?.minutes ?? 59)
                    );
                    
                    const now = new Date();
                    if (now > due) {
                        firstLine = '<span style="color: red; font-weight: bold;">Due date has passed</span>';
                    } else {
                        // Format as 'Due: YYYY-MM-DD HH:MM'
                        const pad = n => n.toString().padStart(2, '0');
                        const dateStr = `${due.getFullYear()}-${pad(due.getMonth()+1)}-${pad(due.getDate())}`;
                        const timeStr = `${pad(due.getHours())}:${pad(due.getMinutes())}`;
                        firstLine = `<span style="font-weight: bold;">Due: ${dateStr} ${timeStr}</span>`;
                    }
                }
                let secondLine = '';
                if (node.submissionState === 'TURNED_IN') {
                    secondLine = '<span style="color: green; font-weight: bold;">Already submitted</span>';
                }
                if (node.submissionState === 'RETURNED') {
                secondLine = '<span style="color: blue; font-weight: bold;">Evaluated</span>';
                
                // Add grade information if available
                if (node.gradeInfo && node.gradeInfo.assignedGrade !== undefined) {
                    const maxPoints = node.gradeInfo.maxPoints || '?';
                    secondLine += `<br><span style="font-weight: bold; color: blue;">Grade: ${node.gradeInfo.assignedGrade}/${maxPoints}`;
                }
            }
                let content = node.description;
                if (firstLine) {
                    content = `${firstLine}${secondLine ? '<br>' + secondLine : ''}<br><br>${content}`;
                }
                // Check if the assignment folder/file exists
                let showStart = true;
                let canStartOrSubmit = true;
                try {
                    let courseName = 'UnknownCourse';
                    if (node.parent && node.parent.parent) {
                        courseName = node.parent.parent.label;
                    }
                    const safeCourseName = courseName.replace(/[^a-zA-Z0-9-_ ]/g, '').replace(/ +/g, '_');
                    const safeAssignmentName = node.label.replace(/[^a-zA-Z0-9-_ ]/g, '').replace(/ +/g, '_');
                    const desktopPath = path.join(os.homedir(), 'Desktop');
                    // Try to find the GoogleClassroomLocal folder for the current user
                    const workspaceRoot = vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders[0].uri.fsPath;
                    let gclFolder = workspaceRoot;
                    // If not in the expected folder, fallback to Desktop
                    if (!gclFolder || !gclFolder.includes('GoogleClassroomLocal')) {
                        gclFolder = desktopPath;
                    }
                    const mainPyPath = path.join(gclFolder, safeCourseName, safeAssignmentName, 'main.py');
                    if (fs.existsSync(mainPyPath)) {
                        showStart = false;
                    }
                    if (node.submissionState === 'TURNED_IN') {
                        canStartOrSubmit = false;
                    }
                } catch (err) {
                    // If any error, default to showStart = true
                }
                if (questionProvider._webviewView) {
                    questionProvider._webviewView.webview.postMessage({
                        type: 'showAssignmentDescription',
                        content: content,
                        showStart: showStart,
                        canStartOrSubmit: canStartOrSubmit
                    });
                } else {
                    vscode.window.showInformationMessage(node.description);
                }
            }
        })
    );

    // Register the generateHints command to always use the latest assignment description
    context.subscriptions.push(
        vscode.commands.registerCommand('pybuddy.generateHints', async () => {
            // Only allow generating hints if assignment has been started
            const editor = vscode.window.activeTextEditor;
            if (editor && editor.document && editor.document.fileName.toLowerCase().endsWith('readme.md')) {
                vscode.window.showInformationMessage('Open the file of the question');
                return;
            }
            // Prevent hints if no question is present
            if (!currentAssignmentDescription || currentAssignmentDescription.trim() === '') {
                vscode.window.showInformationMessage('No question is present for this assignment. Cannot generate hints.');
                return;
            }
            // Automatically open/focus the hints (chat) view
            await vscode.commands.executeCommand('pybuddy-chat.focus');
            if (currentAssignmentNode) {
                let courseName = 'UnknownCourse';
                if (currentAssignmentNode.parent && currentAssignmentNode.parent.parent) {
                    courseName = currentAssignmentNode.parent.parent.label;
                } else if (currentAssignmentNode.courseName) {
                    courseName = currentAssignmentNode.courseName;
                }
                const safeCourseName = courseName.replace(/[^a-zA-Z0-9-_ ]/g, '').replace(/ +/g, '_');
                const safeAssignmentName = currentAssignmentNode.label.replace(/[^a-zA-Z0-9-_ ]/g, '').replace(/ +/g, '_');
                const workspaceRoot = vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders[0].uri.fsPath;
                const assignmentFolder = path.join(workspaceRoot, safeCourseName, safeAssignmentName);
                const mainPyPath = path.join(assignmentFolder, 'main.py');
                if (!fs.existsSync(mainPyPath)) {
                    vscode.window.showErrorMessage('You must start the assignment before generating hints.');
                    return;
                }
            }
            handleGenerateHints(chatProvider, context)(currentAssignmentDescription);
        })
    );

    // Register the onDidReceiveMessage handler ONCE
    async function handleAssignmentWebviewMessage(msg) {
        if (msg.type === 'startAssignment' && currentAssignmentNode) {
            // Create the folder inside the workspace root (parallel to backend)
            const workspaceRoot = vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders[0].uri.fsPath;
            if (!workspaceRoot) {
                vscode.window.showErrorMessage('No workspace is open.');
                return;
            }
            // Find course name from the parent node of the assignment
            let courseName = 'UnknownCourse';
            if (currentAssignmentNode && currentAssignmentNode.parent && currentAssignmentNode.parent.parent) {
                courseName = currentAssignmentNode.parent.parent.label;
            } else if (currentAssignmentNode && currentAssignmentNode.courseName) {
                courseName = currentAssignmentNode.courseName;
            }
            // Fallback: try to extract from nodeData if available
            if (currentAssignmentNode.nodeData && currentAssignmentNode.nodeData.courseName) {
                courseName = currentAssignmentNode.nodeData.courseName;
            }
            // Sanitize folder names
            const safeCourseName = courseName.replace(/[^a-zA-Z0-9-_ ]/g, '').replace(/ +/g, '_');
            const safeAssignmentName = currentAssignmentNode.label.replace(/[^a-zA-Z0-9-_ ]/g, '').replace(/ +/g, '_');
            const assignmentFolder = path.join(workspaceRoot, safeCourseName, safeAssignmentName);
            try {
                if (!fs.existsSync(assignmentFolder)) {
                    fs.mkdirSync(assignmentFolder, { recursive: true });
                } else {
                    vscode.window.showInformationMessage(`Folder already exists: ${assignmentFolder}`);
                }
                // Create main.py inside the assignment folder
                const mainPyPath = path.join(assignmentFolder, 'main.py');
                if (!fs.existsSync(mainPyPath)) {
                    fs.writeFileSync(mainPyPath, '');
                }
                // Open main.py in the editor
                const mainPyUri = vscode.Uri.file(mainPyPath);
                vscode.window.showTextDocument(mainPyUri);
            } catch (err) {
                vscode.window.showErrorMessage(`Failed to create folder or file: ${err.message}`);
            }
            vscode.window.showInformationMessage(currentAssignmentNode.label || 'Assignment started!');
            if (questionProvider && questionProvider._webviewView) {
                questionProvider._webviewView.webview.postMessage({ type: 'swapToSubmitButton' });
            }
        }
        if (msg.type === 'submitAssignment') {
            let courseId = 'Unknown';
            let assignmentId = 'Unknown';
            let assignmentTitle = 'Unknown';
            if (currentAssignmentNode) {
                assignmentId = currentAssignmentNode.assignmentId || 'Unknown';
                assignmentTitle = currentAssignmentNode.label || 'Unknown';
                // Traverse up to find the course node
                let courseNode = currentAssignmentNode.parent && currentAssignmentNode.parent.parent;
                if (courseNode && courseNode.nodeData && courseNode.nodeData.courseId) {
                    courseId = courseNode.nodeData.courseId;
                } else if (courseNode && courseNode.label) {
                    // Fallback: try to find courseId from nodeData if available
                    courseId = courseNode.courseId || courseNode.label || 'Unknown';
                }
            }
            // Prompt for repo name
            const repoName = await vscode.window.showInputBox({
                prompt: 'Enter the GitHub repository name to push to',
                ignoreFocusOut: true
            });
            if (!repoName) {
                vscode.window.showWarningMessage('Repository name is required.');
                return;
            }
            // Collect all code files in the assignment folder
            let codeFiles = {};
            if (currentAssignmentNode) {
                let courseName = 'UnknownCourse';
                if (currentAssignmentNode.parent && currentAssignmentNode.parent.parent) {
                    courseName = currentAssignmentNode.parent.parent.label;
                } else if (currentAssignmentNode.courseName) {
                    courseName = currentAssignmentNode.courseName;
                }
                const safeCourseName = courseName.replace(/[^a-zA-Z0-9-_ ]/g, '').replace(/ +/g, '_');
                const safeAssignmentName = currentAssignmentNode.label.replace(/[^a-zA-Z0-9-_ ]/g, '').replace(/ +/g, '_');
                const workspaceRoot = vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders[0].uri.fsPath;
                const assignmentFolder = path.join(workspaceRoot, safeCourseName, safeAssignmentName);
                if (fs.existsSync(assignmentFolder)) {
                    const files = fs.readdirSync(assignmentFolder);
                    for (const file of files) {
                        const filePath = path.join(assignmentFolder, file);
                        if (fs.statSync(filePath).isFile()) {
                            codeFiles[file] = fs.readFileSync(filePath, 'utf8');
                        }
                    }
                }
            }
            // Disable the submit button in the question panel
            if (questionProvider && questionProvider._webviewView) {
                questionProvider._webviewView.webview.postMessage({ type: 'disableSubmitButton' });
            }
            const confirm = await vscode.window.showWarningMessage(
                'Are you sure you want to submit? You will not be allowed to submit again.',
                { modal: true },
                'Submit',
                'Cancel'
            );
            if (confirm !== 'Submit') {
                vscode.window.showInformationMessage('Submission cancelled.');
                // Re-enable the submit button if cancelled
                if (questionProvider && questionProvider._webviewView) {
                    questionProvider._webviewView.webview.postMessage({ type: 'enableSubmitButton' });
                }
                return;
            }
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: 'Submitting ...',
                cancellable: false
            }, async (progress) => {
                const username = context.globalState.get('pybuddy.username', '');
                const result = await submitAssignmentToGithub({
                    username: username,
                    repo_name: repoName,
                    course_id: courseId,
                    assignment_id: assignmentId,
                    code_files: codeFiles,
                    info: globalTokenJson
                });
                if (result && result.error) {
                    let userMessage = result.error;
                    // Friendly error mapping
                    if (userMessage.includes('401')) {
                        userMessage = 'Authentication failed: Your GitHub credentials are missing, invalid, or expired. Please update your credentials.';
                    } else if (userMessage.includes('403')) {
                        userMessage = 'Permission denied: Your GitHub token does not have permission to perform this action.';
                    } else if (userMessage.includes('422')) {
                        userMessage = 'Validation error: The repository or file data is invalid or already exists.';
                    } else if (userMessage.toLowerCase().includes('not found')) {
                        userMessage = 'Resource not found: The requested repository or file could not be found.';
                    } else if (userMessage.toLowerCase().includes('server error')) {
                        userMessage = 'Server error: There was a problem with the server. Please try again later.';
                    }
                    vscode.window.showErrorMessage(`GitHub Submission Failed: ${userMessage}`);
                    // Re-enable the submit button on failure
                    if (questionProvider && questionProvider._webviewView) {
                        questionProvider._webviewView.webview.postMessage({ type: 'enableSubmitButton' });
                    }
                } else if (result && result.message) {
                    // vscode.window.showInformationMessage(`Assignment submitted! ${result.message}`);
                    // Automatically refresh GCR data
                    classroomTreeProvider.setLoading(true);
                                // Also clear the question panel so it shows the default message
                    if (questionProvider && questionProvider._webviewView) {
                        questionProvider._webviewView.webview.postMessage({ type: 'clearQuestions' });
                    }
                    const gcrData = await fetchGCRData(globalTokenJson);
                    const treeData = transformGCRDataToTree(gcrData);
                    setParentReferences(treeData);
                    classroomTreeProvider.setData(treeData);
                    classroomTreeProvider.setLoading(false);
                    // Keep submit button disabled on success
                } else {
                    vscode.window.showErrorMessage('Unknown error occurred during submission.');
                    // Re-enable the submit button on failure
                    if (questionProvider && questionProvider._webviewView) {
                        questionProvider._webviewView.webview.postMessage({ type: 'enableSubmitButton' });
                    }
                }
            });
        }
    }

    // Attach the handler ONCE when the webview is available
    function attachWebviewHandler() {
        if (questionProvider && questionProvider._webviewView && !questionProvider._webviewView.webview._assignmentHandlerAttached) {
            questionProvider._webviewView.webview.onDidReceiveMessage(handleAssignmentWebviewMessage);
            questionProvider._webviewView.webview._assignmentHandlerAttached = true;
        }
    }

    // Try to attach immediately, and also on webview view resolve
    attachWebviewHandler();
    if (questionProvider && questionProvider.resolveWebviewView) {
        const origResolve = questionProvider.resolveWebviewView.bind(questionProvider);
        questionProvider.resolveWebviewView = function(webviewView) {
            origResolve(webviewView);
            attachWebviewHandler();
        };
    }

	vscode.window.onDidChangeActiveTextEditor(async (editor) => {
		if (editor && editor.document && editor.document.languageId === 'python') {
            const filePath = editor.document.uri.fsPath;
            const pathParts = filePath.split(/[\\/]/);
            const assignmentFolder = pathParts.length > 1 ? pathParts[pathParts.length - 2] : '';
            const treeData = classroomTreeProvider.data;
            const assignmentNode = findAssignmentNode(treeData, assignmentFolder);
            if (assignmentNode) {
                // Reveal in tree (if supported)
                try {
                    await vscode.commands.executeCommand('pybuddy-classroom-tree.reveal', assignmentNode);
                } catch (e) {
                    // Not all tree providers support reveal, so ignore errors
                }
                // Show question in panel
                vscode.commands.executeCommand('pybuddy.showAssignmentDescription', assignmentNode);
            }
            // Show only the hints for the current file
            handleShowHints(chatProvider)();
        }
	});

    // Register a command to handle assignment selection from the tree and open the corresponding file in the Explorer
    context.subscriptions.push(
        vscode.commands.registerCommand('pybuddy.openAssignmentFile', async (assignmentNode) => {
            // Find the course name
            let courseName = 'UnknownCourse';
            if (assignmentNode && assignmentNode.parent && assignmentNode.parent.parent) {
                courseName = assignmentNode.parent.parent.label;
            }
            const safeCourseName = courseName.replace(/[^a-zA-Z0-9-_ ]/g, '').replace(/ +/g, '_');
            const safeAssignmentName = assignmentNode.label.replace(/[^a-zA-Z0-9-_ ]/g, '').replace(/ +/g, '_');

            // Fetch username from backendHelpers
            let userId = context.globalState.get('pybuddy.username', '');
            
            const safeUserId = userId.replace(/[^a-zA-Z0-9-_]/g, '_');
            const desktopPath = path.join(os.homedir(), 'Desktop');
            const gclFolder = path.join(desktopPath, `GoogleClassroomLocal_${safeUserId}`);

            const mainPyPath = path.join(gclFolder, safeCourseName, safeAssignmentName, 'main.py');
            if (fs.existsSync(mainPyPath)) {
                const mainPyUri = vscode.Uri.file(mainPyPath);
                await vscode.window.showTextDocument(mainPyUri);
            } else {
                vscode.window.showWarningMessage("You haven't started this assignment yet.");
                // Clear hints when assignment hasn't been started
                if (chatProvider && chatProvider._webviewView) {
                    chatProvider._webviewView.webview.postMessage({ type: 'clearChat' });
                }
                // Open README.md in the workspace folder
                const readmePath = path.join(gclFolder, 'README.md');
                if (fs.existsSync(readmePath)) {
                    const readmeUri = vscode.Uri.file(readmePath);
                    await vscode.window.showTextDocument(readmeUri);
                }
            }
            // Also show the question panel for this assignment
            vscode.commands.executeCommand('pybuddy.showAssignmentDescription', assignmentNode);
        })
    );

}

module.exports = { activate };
