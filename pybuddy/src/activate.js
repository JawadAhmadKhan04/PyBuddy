const vscode = require('vscode');
const path = require('path');
const fs = require('fs');

const LoginProvider = require('./loginProvider');
const ChatProvider = require('./chatProvider');
const QuestionProvider = require('./questionProvider');

const { handleLoginFlow, handleGenerateHints, handleShowHints, handleGenerateQuestions, handleAddApiKey } = require('./backendHelpers');
const { openFolderInExplorer } = require('./fileHelpers');

function activate(context) {
	console.log('PyBuddy extension is now active!');

	const loginProvider = new LoginProvider(context.extensionUri);
	const chatProvider = new ChatProvider(context.extensionUri);
	const questionProvider = new QuestionProvider(context.extensionUri);

	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider('pybuddy-login', loginProvider),
		vscode.window.registerWebviewViewProvider('pybuddy-chat', chatProvider),
		vscode.window.registerWebviewViewProvider('pybuddy-questions', questionProvider)
	);

	// Get the addApiKey command function
	const addApiKeyCommand = handleAddApiKey(context);

	context.subscriptions.push(
		vscode.commands.registerCommand('pybuddy.login', async () => {
			vscode.window.showInformationMessage('Login pressed');
			vscode.commands.executeCommand('setContext', 'pybuddyLoggedIn', true);
			if (loginProvider._webviewView) {
				loginProvider._webviewView.webview.postMessage({ type: 'hideLogin' });
			}
		}),
		vscode.commands.registerCommand('pybuddy.logout', () => {
			vscode.commands.executeCommand('setContext', 'pybuddyLoggedIn', false);
			if (loginProvider._webviewView) {
				loginProvider._webviewView.webview.postMessage({ type: 'showLogin' });
			}
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
