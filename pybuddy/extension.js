// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
const vscode = require('vscode');
const path = require('path');
const fs = require('fs');

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "pybuddy" is now active!');

	// Extract login flow into a reusable function
	async function handleLoginFlow() {
		await vscode.window.withProgress(
			{
				location: vscode.ProgressLocation.Notification,
				title: 'Loading...',
				cancellable: false
			},
			async (progress) => {
				try {
					const file_path = "testing_pdfs/QuestCamp GCR assignment examples.pdf";
					// Extract the file name without extension
					const fileName = file_path.split('/').pop();  // "QuestCamp GCR assignment examples.pdf"
					const folder_name = fileName.substring(0, fileName.lastIndexOf('.'));
					console.log(folder_name); // Output: QuestCamp GCR assignment examples
					const file_creation_method = "Create files on auto"
					const endpoint = "http://127.0.0.1:8000/preprocessing_file"
					const requestBody = {
						file_path: file_path,
						folder_name: folder_name,
						file_creation_method: file_creation_method
					}
					const response = await fetch(endpoint, {
						method: 'POST',
						headers: {
							'Content-Type': 'application/json',
						},
						body: JSON.stringify(requestBody)
					});
					if (!response.ok) {
						throw new Error(`Backend returned status ${response.status}`);
					}
					const data = await response.json();
					if (data.folder_path) {
						vscode.window.showInformationMessage('Folder path: ' + data.folder_path);
						await openFolderInExplorer(data.folder_path);
					} else if (data.error) {
						vscode.window.showErrorMessage('Error: ' + data.error);
					} else {
						vscode.window.showWarningMessage('Folder was created but no folder path was returned by the backend.');
					}
				} catch (error) {
					console.error('Error:', error);
					vscode.window.showErrorMessage(`Backend request failed: ${error.message}`);
				}
			}
		);
	}

	const loginProvider = new LoginProvider(context.extensionUri, handleLoginFlow);
	const chatProvider = new ChatProvider(context.extensionUri);
	const questionProvider = new QuestionProvider(context.extensionUri);
	
	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider('pybuddy-login', loginProvider)
	);
	
	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider('pybuddy-chat', chatProvider)
	);
	
	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider('pybuddy-questions', questionProvider)
	);

	// Register the login command for the title bar
	context.subscriptions.push(
		vscode.commands.registerCommand('pybuddy.login', () => {
			vscode.commands.executeCommand('setContext', 'pybuddyLoggedIn', true);
			// Tell the webview to hide the login button
			if (loginProvider._webviewView) {
				loginProvider._webviewView.webview.postMessage({ type: 'hideLogin' });
			}
			// Trigger the same login flow as the webview login button
			handleLoginFlow();
		})
	);

	// Register the add API key command for the title bar
	context.subscriptions.push(
		vscode.commands.registerCommand('pybuddy.addApiKey', async () => {
			const apiKey = await vscode.window.showInputBox({
				prompt: 'Enter your Gemini API Key',
				password: true, // Hide the input for security
				placeHolder: 'AIzaSyC...',
				validateInput: (input) => {
					if (!input || input.trim() === '') {
						return 'API Key cannot be empty';
					}
					if (input.length < 10) {
						return 'API Key seems too short';
					}
					return null; // Valid input
				}
			});

			if (apiKey) {
				// Store the API key in global state for persistence
				context.globalState.update('pybuddy.geminiApiKey', apiKey);

				// Send the API key to the backend
				try {
					const response = await fetch('http://127.0.0.1:8000/add_api_key', {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({ api_key: apiKey })
					});
					if (!response.ok) {
						throw new Error(`Backend returned status ${response.status}`);
					}
					const data = await response.json();
					vscode.window.showInformationMessage(data.message || 'API key sent to backend successfully!');
				} catch (error) {
					vscode.window.showErrorMessage('Failed to send API key to backend: ' + error.message);
				}
			}
		})
	);

	// Register the logout command for the title bar
	context.subscriptions.push(
		vscode.commands.registerCommand('pybuddy.logout', () => {
			vscode.commands.executeCommand('setContext', 'pybuddyLoggedIn', false);
			// Tell the webview to show the login button again
			if (loginProvider._webviewView) {
				loginProvider._webviewView.webview.postMessage({ type: 'showLogin' });
			}
		})
	);

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with  registerCommand
	// The commandId parameter must match the command field in package.json
	const disposable = vscode.commands.registerCommand('pybuddy.helloWorld', function () {
		// The code you place here will be executed every time your command is executed

		// Display a message box to the user
		vscode.window.showInformationMessage('Hello World from PyBuddy!');
	});

	// let selectedSpecificHints = [];

	// // Load saved hints from globalState
	// selectedSpecificHints = context.globalState.get('pybuddy.selectedSpecificHints', []);
	// if (selectedSpecificHints.length > 0) {
	// 	vscode.window.showInformationMessage(`Previously chosen specific hints: ${selectedSpecificHints.join(', ')}`);
	// } else {
	// 	vscode.window.showInformationMessage('No specific hints previously chosen.');
	// }

	let showHints = vscode.commands.registerCommand('pybuddy.showHints', async function () {
		await generateHintsForFile();
	});

	// Placeholder for the file location to generate hints for
	// const fileLocationForHints = "testing_pdfs/QuestCamp GCR assignment examples.pdf";

	async function generateHintsForFile() {
		const activeEditor = vscode.window.activeTextEditor;
		if (activeEditor) {
			fileLocationForHints = activeEditor.document.uri.fsPath;
			// vscode.window.showInformationMessage("Currently active file:", fileLocationForHints);
			try {
			const endpoint = "http://127.0.0.1:8000/generate_hints";
			const requestBody = { file_path: fileLocationForHints };
			const response = await fetch(endpoint, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(requestBody)
			});
			if (!response.ok) {
				throw new Error(`Backend returned status ${response.status}`);
			}
			const data = await response.json();
			console.log(data.hint)

			if (data.hint) {
				// Send hint to chat interface
				if (chatProvider._webviewView) {
					// Extract folder path from file path
					const filePath = activeEditor.document.uri.fsPath;
					const pathParts = filePath.split('\\');
					const fileNameIndex = pathParts.findIndex(part => part.startsWith('question_'));
					if (fileNameIndex > 0) {
						const folderPath = pathParts.slice(fileNameIndex - 1, fileNameIndex + 1).join('\\');
						const hintMessage = `💡 Hint for ${folderPath}\n\nTopic: ${data.hint.hint_topic}\n\n${data.hint.hint_text}`;
						chatProvider._webviewView.webview.postMessage({ 
							type: 'hint', 
							content: hintMessage 
						});
					} else {
						// Fallback to just the filename if path structure is different
						const hintMessage = `💡 Hint for ${activeEditor.document.fileName.split('/').pop()}\n\nTopic: ${data.hint.hint_topic}\n\n${data.hint.hint_text}`;
						chatProvider._webviewView.webview.postMessage({ 
							type: 'hint', 
							content: hintMessage 
						});
					}
				}
				vscode.window.showInformationMessage('Hint sent to chat!');
			}else {
				vscode.window.showWarningMessage('No hint returned by backend.');
			}
		} catch (error) {
			vscode.window.showErrorMessage('Failed to generate hints: ' + error.message);
		}
			// Example: send it to webview
			// webviewView.webview.postMessage({ type: 'activeFile', path: activeFilePath });
		} else {
			vscode.window.showInformationMessage("No active editor (no file is open).");
		}
		
		
	}

	async function generateQuestionsForFile() {
		const activeEditor = vscode.window.activeTextEditor;
		if (activeEditor) {
			const filePath = activeEditor.document.uri.fsPath;
			try {
				const endpoint = "http://127.0.0.1:8000/get_question";
				const requestBody = { file_path: filePath };
				const response = await fetch(endpoint, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(requestBody)
				});
				if (!response.ok) {
					throw new Error(`Backend returned status ${response.status}`);
				}
				const data = await response.json();
				console.log(data);

				if (data.question_text || data.instructions || data.links) {
					// Send question to question interface
					if (questionProvider._webviewView) {
						// Extract folder path from file path
						const pathParts = filePath.split('\\');
						const fileNameIndex = pathParts.findIndex(part => part.startsWith('question_'));
						if (fileNameIndex > 0) {
							const folderPath = pathParts.slice(fileNameIndex - 1, fileNameIndex + 1).join('\\');
							
							let questionMessage = `📋 Assignment: ${folderPath.replace("📋 Question for ", "").split("\\").slice(0, -1).join("\\")} - ${folderPath.split("\\").pop()}\n\n`;
							
							if (data.question_text) {
								questionMessage += `**Question:**\n${data.question_text}\n\n`;
							}
							
							if (data.instructions) {
								questionMessage += `**Instructions:**\n${data.instructions}`;
							}
							
							if (data.links) {
								questionMessage += `**Links:**\n${data.links}`;
							}
							
							questionProvider._webviewView.webview.postMessage({ 
								type: 'question', 
								content: questionMessage 
							});
						} else {
							// Fallback to just the filename if path structure is different
							let questionMessage = `📋 Question for ${activeEditor.document.fileName.split('/').pop()}\n\n`;
							
							if (data.question_text) {
								questionMessage += `**Question:**\n${data.question_text}\n\n`;
							}
							
							if (data.instructions) {
								questionMessage += `**Instructions:**\n${data.instructions}`;
							}
							
							questionProvider._webviewView.webview.postMessage({ 
								type: 'question', 
								content: questionMessage 
							});
						}
					}
					vscode.window.showInformationMessage('Question sent to questions panel!');
				} else {
					vscode.window.showWarningMessage('No question returned by backend.');
				}
			} catch (error) {
				vscode.window.showErrorMessage('Failed to generate questions: ' + error.message);
			}
		} else {
			vscode.window.showInformationMessage("No active editor (no file is open).");
		}
	}


	// Register the generateHints command
	let generateHintsCmd = vscode.commands.registerCommand('pybuddy.generateHints', async function () {
		await generateHintsForFile();
	});

	// Register the clearHints command
	let clearHintsCmd = vscode.commands.registerCommand('pybuddy.clearHints', function () {
		if (chatProvider._webviewView) {
			chatProvider._webviewView.webview.postMessage({ type: 'clearChat' });
		}
	});

	// Register the showQuestions command
	let showQuestionsCmd = vscode.commands.registerCommand('pybuddy.showQuestions', async function () {
		await generateQuestionsForFile();
	});

	// Register the clearQuestions command
	let clearQuestionsCmd = vscode.commands.registerCommand('pybuddy.clearQuestions', function () {
		if (questionProvider._webviewView) {
			questionProvider._webviewView.webview.postMessage({ type: 'clearQuestions' });
		}
	});

	context.subscriptions.push(disposable);
	context.subscriptions.push(showHints);
	context.subscriptions.push(generateHintsCmd);
	context.subscriptions.push(clearHintsCmd);
	context.subscriptions.push(showQuestionsCmd);
	context.subscriptions.push(clearQuestionsCmd);

	// Auto-update Questions sidebar on file change
	vscode.window.onDidChangeActiveTextEditor(async (editor) => {
		if (editor && editor.document && editor.document.languageId === 'python') {
			await generateQuestionsForFile();
		}
	});
}

class LoginProvider {
	constructor(extensionUri, handleLoginFlow) {
		this._extensionUri = extensionUri;
		this._handleLoginFlow = handleLoginFlow;
		this._webviewView = null;
	}

			resolveWebviewView(webviewView) {
		this._webviewView = webviewView;
		webviewView.webview.options = {
			enableScripts: true,
			localResourceRoots: [vscode.Uri.joinPath(this._extensionUri, 'webview')]
		};

		webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

		let isLoading = false;

		webviewView.webview.onDidReceiveMessage(async data => {
			switch (data.type) {
				case 'login':
					// vscode.window.showInformationMessage('Login Pressed');
					vscode.commands.executeCommand('setContext', 'pybuddyLoggedIn', true);
					// Hide the login button in the webview
					webviewView.webview.postMessage({ type: 'hideLogin' });
					// Trigger the login flow
					if (isLoading) {
						vscode.window.showWarningMessage('Please wait for the current operation to finish.');
						return;
					}
					isLoading = true;
					await this._handleLoginFlow();
					isLoading = false;
					break;
				case 'logout':
					vscode.window.showInformationMessage('Logout Pressed');
					vscode.commands.executeCommand('setContext', 'pybuddyLoggedIn', false);
					// Show the login button in the webview
					webviewView.webview.postMessage({ type: 'showLogin' });
					break;
			}
		});
	}

	_getHtmlForWebview(webview) {
		const webviewFolder = vscode.Uri.joinPath(this._extensionUri, 'webview');
		const htmlPath = vscode.Uri.joinPath(webviewFolder, 'login.html');
		const cssPath = vscode.Uri.joinPath(webviewFolder, 'login.css');
		const jsPath = vscode.Uri.joinPath(webviewFolder, 'login.js');

		let html = fs.readFileSync(htmlPath.fsPath, 'utf8');
		const cssUri = webview.asWebviewUri(cssPath);
		const jsUri = webview.asWebviewUri(jsPath);

		html = html.replace('href="login.css"', `href="${cssUri}"`);
		html = html.replace('src="login.js"', `src="${jsUri}"`);

		return html;
	}
}

class ChatProvider {
	constructor(extensionUri) {
		this._extensionUri = extensionUri;
		this._webviewView = null;
		this._messages = [];
	}

	resolveWebviewView(webviewView) {
		this._webviewView = webviewView;
		webviewView.webview.options = {
			enableScripts: true,
			localResourceRoots: [vscode.Uri.joinPath(this._extensionUri, 'webview')]
		};

		webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

		webviewView.webview.onDidReceiveMessage(async data => {
			switch (data.type) {
				case 'saveMessages':
					this._messages = data.messages;
					break;
				case 'loadMessages':
					// Send saved messages back to webview
					webviewView.webview.postMessage({
						type: 'loadMessages',
						messages: this._messages
					});
					break;
				case 'chatCleared':
					this._messages = [];
					break;
			}
		});
	}



	_getHtmlForWebview(webview) {
		const webviewFolder = vscode.Uri.joinPath(this._extensionUri, 'webview');
		const htmlPath = vscode.Uri.joinPath(webviewFolder, 'chat.html');
		const cssPath = vscode.Uri.joinPath(webviewFolder, 'chat.css');
		const jsPath = vscode.Uri.joinPath(webviewFolder, 'chat.js');

		let html = fs.readFileSync(htmlPath.fsPath, 'utf8');
		const cssUri = webview.asWebviewUri(cssPath);
		const jsUri = webview.asWebviewUri(jsPath);

		html = html.replace('href="chat.css"', `href="${cssUri}"`);
		html = html.replace('src="chat.js"', `src="${jsUri}"`);

		return html;
	}
}

class QuestionProvider {
	constructor(extensionUri) {
		this._extensionUri = extensionUri;
		this._webviewView = null;
		this._questions = [];
	}

	resolveWebviewView(webviewView) {
		this._webviewView = webviewView;
		webviewView.webview.options = {
			enableScripts: true,
			localResourceRoots: [vscode.Uri.joinPath(this._extensionUri, 'webview')]
		};

		webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

		webviewView.webview.onDidReceiveMessage(async data => {
			switch (data.type) {
				case 'saveQuestions':
					this._questions = data.questions;
					break;
				case 'loadQuestions':
					// Send saved questions back to webview
					webviewView.webview.postMessage({
						type: 'loadQuestions',
						questions: this._questions
					});
					break;
				case 'questionsCleared':
					this._questions = [];
					break;
			}
		});
	}

	_getHtmlForWebview(webview) {
		const webviewFolder = vscode.Uri.joinPath(this._extensionUri, 'webview');
		const htmlPath = vscode.Uri.joinPath(webviewFolder, 'question.html');
		const cssPath = vscode.Uri.joinPath(webviewFolder, 'question.css');
		const jsPath = vscode.Uri.joinPath(webviewFolder, 'question.js');

		let html = fs.readFileSync(htmlPath.fsPath, 'utf8');
		const cssUri = webview.asWebviewUri(cssPath);
		const jsUri = webview.asWebviewUri(jsPath);

		html = html.replace('href="question.css"', `href="${cssUri}"`);
		html = html.replace('src="question.js"', `src="${jsUri}"`);

		return html;
	}
}

// Helper function to open folder in Explorer
async function openFolderInExplorer(folderPath) {
    try {
        const uri = vscode.Uri.file(folderPath);
        // If no folder is open, open this folder as the workspace
        await vscode.commands.executeCommand('vscode.openFolder', uri, false);
		vscode.window.showInformationMessage("Opening folder");

    } catch (err) {
        vscode.window.showErrorMessage('Could not open folder: ' + err.message);
    }
}

// This method is called when your extension is deactivated
function deactivate() {}

module.exports = {
	activate,
	deactivate
}
