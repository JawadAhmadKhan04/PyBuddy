const vscode = require('vscode');
const path = require('path');
const fs = require('fs');

const ChatProvider = require('./chatProvider');
const QuestionProvider = require('./questionProvider');
const ClassroomTreeProvider = require('./classroomTreeProvider');

const { handleLoginFlow, handleGenerateHints, handleShowHints, handleGenerateQuestions, handleAddApiKey, backendLogin, backendLogout } = require('./backendHelpers');
const { openFolderInExplorer } = require('./fileHelpers');

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
    if (wasLoggedIn) {
        classroomTreeProvider.setData([
            {
                label: 'Mathematics 101',
                children: [
                    { label: 'Assignments', children: [{ label: 'Assignment 1' }, { label: 'Assignment 2' }] },
                    { label: 'Resources', children: [{ label: 'Syllabus.pdf' }] },
                    { label: 'People', children: [{ label: 'Alice (Teacher)' }, { label: 'Bob (Student)' }] }
                ]
            },
            {
                label: 'Physics 202',
                children: [
                    { label: 'Assignments', children: [{ label: 'Assignment 1' }] },
                    { label: 'Resources', children: [{ label: 'Lab Manual.pdf' }] },
                    { label: 'People', children: [{ label: 'Dr. Brown (Teacher)' }] }
                ]
            }
        ]);
    } else {
        classroomTreeProvider.setData([]);
    }

	// Get the addApiKey command function
	const addApiKeyCommand = handleAddApiKey(context);

	context.subscriptions.push(
		vscode.commands.registerCommand('pybuddy.login', async () => {
			await backendLogin();
			context.globalState.update('pybuddyLoggedIn', true);
			vscode.commands.executeCommand('setContext', 'pybuddyLoggedIn', true);
            classroomTreeProvider.setLoggedIn(true);
            classroomTreeProvider.setData([
                {
                    label: 'Mathematics 101',
                    children: [
                        { label: 'Assignments', children: [{ label: 'Assignment 1' }, { label: 'Assignment 2' }] },
                        { label: 'Resources', children: [{ label: 'Syllabus.pdf' }] },
                        { label: 'People', children: [{ label: 'Alice (Teacher)' }, { label: 'Bob (Student)' }] }
                    ]
                },
                {
                    label: 'Physics 202',
                    children: [
                        { label: 'Assignments', children: [{ label: 'Assignment 1' }] },
                        { label: 'Resources', children: [{ label: 'Lab Manual.pdf' }] },
                        { label: 'People', children: [{ label: 'Dr. Brown (Teacher)' }] }
                    ]
                }
            ]);
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
	);

	vscode.window.onDidChangeActiveTextEditor(async (editor) => {
		if (editor && editor.document && editor.document.languageId === 'python') {
			await handleGenerateQuestions(questionProvider)(editor.document.uri.fsPath);
			await handleShowHints(chatProvider)(editor.document.uri.fsPath);
		}
	});
}

module.exports = { activate };
