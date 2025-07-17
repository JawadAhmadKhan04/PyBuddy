const vscode = require('vscode');
const path = require('path');
const fs = require('fs');
const os = require('os');

const ChatProvider = require('./chatProvider');
const QuestionProvider = require('./questionProvider');
const ClassroomTreeProvider = require('./classroomTreeProvider');

const { handleLoginFlow, handleGenerateHints, handleShowHints, handleGenerateQuestions, handleAddApiKey, backendLogin, backendLogout, fetchGCRData, getUserName, checkStartupAuth } = require('./backendHelpers');
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
                    submissionState: assignment.submissionState
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

		// Check authentication state on activation using backend
	(async () => {
		try {
			// Read token file if it exists, otherwise use empty string
			let tokenContent = "";
			const tokenPath = path.join(__dirname, '..', '..', 'backend', 'token.json');
			if (fs.existsSync(tokenPath)) {
				tokenContent = fs.readFileSync(tokenPath, 'utf-8');
			}
			
			// Call the checkStartupAuth function to validate authentication
			const authResult = await checkStartupAuth(tokenContent);
			
			// Update global state and UI based on backend response
			context.globalState.update('pybuddyLoggedIn', authResult.authenticated);
			vscode.commands.executeCommand('setContext', 'pybuddyLoggedIn', authResult.authenticated);
			classroomTreeProvider.setLoggedIn(authResult.authenticated);
			
			if (authResult.authenticated) {
				// Fetch GCR data if authenticated
				classroomTreeProvider.setLoading(true);
				try {
					const gcrData = await fetchGCRData();
					const treeData = transformGCRDataToTree(gcrData);
					setParentReferences(treeData);
					classroomTreeProvider.setData(treeData);
				} catch (error) {
					console.error('Failed to fetch GCR data:', error.message);
					vscode.window.showWarningMessage('Failed to fetch Google Classroom data');
				} finally {
					classroomTreeProvider.setLoading(false);
				}
			} else {
				// Clear data if not authenticated
				classroomTreeProvider.setData([]);
				if (authResult.error) {
					console.log('Authentication error:', authResult.error);
				}
			}
		} catch (error) {
			console.error('Failed to validate authentication:', error.message);
			// Fallback to not logged in state
			context.globalState.update('pybuddyLoggedIn', false);
			vscode.commands.executeCommand('setContext', 'pybuddyLoggedIn', false);
			classroomTreeProvider.setLoggedIn(false);
			classroomTreeProvider.setData([]);
		}
	})();

	// Get the addApiKey command function
	const addApiKeyCommand = handleAddApiKey(context);

	context.subscriptions.push(
        vscode.commands.registerCommand('pybuddy.refreshGCRData', async () => {
            classroomTreeProvider.setLoading(true);
            const gcrData = await fetchGCRData();
            const treeData = transformGCRDataToTree(gcrData);
            setParentReferences(treeData);
            classroomTreeProvider.setData(treeData);
            classroomTreeProvider.setLoading(false);
            vscode.window.showInformationMessage('Google Classroom data refreshed!');
        }),
		vscode.commands.registerCommand('pybuddy.login', async () => {
            
			const loginResponse = await backendLogin();
			console.log(loginResponse);
			// Save token to file if login was successful
			if (loginResponse && loginResponse.token) {
				const tokenPath = path.join(__dirname, '..', '..', 'backend', 'token.json');
				try {
					fs.writeFileSync(tokenPath, loginResponse.token);
					console.log('Token file created successfully');
				} catch (err) {
					console.error('Failed to create token file:', err.message);
					vscode.window.showErrorMessage('Failed to save authentication token: ' + err.message);
				}
			}
			
			context.globalState.update('pybuddyLoggedIn', true);
			vscode.commands.executeCommand('setContext', 'pybuddyLoggedIn', true);
            classroomTreeProvider.setLoggedIn(true);
            classroomTreeProvider.setLoading(true);

            // Fetch username from backendHelpers
            let userId = 'user';
            try {
                userId = await getUserName();
            } catch (err) {
                vscode.window.showWarningMessage('Could not fetch user name, using default folder.');
            }
            const safeUserId = userId.replace(/[^a-zA-Z0-9-_]/g, '_');
            const desktopPath = path.join(os.homedir(), 'Desktop');
            const gclFolder = path.join(desktopPath, `GoogleClassroomLocal_${safeUserId}`);
            const currentWorkspace = vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders[0].uri.fsPath;
            if (!currentWorkspace || path.resolve(currentWorkspace) !== path.resolve(gclFolder)) {
                try {
                    if (!fs.existsSync(gclFolder)) {
                        fs.mkdirSync(gclFolder, { recursive: true });
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
            const gcrData = await fetchGCRData();
            const treeData = transformGCRDataToTree(gcrData);
            setParentReferences(treeData);
            classroomTreeProvider.setData(treeData);
            classroomTreeProvider.setLoading(false);
		}),
		vscode.commands.registerCommand('pybuddy.logout', async () => {
			await backendLogout();
			
			// Delete token.json file if it exists
			const tokenPath = path.join(__dirname, '..', '..', 'backend', 'token.json');
			try {
				if (fs.existsSync(tokenPath)) {
					fs.unlinkSync(tokenPath);
					console.log('Token file deleted successfully');
				}
			} catch (err) {
				console.error('Failed to delete token file:', err.message);
			}
			
			context.globalState.update('pybuddyLoggedIn', false);
			vscode.commands.executeCommand('setContext', 'pybuddyLoggedIn', false);
            classroomTreeProvider.setLoggedIn(false);
            classroomTreeProvider.setData([]);
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
		vscode.commands.registerCommand('pybuddy.preprocessFiles', async () => {
			await handleLoginFlow();
		}),
		vscode.commands.registerCommand('pybuddy.clearQuestions', () => {
			if (questionProvider._webviewView) {
				questionProvider._webviewView.webview.postMessage({ type: 'clearQuestions' });
			}
		}),
		vscode.commands.registerCommand('pybuddy.helloWorld', () => {
			vscode.window.showInformationMessage('Hello World from PyBuddy!');
		})
        // vscode.commands.registerCommand('pybuddy.showAssignmentDescription', (node) => {
        //     if (questionProvider && questionProvider._webviewView && node && node.label) {
        //         questionProvider._webviewView.webview.currentAssignmentLabel = node.label;
        //         currentAssignmentNode = node;
        //     }
        //     if (node && node.description !== undefined) {
        //         // Log the submissionState for debugging
        //         console.log('Assignment name: ', node.label, 'submissionState:', node.submissionState);
        //         let firstLine = '';
        //         // console.log(node.dueDate);
        //         // console.log(node.dueTime);
        //         if (!node.dueDate || !node.dueTime) {
        //             firstLine = '<span style="color: orange; font-weight: bold;">Due date is not mentioned</span>';
        //         } else {
        //             // Compose a JS Date object from dueDate and dueTime
        //             const due = new Date(
        //                 (node.dueDate?.year ?? 2050),
        //                 (node.dueDate?.month ?? 1) - 1, // Default to February (1), JS months are 0-based
        //                 (node.dueDate?.day ?? 1),
        //                 (node.dueTime?.hours ?? 23),
        //                 (node.dueTime?.minutes ?? 59)
        //             );
                    
		// 			// console.log(due); // TODO : CHECK IT OUT LATER
        //             const now = new Date();
        //             if (now > due) {
        //                 firstLine = '<span style="color: red; font-weight: bold;">Due date has passed</span>';
        //             } else {
        //                 // Format as 'Due: YYYY-MM-DD HH:MM'
        //                 const pad = n => n.toString().padStart(2, '0');
        //                 const dateStr = `${due.getFullYear()}-${pad(due.getMonth()+1)}-${pad(due.getDate())}`;
        //                 const timeStr = `${pad(due.getHours())}:${pad(due.getMinutes())}`;
        //                 firstLine = `<span style="font-weight: bold;">Due: ${dateStr} ${timeStr}</span>`;
        //             }
        //         }
        //         let secondLine = '';
        //         if (node.submissionState === 'TURNED_IN') {
        //             secondLine = '<span style="color: green; font-weight: bold;">Already submitted</span>';
        //         }
        //         let content = node.description;
        //         if (firstLine) {
        //             content = `${firstLine}${secondLine ? '<br>' + secondLine : ''}<br><br>${content}`;
        //         }
        //         if (questionProvider._webviewView) {
        //             questionProvider._webviewView.webview.postMessage({
        //                 type: 'showAssignmentDescription',
        //                 content: content
        //             });
        //         } else {
        //             vscode.window.showInformationMessage(node.description);
        //         }
        //     }
        // })

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
                if (!node.dueDate || !node.dueTime) {
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
                    
					// console.log(due); // TODO : CHECK IT OUT LATER
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
                let content = node.description;
                if (firstLine) {
                    content = `${firstLine}${secondLine ? '<br>' + secondLine : ''}<br><br>${content}`;
                }
                // Check if the assignment folder/file exists
                let showStart = true;
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
                } catch (err) {
                    // If any error, default to showStart = true
                }
                if (questionProvider._webviewView) {
                    questionProvider._webviewView.webview.postMessage({
                        type: 'showAssignmentDescription',
                        content: content,
                        showStart: showStart
                    });
                } else {
                    vscode.window.showInformationMessage(node.description);
                }
            }
        })
    );

    // Register the generateHints command to always use the latest assignment description
    context.subscriptions.push(
        vscode.commands.registerCommand('pybuddy.generateHints', () => {
            handleGenerateHints(chatProvider)(currentAssignmentDescription);
        })
    );

    // Register the onDidReceiveMessage handler ONCE
    function handleAssignmentWebviewMessage(msg) {
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
                    vscode.window.showInformationMessage(`Created folder: ${assignmentFolder}`);
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
            // Extract courseId, assignmentId, and assignment title
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
            vscode.window.showInformationMessage(`Submit button clicked!\nCourse ID: ${courseId}\nAssignment ID: ${assignmentId}\nAssignment Title: ${assignmentTitle}`);
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
            let userId = 'user';
            try {
                userId = await getUserName();
            } catch (err) {
                vscode.window.showWarningMessage('Could not fetch user name, using default folder.');
            }
            const safeUserId = userId.replace(/[^a-zA-Z0-9-_]/g, '_');
            const desktopPath = path.join(os.homedir(), 'Desktop');
            const gclFolder = path.join(desktopPath, `GoogleClassroomLocal_${safeUserId}`);

            const mainPyPath = path.join(gclFolder, safeCourseName, safeAssignmentName, 'main.py');
            if (fs.existsSync(mainPyPath)) {
                const mainPyUri = vscode.Uri.file(mainPyPath);
                await vscode.window.showTextDocument(mainPyUri);
            } else {
                vscode.window.showWarningMessage('main.py for this assignment does not exist.');
            }
            // Also show the question panel for this assignment
            vscode.commands.executeCommand('pybuddy.showAssignmentDescription', assignmentNode);
        })
    );
}

module.exports = { activate };
