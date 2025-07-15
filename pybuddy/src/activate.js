const vscode = require('vscode');
const path = require('path');
const fs = require('fs');

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
		}),
        vscode.commands.registerCommand('pybuddy.showAssignmentDescription', (node) => {
            if (node && node.description) {
                let firstLine = '';
                // console.log(node.dueDate);
                // console.log(node.dueTime);
                if (!node.dueDate || !node.dueTime) {
                    firstLine = '<span style="color: orange; font-weight: bold;">Due date is not mentioned</span>';
                } else {
                    // Compose a JS Date object from dueDate and dueTime
                    const due = new Date(
                        (node.dueDate?.year ?? 1970),
                        (node.dueDate?.month ?? 1) - 1, // Default to February (1), JS months are 0-based
                        (node.dueDate?.day ?? 1),
                        (node.dueTime?.hours ?? 0),
                        (node.dueTime?.minutes ?? 0)
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
                let content = node.description;
                if (firstLine) {
                    content = `${firstLine}<br><br>${content}`;
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

	vscode.window.onDidChangeActiveTextEditor(async (editor) => {
		if (editor && editor.document && editor.document.languageId === 'python') {
			await handleGenerateQuestions(questionProvider)(editor.document.uri.fsPath);
			await handleShowHints(chatProvider)(editor.document.uri.fsPath);
		}
	});
}

module.exports = { activate };
