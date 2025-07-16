const vscode = require('vscode');
const path = require('path');
const fs = require('fs');
const os = require('os');

const ChatProvider = require('./chatProvider');
const QuestionProvider = require('./questionProvider');
const ClassroomTreeProvider = require('./classroomTreeProvider');

const { handleLoginFlow, handleGenerateHints, handleShowHints, handleGenerateQuestions, handleAddApiKey, backendLogin, backendLogout, fetchGCRData } = require('./backendHelpers');
const { openFolderInExplorer } = require('./fileHelpers');

/**
 * Transform backend GCR data to the tree structure expected by ClassroomTreeProvider.
 * @param {Array} gcrData
 * @returns {Array}
 */
function transformGCRDataToTree(gcrData) {
    return gcrData.map(course => ({
        label: course.courseName,
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
    // On activation, if logged in, fetch GCR data
    if (wasLoggedIn) {
        (async () => {
            classroomTreeProvider.setLoading(true);
            const gcrData = await fetchGCRData();
            classroomTreeProvider.setData(transformGCRDataToTree(gcrData));
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
            const gcrData = await fetchGCRData();
            classroomTreeProvider.setData(transformGCRDataToTree(gcrData));
            classroomTreeProvider.setLoading(false);
            vscode.window.showInformationMessage('Google Classroom data refreshed!');
        }),
		vscode.commands.registerCommand('pybuddy.login', async () => {
			await backendLogin();
			context.globalState.update('pybuddyLoggedIn', true);
			vscode.commands.executeCommand('setContext', 'pybuddyLoggedIn', true);
            classroomTreeProvider.setLoggedIn(true);
            classroomTreeProvider.setLoading(true);
            // Fetch GCR data from backend
            const gcrData = await fetchGCRData();
            classroomTreeProvider.setData(transformGCRDataToTree(gcrData));
            classroomTreeProvider.setLoading(false);
		}),
		vscode.commands.registerCommand('pybuddy.logout', async () => {
			await backendLogout();
			context.globalState.update('pybuddyLoggedIn', false);
			vscode.commands.executeCommand('setContext', 'pybuddyLoggedIn', false);
            classroomTreeProvider.setLoggedIn(false);
            classroomTreeProvider.setData([]);
		}),
        vscode.commands.registerCommand('pybuddy.addApiKey', addApiKeyCommand),
		vscode.commands.registerCommand('pybuddy.showHints', handleShowHints(chatProvider)),
		vscode.commands.registerCommand('pybuddy.generateHints', handleGenerateHints(chatProvider)),
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

    // Register the command only once
    context.subscriptions.push(
        vscode.commands.registerCommand('pybuddy.showAssignmentDescription', (node) => {
            if (questionProvider && questionProvider._webviewView && node && node.label) {
                questionProvider._webviewView.webview.currentAssignmentLabel = node.label;
                currentAssignmentNode = node;
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
                if (questionProvider._webviewView) {
                    questionProvider._webviewView.webview.postMessage({
                        type: 'showAssignmentDescription',
                        content: content
                    });
                } else {
                    vscode.window.showInformationMessage(node.description);
                }
            }
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
            const folderName = currentAssignmentNode.label.replace(/[^a-zA-Z0-9-_ ]/g, '').replace(/ +/g, '_');
            const assignmentFolder = path.join(workspaceRoot, folderName);
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
            // Extract folder name from file path
            const filePath = editor.document.uri.fsPath;
            const pathParts = filePath.split(/[\\/]/);
            // Find the folder name (parent directory)
            const folderName = pathParts.length > 1 ? pathParts[pathParts.length - 2] : '';
            // TODO: Lookup the question data from the frontend's local cache using folderName
            // Example:
            // const questionData = frontendCache[folderName];
            // if (questionData) {
            //     // Display questionData in the question panel
            // }
            // No backend API call here anymore
		}
	});

    // Ensure GoogleClassroomLocal folder exists on Desktop and open it as workspace if not already
    const desktopPath = path.join(os.homedir(), 'Desktop');
    const gclFolder = path.join(desktopPath, 'GoogleClassroomLocal');
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
        }
    }
}

module.exports = { activate };
