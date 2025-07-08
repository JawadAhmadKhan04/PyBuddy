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

	const loginProvider = new LoginProvider(context.extensionUri);
	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider('pybuddy-login', loginProvider)
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
		vscode.window.showInformationMessage('Hints button clicked!');
	});

	context.subscriptions.push(disposable);
	context.subscriptions.push(showHints);
}

class LoginProvider {
	constructor(extensionUri) {
		this._extensionUri = extensionUri;
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
					// Show first dropdown menu
					(async () => {
						if (isLoading) {
							vscode.window.showWarningMessage('Please wait for the current operation to finish.');
							return;
						}
						isLoading = true;
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
									} else {
										vscode.window.showWarningMessage('Folder was created but no folder path was returned by the backend.');
									}
								} catch (error) {
									console.error('Error:', error);
									vscode.window.showErrorMessage(`Backend request failed: ${error.message}`);
								} finally {
									isLoading = false;
								}
							}
						);
					})();
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
